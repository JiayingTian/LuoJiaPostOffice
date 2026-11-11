# 珞珈烟火邮局 · 后端说明

当前投递流程与网页一致：公开信及公开回信在成功寄出后立即公开；私密信仅作者和指定收件人可读。无需管理员账号或审核步骤。旧数据库迁移中的审核记录表属于历史结构，不参与当前投递。

## 1 环境准备

```powershell
cd backend
pip install -r requirements.txt
Copy-Item .env.example .env
```

在 `.env` 中填写本机 `luojia_app` 数据库账户密码。不要将 `.env` 提交到 Git。

## 2 数据库迁移

```powershell
python -m alembic upgrade head
python -m alembic current
```

当前 migration head：

```text
f284c71a9e30
```

## 3 启动服务

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

本地地址：

```text
API：http://127.0.0.1:8000/api/v1
Swagger：http://127.0.0.1:8000/docs
```

## 4 测试账号

```powershell
python -m scripts.create_test_accounts
```

该命令创建或重置 `test_user_a` 与 `test_user_b`，并在终端一次性输出随机密码。不要将输出保存到 Git、日志或截图中。

## 5 核心流程测试

```powershell
python -m scripts.smoke_test_core
```

测试脚本会临时启动服务并验证以下流程：

1. 注册与 CSRF Token 恢复。
2. 空草稿保存。
3. 幂等重放和冲突。
4. 草稿寄出后立即公开，访客可以读取。
5. 私密信仅作者和指定收件人可以读取。
6. 公开回信寄出后立即进入回信列表。
7. 临时数据自动清理。

成功输出：

```text
CORE_SMOKE_TEST=PASS
```

## 6 本轮核心接口

```text
GET    /api/v1/metadata
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/me
GET    /api/v1/auth/csrf
POST   /api/v1/auth/logout
GET    /api/v1/letters
POST   /api/v1/letters
GET    /api/v1/letters/{letterId}
PATCH  /api/v1/letters/{letterId}
DELETE /api/v1/letters/{letterId}
GET    /api/v1/letters/{letterId}/replies
GET    /api/v1/me/letters
GET    /api/v1/me/inbox
```

兼容字段 `submitForReview` 在当前版本中表示“确认寄出”，成功响应即代表公开信已发布。旧 `restriction/openapi.yaml` 是历史接口草稿，不随参赛作品打包。

