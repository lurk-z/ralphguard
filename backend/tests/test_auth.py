import base64
import asyncio
import hashlib
import hmac
import json
import time

import pytest
from fastapi import HTTPException

from app.core.auth import get_current_user
from app.core.config import settings


def token(secret: str, subject: str = "google-user-1") -> str:
    enc = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()
    header = enc({"alg": "HS256", "typ": "JWT"})
    payload = enc({"sub": subject, "aud": "ralphguard-backend", "exp": int(time.time()) + 60})
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"{header}.{payload}.{signature}"


def test_accepts_frontend_user_token(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SECRET", "test-secret")
    user = asyncio.run(get_current_user(f"Bearer {token('test-secret')}"))
    assert user.id == "google-user-1"


def test_rejects_invalid_signature(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SECRET", "test-secret")
    with pytest.raises(HTTPException) as raised:
        asyncio.run(get_current_user(f"Bearer {token('wrong-secret')}"))
    assert raised.value.status_code == 401
