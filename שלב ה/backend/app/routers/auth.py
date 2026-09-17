from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import APP_USER
from ..security import check_credentials, issue_token, require_token, revoke_token

router = APIRouter(prefix="/auth", tags=["auth"])


class Login(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: Login):
    if not check_credentials(body.username, body.password):
        raise HTTPException(status_code=401, detail={"message": "Invalid username or password", "code": "401", "hint": None})
    return {"token": issue_token(), "username": APP_USER}


@router.post("/logout")
def logout(token: str = Depends(require_token)):
    revoke_token(token)
    return {"ok": True}


@router.get("/me")
def me(_: str = Depends(require_token)):
    return {"username": APP_USER}
