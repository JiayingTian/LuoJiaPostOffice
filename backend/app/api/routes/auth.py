from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AuthContext, get_auth_context, require_csrf
from app.core.database import get_db
from app.core.ids import new_id
from app.core.security import hash_password, verify_password
from app.models import User
from app.models.base import utc_now
from app.schemas.auth import (
    AuthData,
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UserRead,
    UserResponse,
)
from app.schemas.common import EmptyResponse
from app.services.sessions import clear_session_cookie, issue_session, set_session_cookie


router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=201,
)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    database_session: Session = Depends(get_db),
) -> AuthResponse:
    existing_user = database_session.scalar(
        select(User).where(User.username == payload.username)
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=409,
            detail="用户名已被使用",
        )

    user = User(
        id=new_id("usr"),
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        avatar_url=None,
        role="user",
        is_active=True,
    )

    try:
        # 先写入用户，确保外键所引用的 users 记录已经存在。
        database_session.add(user)
        database_session.flush()

        issued_session = issue_session(database_session, user.id)
        database_session.commit()
    except IntegrityError as error:
        database_session.rollback()

        # 1062 是 MySQL 唯一键冲突；其他完整性错误不能伪装成用户名重复。
        mysql_error_code = getattr(error.orig, "args", (None,))[0]
        if mysql_error_code == 1062:
            raise HTTPException(
                status_code=409,
                detail="用户名已被使用",
            ) from None

        raise

    set_session_cookie(response, issued_session.session_token)

    return AuthResponse(
        data=AuthData(
            user=UserRead.model_validate(user),
            csrf_token=issued_session.csrf_token,
        ),
        request_id=request.state.request_id,
    )


@router.post(
    "/login",
    response_model=AuthResponse,
)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    database_session: Session = Depends(get_db),
) -> AuthResponse:
    user = database_session.scalar(
        select(User).where(
            User.username == payload.account,
            User.deleted_at.is_(None),
        )
    )

    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    issued_session = issue_session(database_session, user.id)
    database_session.commit()
    set_session_cookie(response, issued_session.session_token)

    return AuthResponse(
        data=AuthData(
            user=UserRead.model_validate(user),
            csrf_token=issued_session.csrf_token,
        ),
        request_id=request.state.request_id,
    )


@router.get(
    "/me",
    response_model=UserResponse,
)
def get_current_user(
    request: Request,
    auth_context: AuthContext = Depends(get_auth_context),
) -> UserResponse:
    return UserResponse(
        data=UserRead.model_validate(auth_context.user),
        request_id=request.state.request_id,
    )


@router.post(
    "/logout",
    response_model=EmptyResponse,
)
def logout(
    request: Request,
    response: Response,
    auth_context: AuthContext = Depends(require_csrf),
    database_session: Session = Depends(get_db),
) -> EmptyResponse:
    auth_context.session.revoked_at = utc_now()
    database_session.commit()
    clear_session_cookie(response)

    return EmptyResponse(request_id=request.state.request_id)
