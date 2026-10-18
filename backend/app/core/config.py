from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "珞珈烟火邮局 API"
    app_env: str = "development"
    debug: bool = False

    database_host: str = "127.0.0.1"
    database_port: int = 3306
    database_name: str
    database_user: str
    database_password: str
    database_echo: bool = False

    session_cookie_name: str = "luojia_session"
    session_expire_days: int = 7
    session_cookie_secure: bool = False

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        username = quote_plus(self.database_user)
        password = quote_plus(self.database_password)

        return (
            f"mysql+pymysql://{username}:{password}"
            f"@{self.database_host}:{self.database_port}"
            f"/{self.database_name}?charset=utf8mb4"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

# BaseSettings 自动读取环境变量和 .env。
# database_url 生成 SQLAlchemy 使用的 MySQL 地址。
# quote_plus() 防止密码中的 @、# 等字符破坏连接地址。
# lru_cache 保证配置只加载一次。
# 真实密码始终只存在于本机 .env。