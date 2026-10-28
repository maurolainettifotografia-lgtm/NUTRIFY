"""MongoDB integration tests: opt in with NUTRIFY_TEST_MONGO, synthetic isolated databases only."""
import asyncio
import os
import uuid
from pathlib import Path
import json
import re
import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
os.environ.setdefault('MONGO_URL', 'mongodb://127.0.0.1:27039')
os.environ.setdefault('DB_NAME', 'nutrify_audit_tests')
import server
from strava_integration import normalize_activity, StravaIntegration


def payload(**changes):
    return server.SessionInput(**{
        'request_id': 'audit_123456789012345', 'routine_name': 'Treino sintético',
        'duration_min': 30, 'exercises': [{'name': 'Supino reto com barra', 'muscle_group': 'peito',
            'sets': [{'reps': 10, 'weight_kg': 20, 'done': True}]}], **changes})


def mongo_case(monkeypatch, action):
    if not os.environ.get('NUTRIFY_TEST_MONGO'):
        pytest.skip('Set NUTRIFY_TEST_MONGO to an isolated test MongoDB')
    async def run():
        client = AsyncIOMotorClient(os.environ['NUTRIFY_TEST_MONGO'], serverSelectionTimeoutMS=3000)
        db = client['nutrify_audit_' + uuid.uuid4().hex]
        monkeypatch.setattr(server, 'db', db)
        try:
            await action(db)
        finally:
            await client.drop_database(db.name)
            client.close()
    asyncio.run(run())


def test_retry_and_concurrent_submissions_count_once(monkeypatch):
    async def check(db):
        responses = await asyncio.gather(*[server.create_session(payload(), {'user_id': 'test'}) for _ in range(8)])
        assert len({r['id'] for r in responses}) == 1
        assert all('request_fingerprint' not in r for r in responses)
        assert await db.workout_sessions.count_documents({}) == 1
        assert await db.workouts.count_documents({}) == 1
        assert await server.day_workout_calories('test', server.today_str()) == responses[0]['calories_burned']
        # A Strava copy of the same workout must not enter the diary's calorie ledger.
        await db.strava_activities.insert_one({'user_id':'test','date':server.today_str(),'calories':500})
        assert await server.day_workout_calories('test', server.today_str()) == responses[0]['calories_burned']
    mongo_case(monkeypatch, check)


def test_retry_repairs_missing_secondary_calorie_write(monkeypatch):
    async def check(db):
        first = await server.create_session(payload(), {'user_id': 'test'})
        await db.workouts.delete_one({'id': first['workout_id']})  # simulate crash after session insert
        # New client object simulates server restart; MongoDB remains canonical.
        client2=AsyncIOMotorClient(os.environ['NUTRIFY_TEST_MONGO'])
        try:
            monkeypatch.setattr(server,'db',client2[db.name])
            second=await server.create_session(payload(), {'user_id':'test'})
            assert {k:v for k,v in second.items() if k != "created_at"} == {k:v for k,v in first.items() if k != "created_at"}
            assert await db.workouts.count_documents({}) == 1
        finally: client2.close()
    mongo_case(monkeypatch, check)


def test_conflicting_retry_and_deleted_retry_rejected(monkeypatch):
    async def check(db):
        first=await server.create_session(payload(), {'user_id':'test'})
        with pytest.raises(HTTPException) as error:
            await server.create_session(payload(duration_min=31), {'user_id':'test'})
        assert error.value.status_code==409
        await server.delete_session(first['id'], {'user_id':'test'})
        with pytest.raises(HTTPException):
            await server.create_session(payload(), {'user_id':'test'})
        assert await server.day_workout_calories('test',server.today_str()) == 0
    mongo_case(monkeypatch, check)


def test_request_keys_are_scoped_to_user(monkeypatch):
    async def check(db):
        a=await server.create_session(payload(), {'user_id':'a'})
        b=await server.create_session(payload(), {'user_id':'b'})
        assert a['id'] != b['id'] and await db.workouts.count_documents({}) == 2
    mongo_case(monkeypatch, check)


def test_strava_units_and_unknown_calories():
    source={'id':123,'name':'Synthetic','start_date':'2026-10-28T15:00:00Z','start_date_local':'2026-10-28T12:00:00Z','moving_time':1800,'distance':5000,'sport_type':'Run'}
    item=normalize_activity(source)
    assert item['duration_min']==30 and item['distance_km']==5 and item['calories'] is None


def test_global_rate_limit_does_not_report_success():
    import time
    async def check():
        integration=StravaIntegration(None)
        integration.global_retry=time.time()+60
        assert await integration.sync('test',force=True) is False
    asyncio.run(check())


@pytest.mark.parametrize('status',[401,403,429,500])
def test_strava_error_classification_keeps_forbidden_distinct(monkeypatch,status):
    import httpx
    class FakeClient:
        def __init__(self,**kw): pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def request(self,*args,**kw):return httpx.Response(status,request=httpx.Request('GET','https://www.strava.com/api/v3/athlete/activities'))
    monkeypatch.setattr(httpx,'AsyncClient',FakeClient)
    integration=StravaIntegration(None)
    with pytest.raises(HTTPException) as error:
        asyncio.run(integration.request('GET','https://www.strava.com/api/v3/athlete/activities'))
    assert error.value.status_code == (502 if status==500 else status)
    if status==429: assert integration.global_retry>0


def test_strava_refresh_rotates_both_tokens_encrypted(monkeypatch):
    from cryptography.fernet import Fernet
    import strava_integration
    import time
    cipher=Fernet(Fernet.generate_key())
    monkeypatch.setattr(strava_integration,'settings',lambda:('test-client','test-secret','https://example.test',cipher))
    async def check(db):
        connection={'user_id':'test','access_token':cipher.encrypt(b'old-access').decode(),'refresh_token':cipher.encrypt(b'old-refresh').decode(),'expires_at':0}
        await db.strava_connections.insert_one(connection)
        integration=StravaIntegration(db)
        async def fake_request(method,url,**kwargs):
            assert kwargs['data']['refresh_token']=='old-refresh'
            return {'access_token':'new-access','refresh_token':'new-refresh','expires_at':int(time.time())+3600}
        monkeypatch.setattr(integration,'request',fake_request)
        assert await integration.token(connection)=='new-access'
        saved=await db.strava_connections.find_one({'user_id':'test'})
        assert cipher.decrypt(saved['refresh_token'].encode())==b'new-refresh'
        assert saved['access_token']!='new-access' and saved['refresh_token']!='new-refresh'
    mongo_case(monkeypatch,check)


def test_calorie_sum_does_not_truncate_after_100_records(monkeypatch):
    async def check(db):
        await db.workouts.insert_many([{'user_id':'test','date':server.today_str(),'calories':10,'deleted_at':None} for _ in range(101)])
        assert await server.day_workout_calories('test',server.today_str())==1010
    mongo_case(monkeypatch,check)

def test_stale_retry_cannot_resurrect_calories_after_concurrent_delete(monkeypatch):
    async def check(db):
        first=await server.create_session(payload(), {'user_id':'test'})
        stale=await db.workout_sessions.find_one({'id':first['id']})
        await server.delete_session(first['id'], {'user_id':'test'})
        # In-flight request retains the pre-delete snapshot and reaches its secondary write last.
        await db.workouts.delete_one({'id':first['workout_id']})
        with pytest.raises(HTTPException) as error:
            await server._ensure_session_calories(stale)
        assert error.value.status_code==409
        assert await server.day_workout_calories('test',server.today_str())==0
    mongo_case(monkeypatch,check)
