"""Minimal bearer-token auth for the admin UI (single configured user, tokens kept in memory)."""
import secrets

from fastapi import Header, HTTPException

from .config import APP_PASSWORD, APP_USER

_TOKENS: set[str] = set()


def check_credentials(username: str, password: str) -> bool:
    return secrets.compare_digest(username, APP_USER) and secrets.compare_digest(password, APP_PASSWORD)


def issue_token() -> str:
    token = secrets.token_urlsafe(32)
    _TOKENS.add(token)
    return token


def revoke_token(token: str) -> None:
    _TOKENS.discard(token)


def require_token(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: add `dependencies=[Depends(require_token)]` on every protected router."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"message": "Not authenticated", "code": "401"})
    token = authorization.split(" ", 1)[1].strip()
    if token not in _TOKENS:
        raise HTTPException(status_code=401, detail={"message": "Session expired, please log in again", "code": "401"})
    return token
