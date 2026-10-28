"""Autenticação independente com senha derivada e limite persistente de tentativas."""
import asyncio
import hashlib
import hmac
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    return f'pbkdf2_sha256${ITERATIONS}${salt}${digest}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, digest = encoded.split('$')
        if algorithm != 'pbkdf2_sha256' or not 600_000 <= int(iterations) <= 2_000_000:
            return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations)).hex()
        return hmac.compare_digest(actual, digest)
    except (ValueError, TypeError):
        return False


DUMMY_HASH = hash_password(secrets.token_urlsafe(24))


class EmailCredentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value):
        import re
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('E-mail inválido')
        return value


class Registration(EmailCredentials):
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)

    @field_validator('password')
    @classmethod
    def numeric_password(cls, value):
        if not value.isascii() or not value.isdigit():
            raise ValueError('A senha deve conter somente números de 0 a 9.')
        if len(value) != 6:
            raise ValueError('A senha deve ter exatamente 6 dígitos.')
        return value

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Informe seu nome')
        return value


class LegacyRegistration(EmailCredentials):
    """Existing 1.1.2 clients keep their original signup contract."""
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=15, max_length=128)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Informe seu nome')
        return value


async def limit_attempts(db, key, limit):
    now = datetime.now(timezone.utc)
    bucket = int(now.timestamp()) // 900
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    # _id fornece unicidade mesmo entre vários workers e instâncias do servidor.
    identity = f'{bucket}:{key_hash}'
    try:
        result = await db.auth_attempts.find_one_and_update(
            {'_id': identity},
            {'$inc': {'count': 1}, '$setOnInsert': {'expires_at': now + timedelta(minutes=30)}},
            upsert=True, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        result = await db.auth_attempts.find_one_and_update(
            {'_id': identity}, {'$inc': {'count': 1}}, return_document=ReturnDocument.AFTER,
        )
    if not result or result['count'] > limit:
        raise HTTPException(429, 'Muitas tentativas. Aguarde 15 minutos.', headers={'Retry-After': '900'})


def install_routes(router, db):
    async def issue_session(user):
        now = datetime.now(timezone.utc)
        token = secrets.token_urlsafe(32)
        await db.user_sessions.insert_one({
            'session_token': token, 'user_id': user['user_id'],
            'created_at': now, 'expires_at': now + timedelta(days=7),
        })
        profile = await db.profiles.find_one({'user_id': user['user_id']})
        return {'session_token': token, 'user': {
            'user_id': user['user_id'], 'email': user['email'], 'name': user.get('name'),
            'picture': user.get('picture'), 'onboarded': bool(profile and profile.get('onboarded')),
        }}

    async def create_account(data, request: Request, policy):
        await limit_attempts(db, f'register:{request.client.host if request.client else "unknown"}', 10)
        # Nunca vincula senha a uma conta social existente sem autenticar essa conta.
        if await db.users.find_one({'email': data.email}):
            raise HTTPException(409, 'Não foi possível criar a conta com esse e-mail. Tente entrar.')
        user = {
            'user_id': 'user_' + secrets.token_hex(12), 'email': data.email, 'name': data.name,
            'password_hash': await asyncio.to_thread(hash_password, data.password),
            'password_policy': policy, 'email_verified': False, 'picture': None, 'created_at': datetime.now(timezone.utc), 'deleted_at': None,
        }
        try:
            await db.users.insert_one(user)
        except DuplicateKeyError:
            raise HTTPException(409, 'Não foi possível criar a conta com esse e-mail. Tente entrar.')
        return await issue_session(user)

    @router.post('/auth/register')
    async def register(data: LegacyRegistration, request: Request):
        return await create_account(data, request, 'legacy')

    @router.post('/auth/register-pin')
    async def register_pin(data: Registration, request: Request):
        return await create_account(data, request, 'pin6')

    @router.post('/auth/login')
    async def login(data: EmailCredentials, request: Request):
        await limit_attempts(db, f'login-email:{data.email}', 20)
        await limit_attempts(db, f'login-ip:{request.client.host if request.client else "unknown"}', 100)
        user = await db.users.find_one({'email': data.email, 'deleted_at': None})
        valid = await asyncio.to_thread(verify_password, data.password, (user or {}).get('password_hash', DUMMY_HASH))
        if user and user.get('password_policy') == 'pin6' and not (len(data.password) == 6 and data.password.isascii() and data.password.isdigit()):
            valid = False
        if not user or not user.get('password_hash') or not valid:
            raise HTTPException(401, 'E-mail ou senha incorretos.')
        return await issue_session(user)
