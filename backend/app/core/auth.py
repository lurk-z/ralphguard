"""Validate short-lived user tokens issued by the NextAuth frontend."""
import base64
import binascii
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from app.core.config import settings


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None = None


def _decode_part(value: str) -> dict:
    padding = "=" * (-len(value) % 4)
    return json.loads(base64.urlsafe_b64decode(value + padding))


async def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not settings.AUTH_SECRET:
        raise HTTPException(status_code=503, detail="AUTH_SECRET not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required")
    token = authorization[7:].strip()
    try:
        header_part, payload_part, signature = token.split(".")
        header = _decode_part(header_part)
        payload = _decode_part(payload_part)
        expected = hmac.new(
            settings.AUTH_SECRET.encode(),
            f"{header_part}.{payload_part}".encode(),
            hashlib.sha256,
        ).digest()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        valid = (
            header.get("alg") == "HS256"
            and hmac.compare_digest(expected, supplied)
            and payload.get("aud") == "ralphguard-backend"
            and int(payload.get("exp", 0)) > int(time.time())
            and isinstance(payload.get("sub"), str)
        )
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, binascii.Error, UnicodeDecodeError):
        valid = False
        payload = {}
    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired authentication")
    return CurrentUser(id=payload["sub"], email=payload.get("email"))
