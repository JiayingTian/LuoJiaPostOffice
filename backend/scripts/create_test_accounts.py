import secrets
from dataclasses import dataclass

from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.core.ids import new_id
from app.core.security import hash_password
from app.models import SessionRecord, User


@dataclass(frozen=True)
class TestAccount:
    username: str
    display_name: str
    role: str


TEST_ACCOUNTS = (
    TestAccount("test_user_a", "测试用户 A", "user"),
    TestAccount("test_user_b", "测试用户 B", "user"),
    TestAccount("test_admin", "测试管理员", "admin"),
)


def create_or_reset_accounts() -> list[tuple[TestAccount, str]]:
    credentials: list[tuple[TestAccount, str]] = []

    with SessionLocal() as database_session:
        for account in TEST_ACCOUNTS:
            password = secrets.token_urlsafe(12)
            user = database_session.scalar(
                select(User).where(User.username == account.username)
            )

            if user is None:
                user = User(
                    id=new_id("usr"),
                    username=account.username,
                    password_hash=hash_password(password),
                    display_name=account.display_name,
                    avatar_url=None,
                    role=account.role,
                    is_active=True,
                )
                database_session.add(user)
                database_session.flush()
            else:
                user.password_hash = hash_password(password)
                user.display_name = account.display_name
                user.role = account.role
                user.is_active = True
                user.deleted_at = None
                user.version += 1

                database_session.execute(
                    delete(SessionRecord).where(SessionRecord.user_id == user.id)
                )

            credentials.append((account, password))

        database_session.commit()

    return credentials


def main() -> None:
    credentials = create_or_reset_accounts()

    print("测试账号已创建或重置。密码只在本次终端输出中显示：")
    for account, password in credentials:
        print(f"{account.username} ({account.role}): {password}")


if __name__ == "__main__":
    main()
