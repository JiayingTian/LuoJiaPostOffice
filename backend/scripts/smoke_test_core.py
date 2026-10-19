import json
import os
import socket
import subprocess
import sys
import time
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.models import (
    IdempotencyRecord,
    Letter,
    ModerationRecord,
    SessionRecord,
    User,
)


TEST_USERNAMES = ("smoke_user_a", "smoke_user_b", "smoke_admin")
TEST_PASSWORD = "TemporaryPassword123!"


class APIClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))

    def request(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict]:
        request_headers = dict(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        request = Request(
            f"{self.base_url}{path}",
            data=data,
            headers=request_headers,
            method=method,
        )
        try:
            with self.opener.open(request, timeout=10) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))


def cleanup_test_data() -> None:
    with SessionLocal() as database_session:
        user_ids = list(
            database_session.scalars(
                select(User.id).where(User.username.in_(TEST_USERNAMES))
            ).all()
        )
        if not user_ids:
            return
        letter_ids = list(
            database_session.scalars(
                select(Letter.id).where(Letter.author_id.in_(user_ids))
            ).all()
        )
        if letter_ids:
            database_session.execute(
                delete(ModerationRecord).where(
                    (ModerationRecord.target_id.in_(letter_ids))
                    | (ModerationRecord.actor_user_id.in_(user_ids))
                )
            )
        database_session.execute(
            delete(IdempotencyRecord).where(
                IdempotencyRecord.user_id.in_(user_ids)
            )
        )
        database_session.execute(
            delete(Letter).where(
                Letter.author_id.in_(user_ids),
                Letter.parent_letter_id.is_not(None),
            )
        )
        database_session.execute(
            delete(Letter).where(Letter.author_id.in_(user_ids))
        )
        database_session.execute(
            delete(SessionRecord).where(SessionRecord.user_id.in_(user_ids))
        )
        database_session.execute(delete(User).where(User.id.in_(user_ids)))
        database_session.commit()


def promote_admin() -> None:
    with SessionLocal() as database_session:
        admin = database_session.scalar(
            select(User).where(User.username == "smoke_admin")
        )
        if admin is None:
            raise AssertionError("smoke_admin was not created")
        admin.role = "admin"
        database_session.commit()


def register(client: APIClient, username: str, display_name: str) -> str:
    status, response = client.request(
        "POST",
        "/auth/register",
        {
            "username": username,
            "password": TEST_PASSWORD,
            "displayName": display_name,
        },
    )
    assert status == 201, response
    return response["data"]["csrfToken"]


def get_free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_server(url: str) -> None:
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except URLError:
            time.sleep(0.2)
    raise RuntimeError("Smoke-test server did not start")


def run_flow(base_url: str) -> None:
    user_a = APIClient(base_url)
    user_b = APIClient(base_url)
    admin = APIClient(base_url)
    anonymous = APIClient(base_url)

    status, metadata = anonymous.request("GET", "/metadata")
    assert status == 200, metadata
    assert len(metadata["data"]["patterns"]) == 1
    pattern_id = metadata["data"]["patterns"][0]["id"]

    csrf_a = register(user_a, "smoke_user_a", "冒烟用户 A")
    csrf_b = register(user_b, "smoke_user_b", "冒烟用户 B")
    csrf_admin = register(admin, "smoke_admin", "冒烟管理员")
    promote_admin()

    status, refreshed = user_a.request("GET", "/auth/csrf")
    assert status == 200, refreshed
    refreshed_csrf_a = refreshed["data"]["csrfToken"]
    status, csrf_error = user_a.request(
        "POST",
        "/auth/logout",
        headers={"X-CSRF-Token": csrf_a},
    )
    assert status == 403 and csrf_error["code"] == 40302, csrf_error
    csrf_a = refreshed_csrf_a

    draft_headers = {
        "X-CSRF-Token": csrf_a,
        "Idempotency-Key": "smoke-draft-000001",
    }
    status, draft = user_a.request(
        "POST",
        "/letters",
        {"saveAsDraft": True},
        draft_headers,
    )
    assert status == 201 and draft["data"]["status"] == "draft", draft
    letter_id = draft["data"]["id"]

    status, replay = user_a.request(
        "POST",
        "/letters",
        {"saveAsDraft": True},
        draft_headers,
    )
    assert status == 201 and replay["data"]["id"] == letter_id, replay

    status, conflict = user_a.request(
        "POST",
        "/letters",
        {"saveAsDraft": True, "title": "不同内容"},
        draft_headers,
    )
    assert status == 409 and conflict["code"] == 40902, conflict

    status, submitted = user_a.request(
        "PATCH",
        f"/letters/{letter_id}",
        {
            "title": "写给珞珈的一封信",
            "content": "这是用于自动化冒烟测试的信件正文，包含中文和足够的字符数量。",
            "submitForReview": True,
        },
        {"X-CSRF-Token": csrf_a},
    )
    assert status == 200 and submitted["data"]["publishedAt"] is None, submitted

    status, hidden = user_b.request("GET", f"/letters/{letter_id}")
    assert status == 404, hidden
    status, public_before = anonymous.request("GET", "/letters")
    assert status == 200, public_before
    assert letter_id not in {
        item["id"] for item in public_before["data"]["items"]
    }, public_before

    status, queue = admin.request("GET", "/admin/letters")
    assert status == 200, queue
    assert letter_id in {item["id"] for item in queue["data"]["items"]}, queue
    status, approved = admin.request(
        "POST",
        f"/admin/letters/{letter_id}/review",
        {"action": "approve"},
        {"X-CSRF-Token": csrf_admin},
    )
    assert status == 200 and approved["data"]["allowReplies"] is True, approved

    status, public_after = anonymous.request("GET", f"/letters/{letter_id}")
    assert status == 200, public_after

    status, reply = user_b.request(
        "POST",
        "/letters",
        {
            "title": "给你的完整回信",
            "content": "这是另一位用户写下的完整回信正文，长度满足正式提交要求。",
            "recipientType": "wall",
            "parentLetterId": letter_id,
            "isAnonymous": False,
            "patternId": pattern_id,
            "allowResponses": True,
            "allowReplies": True,
            "saveAsDraft": False,
        },
        {
            "X-CSRF-Token": csrf_b,
            "Idempotency-Key": "smoke-reply-000001",
        },
    )
    assert status == 201, reply
    reply_id = reply["data"]["id"]
    status, _ = admin.request(
        "POST",
        f"/admin/letters/{reply_id}/review",
        {"action": "approve"},
        {"X-CSRF-Token": csrf_admin},
    )
    assert status == 200
    status, replies = anonymous.request("GET", f"/letters/{letter_id}/replies")
    assert status == 200 and replies["data"]["total"] == 1, replies


def main() -> None:
    cleanup_test_data()
    port = get_free_port()
    env = os.environ.copy()
    if env.get("DEBUG", "").lower() not in {"true", "false", "0", "1"}:
        env.pop("DEBUG", None)
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_for_server(f"http://127.0.0.1:{port}/api/v1/health")
        run_flow(f"http://127.0.0.1:{port}/api/v1")
        print("CORE_SMOKE_TEST=PASS")
    finally:
        cleanup_test_data()
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


if __name__ == "__main__":
    main()
