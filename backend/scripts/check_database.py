from sqlalchemy import text

from app.core.database import engine


def main() -> None:
    with engine.connect() as connection:
        database_name = connection.execute(
            text("SELECT DATABASE()")
        ).scalar_one()

        mysql_version = connection.execute(
            text("SELECT VERSION()")
        ).scalar_one()

    print("数据库连接成功")
    print(f"当前数据库：{database_name}")
    print(f"MySQL 版本：{mysql_version}")


if __name__ == "__main__":
    main()