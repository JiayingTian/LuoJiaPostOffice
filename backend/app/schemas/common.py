from typing import Any

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    first, *remaining = value.split("_")
    return first + "".join(word.title() for word in remaining)


class APIModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class EmptyResponse(APIModel):
    code: int = 0
    message: str = "success"
    data: None = None
    request_id: str


class ErrorResponse(APIModel):
    code: int
    message: str
    data: dict[str, Any] | None = None
    request_id: str
