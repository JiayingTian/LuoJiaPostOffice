from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


settings = get_settings()

engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    pool_pre_ping=True,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(
    bind=engine,
    class_=Session,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    database_session = SessionLocal()

    try:
        yield database_session
    finally:
        database_session.close()


# engine：管理与 MySQL 的底层连接。
# SessionLocal：用于创建一次数据库操作会话。
# pool_pre_ping=True：使用连接前先检查连接是否仍有效。
# pool_recycle=1800：每隔一段时间回收连接，避免 MySQL 超时。
# get_db()：以后通过 FastAPI 依赖注入为每个请求提供 Session。
# finally：无论请求成功还是报错，都会关闭 Session。