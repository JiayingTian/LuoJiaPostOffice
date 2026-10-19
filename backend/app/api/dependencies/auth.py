import secrets
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import raise_api_error
from app.core.security import hash_token
from app.models import SessionRecord, User
from app.models.base import utc_now


settings = get_settings()


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: SessionRecord


def get_optional_auth_context(
    request: Request,
    database_session: Session = Depends(get_db),
) -> AuthContext | None:
    session_token = request.cookies.get(settings.session_cookie_name)

    if not session_token:
        return None

    session_record = database_session.scalar(
        select(SessionRecord).where(
            SessionRecord.session_token_hash == hash_token(session_token),
            SessionRecord.revoked_at.is_(None),
            SessionRecord.expires_at > utc_now(),
        )
    )

    if session_record is None:
        return None

    user = database_session.scalar(
        select(User).where(
            User.id == session_record.user_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    )

    if user is None:
        return None

    return AuthContext(user=user, session=session_record)


def get_auth_context(
    request: Request,
    database_session: Session = Depends(get_db),
) -> AuthContext:
    auth_context = get_optional_auth_context(request, database_session)
    if auth_context is None:
        raise HTTPException(status_code=401, detail="请先登录")
    return auth_context


def require_admin(
    auth_context: AuthContext = Depends(get_auth_context),
) -> AuthContext:
    if auth_context.user.role != "admin":
        raise_api_error(403, 40301, "无权执行此操作")
    return auth_context


def require_csrf(
    request: Request,
    auth_context: AuthContext = Depends(get_auth_context),
    csrf_token: Annotated[
        str | None,
        Header(alias="X-CSRF-Token"),
    ] = None,
) -> AuthContext:
    if not csrf_token or not secrets.compare_digest(
        hash_token(csrf_token),
        auth_context.session.csrf_token_hash,
    ):
        raise_api_error(403, 40302, "CSRF Token 无效")

    return auth_context


def require_admin_with_csrf(
    auth_context: AuthContext = Depends(require_csrf),
) -> AuthContext:
    if auth_context.user.role != "admin":
        raise_api_error(403, 40301, "无权执行此操作")
    return auth_context
