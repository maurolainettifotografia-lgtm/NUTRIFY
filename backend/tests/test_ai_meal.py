import sys,json
from pathlib import Path
import pytest
from pydantic import ValidationError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from ai_meal import parse_estimate,totals

def sample():
 return {'items':[{'name':'Pão francês','portion':'1 unidade média','grams':50,'calories':150,'protein':4,'carbs':29,'fat':2}], 'assumptions':['Pão médio de 50 g.'],'clarification':None}

def test_portion_estimate_and_totals():
 meal=parse_estimate(json.dumps(sample()));assert meal.items[0].grams==50
 assert totals([item.model_dump() for item in meal.items])['calories']==150

@pytest.mark.parametrize('field,value',[('grams',0),('grams',-1),('calories',float('nan')),('protein',True),('fat',100),('carbs','29')])
def test_reject_impossible_and_untyped_ai_numbers(field,value):
 data=sample();data['items'][0][field]=value
 with pytest.raises(ValidationError):parse_estimate(json.dumps(data))

def test_reject_inconsistent_energy():
 data=sample();data['items'][0]['calories']=500
 with pytest.raises(ValidationError):parse_estimate(json.dumps(data))

def test_clarification_instead_of_fabrication():
 meal=parse_estimate('{"items":[],"assumptions":[],"clarification":"Quais alimentos você comeu?"}')
 assert not meal.items and meal.clarification
 with pytest.raises(ValidationError):parse_estimate('{"items":[],"assumptions":[],"clarification":null}')

def test_invalid_or_truncated_json_is_not_saved():
 with pytest.raises(ValueError):parse_estimate('{"items":[')
 assert parse_estimate('```json\n'+json.dumps(sample())+'\n```').items
