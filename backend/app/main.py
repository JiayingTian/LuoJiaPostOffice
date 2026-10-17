from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.core.ids import new_id


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.2.1",
)


ERROR_CODES = {
    400: 40001,
    401: 40101,
    403: 40301,
    404: 40401,
    409: 40901,
    422: 42201,
    429: 42901,
}


def get_request_id(request: Request) -> str:
    request_id = getattr(request.state, "request_id", None)
    return request_id or new_id("req")


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exception: HTTPException):
    message = exception.detail if isinstance(exception.detail, str) else "请求失败"
    return JSONResponse(
        status_code=exception.status_code,
        content={
            "code": ERROR_CODES.get(exception.status_code, 40000),
            "message": message,
            "data": None,
            "requestId": get_request_id(request),
        },
        headers=exception.headers,
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request,
    exception: RequestValidationError,
):
    field_errors: dict[str, str] = {}
    for error in exception.errors():
        location = error.get("loc", ())
        field = str(location[-1]) if location else "request"
        field_errors.setdefault(field, str(error.get("msg", "输入无效")))

    return JSONResponse(
        status_code=422,
        content={
            "code": 42201,
            "message": "请求内容未通过校验",
            "data": {"fieldErrors": field_errors},
            "requestId": get_request_id(request),
        },
    )


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = new_id("req")
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id

    return response


app.include_router(api_router)


@app.get("/api/v1/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
