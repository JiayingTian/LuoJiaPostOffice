from app.schemas.common import APIModel


class MetadataOption(APIModel):
    id: str
    name: str


class PatternOption(MetadataOption):
    preview_url: str
    asset_url: str


class MetadataData(APIModel):
    locations: list[MetadataOption]
    patterns: list[PatternOption]


class MetadataResponse(APIModel):
    code: int = 0
    message: str = "success"
    data: MetadataData
    request_id: str
