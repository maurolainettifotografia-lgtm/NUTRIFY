import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from meal_text import parse_meal
from password_auth import Registration
from pydantic import ValidationError

def test_meal_examples_and_decimal_grams():
    result=parse_meal('100 g de arroz,120 g de batata inglesa,150 g de frango grelhado')
    assert len(result['items'])==3
    assert all(i['candidates'] and i['grams'] for i in result['items'])
    assert result['items'][0]['food'] is None
    assert all('inglesa' in i['name'] for i in result['items'][1]['candidates'])
    assert parse_meal('1,5 kg de arroz')['items'][0]['grams']==1500
    assert parse_meal('arroz 100 g')['items'][0]['grams']==100

def test_unknown_food_and_quantity_are_not_invented():
    assert parse_meal('100 g de zzzzzz')['items'][0]['food'] is None
    assert parse_meal('uma colher de arroz')['items'][0]['grams'] is None
    assert parse_meal('6000 g de arroz')['items'][0]['grams'] is None
    with pytest.raises(ValueError):parse_meal(','.join(['100 g de arroz']*31))

@pytest.mark.parametrize('password',['12345','1234567','12345a','abcdef','１２３４５６'])
def test_exact_ascii_pin(password):
    with pytest.raises(ValidationError):Registration(email='test@example.com',name='Test',password=password)

def test_leading_zero_is_preserved():
    assert Registration(email='test@example.com',name='Test',password='001234').password=='001234'
