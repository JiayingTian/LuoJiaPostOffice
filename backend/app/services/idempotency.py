import hashlib
import json
from datetime import timedelta

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import raise_api_error
from app.core.ids import new_id
from app.models import IdempotencyRecord
from app.models.base import utc_now


def hash_request(payload: BaseModel) -> str:
    serialized = json.dumps(
        payload.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def begin_idempotent_request(
    database_session: Session,
    user_id: str,
    scope: str,
    idempotency_key: str,
    payload: BaseModel,
) -> tuple[IdempotencyRecord, dict | None]:
    request_hash = hash_request(payload)
    now = utc_now()
    existing = database_session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.scope == scope,
            IdempotencyRecord.idempotency_key == idempotency_key,
        )
    )

    if existing is not None and existing.expires_at <= now:
        database_session.delete(existing)
        database_session.flush()
        existing = None

    if existing is not None:
        if existing.request_hash != request_hash:
            raise_api_error(409, 40902, "Idempotency-Key 已用于不同请求")
        if existing.response_body is None:
            raise_api_error(409, 40903, "相同请求正在处理中")
        return existing, existing.response_body

    record = IdempotencyRecord(
        id=new_id("ide"),
        user_id=user_id,
        scope=scope,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        http_status=None,
        response_body=None,
        expires_at=now + timedelta(hours=24),
    )
    database_session.add(record)
    database_session.flush()
    return record, None


def finish_idempotent_request(
    record: IdempotencyRecord,
    http_status: int,
    response_body: dict,
) -> None:
    record.http_status = http_status
    record.response_body = response_body
