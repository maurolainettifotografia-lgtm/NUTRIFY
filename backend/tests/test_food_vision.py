import base64,io,json,pytest
from PIL import Image
from food_vision import prepare_photo,parse_photo

def image_data():
    output=io.BytesIO();Image.new('RGB',(2000,1000),'white').save(output,format='PNG');return base64.b64encode(output.getvalue()).decode()

def test_preparation_removes_metadata_and_bounds_image():
    result=prepare_photo('data:image/png;base64,'+image_data())
    with Image.open(io.BytesIO(base64.b64decode(result))) as im:
        assert im.format=='JPEG' and im.size==(1280,640) and not im.getexif()

@pytest.mark.parametrize('value',['garbage!','',base64.b64encode(b'not an image').decode()])
def test_invalid_photo_rejected(value):
    with pytest.raises(ValueError):prepare_photo(value)

def test_photo_portions_validated():
    data={'foods':[{'name':'Banana','grams':100,'calories':90,'protein':1,'carbs':22,'fat':0.2}],'note':'Porção aproximada.'}
    result=parse_photo('```json\n'+json.dumps(data)+'\n```')
    assert result.foods[0].grams==100 and result.foods[0].calories==90

def test_bad_macros_are_not_silently_clamped():
    with pytest.raises(ValueError):parse_photo('{"foods":[{"name":"Bad","grams":50,"calories":900,"protein":100,"carbs":0,"fat":0}],"note":""}')

def test_nonfood_response():
    assert parse_photo('{"foods":[],"note":"Não há alimento visível."}').foods==[]

def test_model_routing(monkeypatch):
    from ai_direct import LlmChat,UserMessage,ImageContent
    monkeypatch.setenv('GROQ_API_KEY','test-only');monkeypatch.setenv('GROQ_MODEL','qwen/qwen3.8-27b');monkeypatch.setenv('GROQ_VISION_MODEL','vision-test')
    chat=LlmChat('test-only','test','json');chat.json_mode=True
    p=chat.payload(UserMessage('photo',[ImageContent('abcd')]))
    assert p['model']=='vision-test' and 'reasoning_effort' not in p and p['response_format']['type']=='json_object'
    assert p['messages'][-1]['content'][1]['image_url']['url'].startswith('data:image/jpeg;base64,')
    assert chat.payload(UserMessage('text'))['model']=='qwen/qwen3.8-27b'