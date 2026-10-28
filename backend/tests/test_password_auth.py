"""Testes locais da derivação de senhas e normalização de credenciais."""
import sys
from pathlib import Path
import pytest
from pydantic import ValidationError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from password_auth import hash_password,verify_password,Registration


def test_hash_is_salted_and_verifies():
    password='Uma frase longa para teste'
    a,b=hash_password(password),hash_password(password)
    assert a!=b and password not in a
    assert verify_password(password,a)
    assert not verify_password('senha incorreta',a)
    assert not verify_password(password,'invalid')


def test_registration_normalizes_and_rejects_invalid_input():
    assert Registration(email=' USER@example.com ',password='123456',name=' Teste ').email=='user@example.com'
    with pytest.raises(ValidationError):
        Registration(email='invalid',password='123456',name='Teste')
    with pytest.raises(ValidationError):
        Registration(email='user@example.com',password='curta',name='Teste')
