"""Entrar com Apple: verificacao do token de identidade e revogacao na exclusao da conta.

Regra 4.8 da App Store: apps com login Google/Facebook precisam oferecer tambem o Entrar com Apple.
Regra 5.1.1(v): ao excluir a conta, apps com Entrar com Apple devem REVOGAR o token na Apple.

Variaveis de ambiente (arquivo .env do backend):
  APPLE_CLIENT_ID    Bundle ID do app (padrao: com.maurolainetti.nutrify). Pode listar varios, separados por virgula
                     (ex.: inclua host.exp.Exponent para testar no Expo Go).
  --- so para revogar o token na exclusao da conta (recomendado antes de publicar) ---
  APPLE_TEAM_ID      ID da equipe no Apple Developer.
  APPLE_KEY_ID       ID da chave "Sign in with Apple" criada no Apple Developer.
  APPLE_PRIVATE_KEY  Conteudo da chave .p8 (pode usar \\n no lugar das quebras de linha).
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx
import jwt

logger = logging.getLogger("nutrify")

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = f"{APPLE_ISSUER}/auth/keys"
APPLE_TOKEN_URL = f"{APPLE_ISSUER}/auth/token"
APPLE_REVOKE_URL = f"{APPLE_ISSUER}/auth/revoke"
DEFAULT_CLIENT_ID = "com.maurolainetti.nutrify"


class AppleAuthError(Exception):
    pass


def client_ids() -> List[str]:
    raw = os.environ.get("APPLE_CLIENT_ID", DEFAULT_CLIENT_ID)
    return [c.strip() for c in raw.split(",") if c.strip()]


def verify_identity_token(token: str, jwks: Dict[str, Any], audiences: Optional[List[str]] = None) -> Dict[str, Any]:
    """Confere assinatura (RS256, chave publica da Apple), emissor, destinatario (o seu app) e validade."""
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256":  # barra ataques que trocam o algoritmo (ex.: HS256 com a chave publica)
            raise AppleAuthError("Algoritmo nao aceito")
        key_json = next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)
        if not key_json:
            raise AppleAuthError("Chave desconhecida")
        key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key_json))
        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=audiences or client_ids(),
            issuer=APPLE_ISSUER,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except AppleAuthError:
        raise
    except jwt.PyJWTError as e:
        raise AppleAuthError(f"Token invalido: {e}") from e


_jwks_cache: Dict[str, Any] = {"keys": None, "at": 0.0}


async def get_apple_jwks(force: bool = False) -> Dict[str, Any]:
    """Chaves publicas da Apple, guardadas por 1 hora."""
    if not force and _jwks_cache["keys"] and time.time() - _jwks_cache["at"] < 3600:
        return _jwks_cache["keys"]
    async with httpx.AsyncClient(timeout=10) as hc:
        resp = await hc.get(APPLE_KEYS_URL)
    resp.raise_for_status()
    _jwks_cache["keys"], _jwks_cache["at"] = resp.json(), time.time()
    return _jwks_cache["keys"]


async def verify_with_apple(token: str) -> Dict[str, Any]:
    jwks = await get_apple_jwks()
    try:
        return verify_identity_token(token, jwks)
    except AppleAuthError:
        # A Apple troca as chaves de tempos em tempos: tenta uma vez com a lista atualizada.
        return verify_identity_token(token, await get_apple_jwks(force=True))


# ---------------------------------------------------------------------------
# Revogacao do token na exclusao da conta
# ---------------------------------------------------------------------------
def revocation_configured() -> bool:
    return all(os.environ.get(k) for k in ("APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"))


def make_client_secret(team_id: str, key_id: str, client_id: str, private_key_pem: str, now: Optional[int] = None, ttl: int = 300) -> str:
    now = int(now if now is not None else time.time())
    return jwt.encode(
        {"iss": team_id, "iat": now, "exp": now + ttl, "aud": APPLE_ISSUER, "sub": client_id},
        private_key_pem.replace("\\n", "\n"),
        algorithm="ES256",
        headers={"kid": key_id},
    )


def _secret_for(client_id: str) -> str:
    return make_client_secret(os.environ["APPLE_TEAM_ID"], os.environ["APPLE_KEY_ID"], client_id, os.environ["APPLE_PRIVATE_KEY"])


async def exchange_code_for_refresh_token(authorization_code: str, client_id: Optional[str] = None) -> Optional[str]:
    """Troca o codigo de autorizacao (entregue pelo app) por um refresh token, guardado para a revogacao."""
    if not revocation_configured():
        return None
    cid = client_id or client_ids()[0]
    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            resp = await hc.post(APPLE_TOKEN_URL, data={
                "client_id": cid, "client_secret": _secret_for(cid),
                "code": authorization_code, "grant_type": "authorization_code",
            })
        if resp.status_code == 200:
            return resp.json().get("refresh_token")
        logger.warning("Apple /auth/token recusou o codigo (%s)", resp.status_code)
    except Exception:
        logger.exception("Falha ao trocar o codigo da Apple")
    return None


async def revoke_refresh_token(refresh_token: str, client_id: Optional[str] = None) -> bool:
    """Revoga o acesso do app na conta Apple da pessoa. Nunca levanta erro: a exclusao da conta segue de qualquer jeito."""
    if not refresh_token or not revocation_configured():
        return False
    cid = client_id or client_ids()[0]
    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            resp = await hc.post(APPLE_REVOKE_URL, data={
                "client_id": cid, "client_secret": _secret_for(cid),
                "token": refresh_token, "token_type_hint": "refresh_token",
            })
        return resp.status_code == 200
    except Exception:
        logger.exception("Falha ao revogar o token da Apple")
        return False
