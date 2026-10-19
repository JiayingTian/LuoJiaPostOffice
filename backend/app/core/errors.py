from typing import Any, NoReturn

from fastapi import HTTPException


def raise_api_error(
    status_code: int,
    code: int,
    message: str,
    data: dict[str, Any] | None = None,
) -> NoReturn:
    raise HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": message,
            "data": data,
        },
    )
