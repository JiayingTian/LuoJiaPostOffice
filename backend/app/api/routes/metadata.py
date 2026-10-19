from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Location, Pattern
from app.schemas.metadata import (
    MetadataData,
    MetadataOption,
    MetadataResponse,
    PatternOption,
)


router = APIRouter(tags=["Metadata"])


@router.get(
    "/metadata",
    response_model=MetadataResponse,
)
def get_metadata(
    request: Request,
    database_session: Session = Depends(get_db),
) -> MetadataResponse:
    locations = database_session.scalars(
        select(Location)
        .where(Location.is_enabled.is_(True))
        .order_by(Location.sort_order.asc(), Location.id.asc())
    ).all()
    patterns = database_session.scalars(
        select(Pattern)
        .where(Pattern.is_enabled.is_(True))
        .order_by(Pattern.sort_order.asc(), Pattern.id.asc())
    ).all()

    return MetadataResponse(
        data=MetadataData(
            locations=[MetadataOption.model_validate(item) for item in locations],
            patterns=[PatternOption.model_validate(item) for item in patterns],
        ),
        request_id=request.state.request_id,
    )
