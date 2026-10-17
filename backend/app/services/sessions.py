from dataclasses import dataclass
from datetime import timedelta

from fastapi import Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ids import new_id
from app.core.security import hash_token, new_secure_token
from app.models import SessionRecord
from app.models.base import utc_now


settings = get_settings()


@dataclass(frozen=True)
class IssuedSession:
    record: SessionRecord
    session_token: str
    csrf_token: str


def issue_session(database_session: Session, user_id: str) -> IssuedSession:
    now = utc_now()
    session_token = new_secure_token()
    csrf_token = new_secure_token()

    record = SessionRecord(
        id=new_id("ses"),
        user_id=user_id,
        session_token_hash=hash_token(session_token),
        csrf_token_hash=hash_token(csrf_token),
        expires_at=now + timedelta(days=settings.session_expire_days),
        last_seen_at=now,
    )
    database_session.add(record)

    return IssuedSession(
        record=record,
        session_token=session_token,
        csrf_token=csrf_token,
    )


def set_session_cookie(response: Response, session_token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        max_age=settings.session_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
