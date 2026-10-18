from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import APIModel


class RegisterRequest(APIModel):
    username: str = Field(
        min_length=3,
        max_length=32,
        pattern=r"^[A-Za-z0-9_]+$",
    )
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=30)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.lower()


class LoginRequest(APIModel):
    account: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("account")
    @classmethod
    def normalize_account(cls, value: str) -> str:
        return value.lower()


class UserRead(APIModel):
    id: str
    username: str
    display_name: str
    avatar_url: str | None
    role: Literal["user", "admin"]
    created_at: datetime


class AuthData(APIModel):
    user: UserRead
    csrf_token: str


class AuthResponse(APIModel):
    code: int = 0
    message: str = "success"
    data: AuthData
    request_id: str


class UserResponse(APIModel):
    code: int = 0
    message: str = "success"
    data: UserRead
    request_id: str
