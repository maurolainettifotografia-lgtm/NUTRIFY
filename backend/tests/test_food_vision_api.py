import asyncio,base64,io,json
from types import SimpleNamespace
import httpx,pytest
from PIL import Image
from fastapi import HTTPException
import os
os.environ.setdefault('MONGO_URL','mongodb://127.0.0.1:27029')
os.environ.setdefault('DB_NAME','nutrify_photo_unit_tests')
import server

class Chat:
    response='{"foods":[{"name":"Banana","grams":100,"calories":90,"protein":1,"carbs":22,"fat":0.2}],"note":"Porção visual aproximada."}'
    failure=None
    def __init__(self,**kwargs):pass
    def with_model(self,*args):return self
    async def send_message(self,message):
        if self.failure:raise self.failure
        return self.response

@pytest.fixture
def setup_photo(monkeypatch):
    monkeypatch.setattr(server,'ai_chat_types',lambda user:SimpleNamespace(LlmChat=Chat,UserMessage=lambda **kw:kw,ImageContent=lambda **kw:kw))
    monkeypatch.setattr(server,'ai_api_key',lambda:'test-only')
    calls=[]
    async def quota(*args):calls.append(args)
    monkeypatch.setattr(server,'check_ai_quota',quota)
    monkeypatch.setattr(Chat,'failure',None)
    b=io.BytesIO();Image.new('RGB',(12,12),'yellow').save(b,format='PNG')
    return base64.b64encode(b.getvalue()).decode(),calls

def run_photo(value):return asyncio.run(server.recognize_food(server.RecognizeInput(image_base64=value),{'user_id':'synthetic'}))

def test_vision_api_success(setup_photo):
    value,calls=setup_photo;r=run_photo(value)
    assert r['foods'][0]['calories']==90 and 'portion' not in r['foods'][0] and len(calls)==1

def test_invalid_photo_no_provider_or_quota(setup_photo):
    value,calls=setup_photo
    with pytest.raises(HTTPException) as e:run_photo('bad!')
    assert e.value.status_code==422 and not calls

def test_provider_limit_is_actionable(setup_photo,monkeypatch):
    req=httpx.Request('POST','https://example.test');resp=httpx.Response(429,request=req)
    monkeypatch.setattr(Chat,'failure',httpx.HTTPStatusError('rate limited',request=req,response=resp))
    with pytest.raises(HTTPException) as e:run_photo(setup_photo[0])
    assert e.value.status_code==429 and 'Sua foto' in e.value.detail

def test_invalid_ai_result_rejected(setup_photo,monkeypatch):
    monkeypatch.setattr(Chat,'response','{"foods":[{"name":"Bad","grams":-10}],"note":""}')
    with pytest.raises(HTTPException) as e:run_photo(setup_photo[0])
    assert e.value.status_code==502

def test_empty_photo_result_explained(setup_photo,monkeypatch):
    monkeypatch.setattr(Chat,'response','{"foods":[],"note":"Foto sem comida."}')
    assert run_photo(setup_photo[0])=={'foods':[],'note':'Foto sem comida.'}