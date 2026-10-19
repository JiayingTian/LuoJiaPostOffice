# 珞珈烟火邮局后端开发说明

## 1 环境准备

```powershell
conda activate postoffice
cd D:\Code\26LingCup\backend
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

该命令创建或重置 `test_user_a`、`test_user_b` 和 `test_admin`，并在终端一次性输出随机密码。不要将输出保存到 Git、日志或截图中。

## 5 核心流程测试

```powershell
python -m scripts.smoke_test_core
```

测试脚本会临时启动服务并验证以下流程：

1. 注册与 CSRF Token 恢复。
2. 空草稿保存。
3. 幂等重放和冲突。
4. 草稿提交审核。
5. 待审核信件权限隔离。
6. 管理员审核通过。
7. 公开信件读取。
8. 完整回信创建、审核和列表。
9. 临时数据自动清理。

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
GET    /api/v1/admin/letters
POST   /api/v1/admin/letters/{letterId}/review
```

接口字段、状态码和响应格式以 `restriction/openapi.yaml` 为准。
