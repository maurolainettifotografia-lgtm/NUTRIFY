"""Strava: OAuth, cache privado de atividades e sincronização, isolados da IA/metas."""
import asyncio
import hashlib
import hmac
import math
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

API = 'https://www.strava.com/api/v3'
OAUTH = 'https://www.strava.com/oauth'
SCOPE = 'activity:read_all'
CACHE_DAYS = 7
INTERVAL = 15 * 60


def now():
    return datetime.now(timezone.utc)


def settings():
    keys = ('STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_TOKEN_KEY', 'STRAVA_PUBLIC_URL')
    if not all(os.environ.get(k, '').strip() for k in keys):
        raise HTTPException(503, 'Conexão Strava em preparação. O responsável precisa concluir o cadastro da integração.')
    url = os.environ['STRAVA_PUBLIC_URL'].rstrip('/')
    if not url.startswith('https://'):
        raise HTTPException(503, 'A conexão Strava exige HTTPS.')
    try:
        cipher = Fernet(os.environ['STRAVA_TOKEN_KEY'].encode())
    except (ValueError, TypeError):
        raise HTTPException(503, 'Configuração de segurança do Strava inválida.')
    return os.environ['STRAVA_CLIENT_ID'], os.environ['STRAVA_CLIENT_SECRET'], url, cipher


def configured():
    try:
        settings()
        return True
    except HTTPException:
        return False


def normalize_activity(activity):
    """Sem coordenadas, frequência cardíaca, perfil ou calorias inventadas."""
    ident = int(activity['id'])
    start = datetime.fromisoformat(activity['start_date'].replace('Z', '+00:00'))
    if start.tzinfo is None:
        raise ValueError('Atividade sem fuso horário')
    calories = activity.get('calories')
    if isinstance(calories, bool) or not isinstance(calories, (int, float)) or not math.isfinite(calories) or calories < 0:
        calories = None
    return {
        'activity_id': ident, 'name': str(activity.get('name') or 'Atividade')[:200],
        'sport_type': str(activity.get('sport_type') or activity.get('type') or 'Workout')[:60],
        'start_date': start, 'date': str(activity.get('start_date_local') or activity['start_date'])[:10],
        'duration_min': round(max(0, float(activity.get('moving_time') or 0)) / 60, 1),
        'distance_km': round(max(0, float(activity.get('distance') or 0)) / 1000, 2),
        'calories': round(calories) if calories is not None else None,
        'source': 'strava', 'fetched_at': now(), 'expires_at': now() + timedelta(days=CACHE_DAYS),
    }


class StravaIntegration:
    def __init__(self, db):
        self.db = db
        self.global_retry = 0.0

    async def indexes(self):
        await self.db.strava_connections.create_index('user_id', unique=True)
        await self.db.strava_connections.create_index('athlete_id', unique=True)
        await self.db.strava_states.create_index('expires_at', expireAfterSeconds=0)
        await self.db.strava_activities.create_index([('user_id', 1), ('activity_id', 1)], unique=True)
        await self.db.strava_activities.create_index('expires_at', expireAfterSeconds=0)

    async def forget(self, uid):
        await self.db.strava_connections.delete_one({'user_id': uid})
        await self.db.strava_activities.delete_many({'user_id': uid})
        await self.db.strava_states.delete_many({'user_id': uid})

    async def request(self, method, url, **kwargs):
        async with httpx.AsyncClient(timeout=httpx.Timeout(25, connect=10), follow_redirects=False) as client:
            response = await client.request(method, url, **kwargs)
        if response.status_code == 429:
            # Respeita também a cota compartilhada pelo aplicativo.
            self.global_retry = time.time() + 15 * 60
            raise HTTPException(429, 'Limite do Strava atingido. A sincronização tentará novamente mais tarde.')
        if response.status_code in (401, 403):
            raise HTTPException(401, 'Reconecte sua conta Strava para continuar.')
        if response.status_code == 404:
            return None
        if not response.is_success:
            raise HTTPException(502, 'O Strava não respondeu. Tente novamente mais tarde.')
        return response.json()

    async def token(self, connection):
        client_id, secret, _, cipher = settings()
        try:
            if connection.get('expires_at', 0) > time.time() + 60:
                return cipher.decrypt(connection['access_token'].encode()).decode()
            refresh = cipher.decrypt(connection['refresh_token'].encode()).decode()
        except (InvalidToken, KeyError):
            raise HTTPException(401, 'Reconecte sua conta Strava.')
        data = await self.request('POST', OAUTH + '/token', data={
            'client_id': client_id, 'client_secret': secret, 'grant_type': 'refresh_token', 'refresh_token': refresh,
        })
        encrypted = {k: cipher.encrypt(data[k].encode()).decode() for k in ('access_token', 'refresh_token')}
        encrypted['expires_at'] = data['expires_at']
        # Não recria conexão se o usuário tiver desconectado durante a requisição.
        updated = await self.db.strava_connections.update_one({'_id': connection['_id']}, {'$set': encrypted})
        if not updated.matched_count:
            raise HTTPException(401, 'Conta Strava desconectada.')
        return data['access_token']

    async def sync(self, uid, force=False):
        if time.time() < self.global_retry:
            return
        current = now()
        lease = secrets.token_hex(16)
        query = {'user_id': uid, 'retry_at': {'$lte': current}, '$or': [
            {'lease_until': {'$lte': current}}, {'lease_until': {'$exists': False}},
        ]}
        if not force:
            query['next_sync'] = {'$lte': current}
        connection = await self.db.strava_connections.find_one_and_update(query, {'$set': {
            'lease_until': current + timedelta(minutes=5), 'lease': lease,
        }}, return_document=ReturnDocument.AFTER)
        if not connection:
            return
        try:
            token = await self.token(connection)
            cutoff = current - timedelta(days=CACHE_DAYS)
            seen = []
            complete = False
            for page in range(1, 5):
                activities = await self.request('GET', API + '/athlete/activities', headers={'Authorization': 'Bearer ' + token},
                    params={'after': int(cutoff.timestamp()), 'per_page': 50, 'page': page})
                for summary in activities:
                    ident = int(summary['id'])
                    activity = await self.request('GET', API + f'/activities/{ident}', headers={'Authorization': 'Bearer ' + token})
                    if not activity:
                        await self.db.strava_activities.delete_one({'user_id': uid, 'activity_id': ident})
                        continue
                    if int(activity.get('athlete', {}).get('id', 0)) != connection['athlete_id']:
                        continue
                    doc = normalize_activity(activity)
                    if doc['start_date'] < cutoff:
                        continue
                    # Consulta a conexão imediatamente antes de escrever; desconexões também removem o cache.
                    active = await self.db.strava_connections.find_one({'_id': connection['_id'], 'lease': lease})
                    if not active:
                        return
                    doc['user_id'] = uid
                    await self.db.strava_activities.update_one({'user_id': uid, 'activity_id': ident}, {'$set': doc}, upsert=True)
                    seen.append(ident)
                if len(activities) < 50:
                    complete = True
                    break
            if complete:
                await self.db.strava_activities.delete_many({'user_id': uid, 'activity_id': {'$nin': seen}})
            await self.db.strava_connections.update_one({'_id': connection['_id'], 'lease': lease}, {'$set': {
                'last_sync': now(), 'next_sync': now() + timedelta(seconds=INTERVAL), 'retry_at': now(),
                'sync_error': None, 'lease_until': now(),
            }})
        except HTTPException as error:
            if error.status_code == 401:
                await self.forget(uid)
                return
            await self.db.strava_connections.update_one({'_id': connection['_id'], 'lease': lease}, {'$set': {
                'sync_error': error.detail, 'retry_at': now() + timedelta(minutes=15), 'lease_until': now(),
            }})
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            await self.db.strava_connections.update_one({'_id': connection['_id'], 'lease': lease}, {'$set': {
                'sync_error': 'Sincronização incompleta. Uma nova tentativa será feita automaticamente.',
                'retry_at': now() + timedelta(minutes=15), 'lease_until': now(),
            }})
        finally:
            if not await self.db.strava_connections.find_one({'user_id': uid}):
                await self.db.strava_activities.delete_many({'user_id': uid})

    async def worker(self):
        while True:
            try:
                if configured():
                    due = await self.db.strava_connections.find({'next_sync': {'$lte': now()}, 'retry_at': {'$lte': now()}}, {'user_id': 1}).limit(5).to_list(5)
                    for connection in due:
                        await self.sync(connection['user_id'])
            except asyncio.CancelledError:
                raise
            except Exception:
                # Nunca registra tokens, payloads ou dados Strava nos logs.
                pass
            await asyncio.sleep(30)

    def install(self, router, get_user):
        @router.get('/strava/status')
        async def status(user=Depends(get_user)):
            uid = user['user_id']
            connection = await self.db.strava_connections.find_one({'user_id': uid})
            return {'configured': configured(), 'connected': bool(connection), 'last_sync': connection.get('last_sync') if connection else None,
                    'sync_error': connection.get('sync_error') if connection else None, 'automatic_interval_minutes': 15}

        @router.post('/strava/connect')
        async def connect(user=Depends(get_user)):
            client_id, _, url, _ = settings()
            state = secrets.token_urlsafe(32)
            await self.db.strava_states.insert_one({'_id': hashlib.sha256(state.encode()).hexdigest(),
                'user_id': user['user_id'], 'expires_at': now() + timedelta(minutes=10)})
            return {'url': OAUTH + '/mobile/authorize?' + urlencode({'client_id': client_id, 'redirect_uri': url + '/api/strava/callback',
                'response_type': 'code', 'approval_prompt': 'auto', 'scope': SCOPE, 'state': state})}

        @router.get('/strava/callback', include_in_schema=False)
        async def callback(state: str = '', code: str = '', scope: str = '', error: str = ''):
            _, _, _, cipher = settings()
            pending = await self.db.strava_states.find_one_and_delete({'_id': hashlib.sha256(state.encode()).hexdigest(), 'expires_at': {'$gt': now()}})
            if not pending:
                raise HTTPException(400, 'Autorização expirada. Inicie novamente pelo Nutrify.')
            if error or not code or not ({'activity:read', 'activity:read_all'} & set(scope.split(','))):
                return HTMLResponse('<h1>Strava não conectado</h1><p>Você pode tentar novamente pelo Nutrify.</p><a href="nutrify://strava">Voltar ao Nutrify</a>')
            client_id, secret, _, _ = settings()
            data = await self.request('POST', OAUTH + '/token', data={'client_id': client_id, 'client_secret': secret, 'code': code, 'grant_type': 'authorization_code'})
            uid = pending['user_id']
            if not await self.db.users.find_one({'user_id': uid}):
                raise HTTPException(400, 'Conta Nutrify indisponível.')
            athlete = int(data['athlete']['id'])
            old = await self.db.strava_connections.find_one({'user_id': uid})
            if old and old['athlete_id'] != athlete:
                raise HTTPException(409, 'Desconecte o Strava atual antes de conectar outra conta.')
            try:
                await self.db.strava_connections.update_one({'user_id': uid}, {'$set': {
                    'athlete_id': athlete, 'access_token': cipher.encrypt(data['access_token'].encode()).decode(),
                    'refresh_token': cipher.encrypt(data['refresh_token'].encode()).decode(), 'expires_at': data['expires_at'],
                    'scope': scope, 'next_sync': now(), 'retry_at': now(), 'lease_until': now(), 'sync_error': None,
                }}, upsert=True)
            except DuplicateKeyError:
                raise HTTPException(409, 'Esta conta Strava já está conectada a outro cadastro Nutrify.')
            return HTMLResponse('<!doctype html><meta name="viewport" content="width=device-width"><h1>Strava conectado</h1><p>Os treinos recentes serão sincronizados automaticamente.</p><a href="nutrify://strava">Voltar ao Nutrify</a>', headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})

        @router.post('/strava/sync')
        async def sync_now(user=Depends(get_user)):
            connection = await self.db.strava_connections.find_one({'user_id': user['user_id']})
            if not connection:
                raise HTTPException(409, 'Conecte sua conta Strava primeiro.')
            last = connection.get('last_sync')
            if last and (now() - last.replace(tzinfo=timezone.utc)).total_seconds() < 60:
                return {'ok': True, 'cached': True}
            # A fila é persistente: reiniciar o servidor não perde o pedido.
            await self.db.strava_connections.update_one({'user_id': user['user_id']}, {'$set': {'next_sync': now()}})
            await self.sync(user['user_id'], force=True)
            return {'ok': True}

        @router.get('/strava/activities')
        async def activities(user=Depends(get_user)):
            # Nenhum desses registros é misturado aos treinos Nutrify ou enviado à IA.
            if not await self.db.strava_connections.find_one({'user_id': user['user_id']}):
                return {'results': [], 'cache_days': CACHE_DAYS}
            results = await self.db.strava_activities.find({'user_id': user['user_id'], 'expires_at': {'$gt': now()},
                'start_date': {'$gt': now() - timedelta(days=CACHE_DAYS)}}, {'_id': 0, 'user_id': 0}).sort('start_date', -1).limit(200).to_list(200)
            return {'results': results, 'cache_days': CACHE_DAYS}

        @router.delete('/strava/connection')
        async def disconnect(user=Depends(get_user)):
            uid = user['user_id']
            connection = await self.db.strava_connections.find_one({'user_id': uid})
            remote_revoked = not bool(connection)
            try:
                if connection:
                    token = await self.token(connection)
                    await self.request('POST', OAUTH + '/deauthorize', data={'access_token': token})
                    remote_revoked = True
            except (HTTPException, httpx.HTTPError):
                pass
            finally:
                await self.forget(uid)
            return {'ok': True, 'remote_revoked': remote_revoked, 'message': 'Dados importados excluídos do Nutrify.'}

        @router.get('/strava/webhook/{hook_secret}', include_in_schema=False)
        async def verify_hook(hook_secret: str, request: Request):
            expected = os.environ.get('STRAVA_WEBHOOK_SECRET', '')
            verify = os.environ.get('STRAVA_VERIFY_TOKEN', '')
            q = request.query_params
            if not expected or not verify or not hmac.compare_digest(hook_secret, expected) or not hmac.compare_digest(q.get('hub.verify_token', ''), verify) or q.get('hub.mode') != 'subscribe':
                raise HTTPException(403, 'Validação inválida')
            return {'hub.challenge': q.get('hub.challenge', '')}

        @router.post('/strava/webhook/{hook_secret}', include_in_schema=False)
        async def webhook(hook_secret: str, request: Request):
            expected = os.environ.get('STRAVA_WEBHOOK_SECRET', '')
            subscription = os.environ.get('STRAVA_SUBSCRIPTION_ID', '')
            if not expected or not subscription or not hmac.compare_digest(hook_secret, expected):
                raise HTTPException(403, 'Validação inválida')
            event = await request.json()
            if str(event.get('subscription_id')) != subscription:
                raise HTTPException(403, 'Assinatura inválida')
            connection = await self.db.strava_connections.find_one({'athlete_id': event.get('owner_id')})
            if not connection:
                return {'ok': True}
            uid = connection['user_id']
            if event.get('object_type') == 'athlete' and str(event.get('updates', {}).get('authorized')).lower() == 'false':
                await self.forget(uid)
            elif event.get('object_type') == 'activity':
                if event.get('aspect_type') == 'delete':
                    await self.db.strava_activities.delete_one({'user_id': uid, 'activity_id': event.get('object_id')})
                await self.db.strava_connections.update_one({'user_id': uid}, {'$set': {'next_sync': now()}})
            return {'ok': True}
