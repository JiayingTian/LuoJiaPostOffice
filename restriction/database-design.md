# 珞珈烟火邮局数据库与权限设计

## 1. 文档状态

1. 版本：`0.2.2`。
2. 日期：`2026-10-16`。
3. 状态：根据已确认产品决策形成的数据库设计稿。
4. 本文件暂未向 MySQL 建表。
5. 用户确认字段后，再据此编写 SQLAlchemy Model 和 Alembic 首次 migration。

## 2. 已冻结的产品决策

1. 登录方式为用户名和密码。
2. 系统角色只有 `user` 和 `admin`。
3. “作者”是资源所有权关系，不是账户角色。
4. 信件状态和可见范围分开存储。
5. 信件状态只有 `draft`、`active` 和 `deleted`。
6. 可见范围只有 `private` 和 `public`。
7. 首版不支持定时寄信。
8. 收信目标只有信墙 `wall` 或某个用户 `user`。
9. 信墙信件为公开信件，提交后需要管理员审核。
10. 用户定向信件为私人信件，只允许发送者、原接收者和有效转发接收者读取，不进入审核。
11. 支持笔名和匿名；匿名不移除数据库中的真实用户关系。
12. 地点和信纸图案只能使用后台维护的固定选项；初版不提供标签功能。
13. 互动包含共鸣、收藏、简短回应和完整回信。
14. 简短回应与完整回信分开建模。
15. 完整回信是新的信件，通过 `parent_letter_id` 关联原信。
16. 首版只允许一层完整回信关联。
17. 公开信件、公开完整回信和简短回应由管理员人工审核。
18. 私人信件不审核。
19. 管理员默认不能读取私人信件。
20. 现在设计通知表，但通知页面可以后续开发。
21. 未登录草稿保存在浏览器；登录后的草稿可以保存到数据库。
22. 使用整数 `version` 进行乐观并发控制。
23. 业务内容默认软删除；软删除后保留 15 天，再由定时清理任务物理删除正文等业务数据。
24. MVP 搜索使用 MySQL `LIKE`，后续再评估 FULLTEXT。
25. 普通用户可以自行注册；自行注册的账户角色固定为 `user`。
26. 用户名允许修改，但必须由后端执行唯一性检查和规范化。
27. 私人信件允许转发；转发通过独立授权关系实现，不复制私人信件正文。
28. 修改已公开信件时，旧版本立即停止展示；修改后的版本重新审核通过后再公开。

## 3. 状态模型

### 3.1 状态字段

1. `status`：

```text
draft
active
deleted
```

2. `visibility`：

```text
private
public
```

3. 审核过程不使用以下状态：

```text
pending
rejected
hidden
withdrawn
```

### 3.2 状态判断规则

1. 作者草稿：

```text
status = draft
```

2. 等待管理员审核的信墙信件：

```text
status = active
visibility = public
submitted_at IS NOT NULL
published_at IS NULL
```

3. 已公开的信墙信件：

```text
status = active
visibility = public
published_at IS NOT NULL
deleted_at IS NULL
```

4. 已发送给某个用户的私人信件：

```text
status = active
visibility = private
recipient_type = user
recipient_user_id IS NOT NULL
```

5. 管理员退回公开信件修改：

```text
status = draft
submitted_at = NULL
published_at = NULL
```

6. 作者撤下公开信件：

```text
status = draft
published_at = NULL
```

7. 删除内容：

```text
status = deleted
deleted_at IS NOT NULL
```

8. 退回原因、审核人和审核时间写入 `moderation_records`，不增加额外信件状态。

## 4. MySQL 基础约束

1. MySQL 版本为 8.x。
2. 存储引擎为 `InnoDB`。
3. 数据库字符集为 `utf8mb4`。
4. 默认排序规则为 `utf8mb4_0900_ai_ci`。
5. 业务时间使用 UTC `DATETIME(6)`。
6. 表名与列名使用 `snake_case`。
7. API 字段使用 `lowerCamelCase`。
8. 对外 ID 使用带前缀的 ULID 字符串。
9. 状态字段使用 `VARCHAR` 和 `CHECK`，不使用 MySQL `ENUM`。
10. 应用使用 `luojia_app`，禁止使用 root 运行。

## 5. 通用字段

1. 主要业务表使用以下公共字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `CHAR(30)` | 带资源前缀的 ULID |
| `created_at` | `DATETIME(6)` | 创建时间，UTC |
| `updated_at` | `DATETIME(6)` | 最后更新时间，UTC |
| `deleted_at` | `DATETIME(6) NULL` | 软删除时间 |
| `version` | `INT UNSIGNED` | 乐观锁版本，从 1 开始 |

2. 更新业务记录时使用：

```sql
UPDATE ...
SET ..., version = version + 1
WHERE id = :id AND version = :expected_version;
```

3. 受影响行数为 0 时返回 HTTP `409` 版本冲突。

## 6. `users` 用户表

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `usr_` |
| `username` | `VARCHAR(50)` | 唯一、不可为空，登录账号 |
| `password_hash` | `VARCHAR(255)` | Argon2id 哈希，不存明文密码 |
| `display_name` | `VARCHAR(30)` | 对外显示名称 |
| `avatar_url` | `VARCHAR(500) NULL` | 可选头像地址 |
| `role` | `VARCHAR(16)` | `user` 或 `admin` |
| `is_active` | `BOOLEAN` | 是否允许登录 |
| `username_changed_at` | `DATETIME(6) NULL` | 最近一次修改用户名的时间 |
| `created_at` | `DATETIME(6)` | 创建时间 |
| `updated_at` | `DATETIME(6)` | 更新时间 |
| `deleted_at` | `DATETIME(6) NULL` | 软删除时间 |
| `version` | `INT UNSIGNED` | 乐观锁版本 |

1. 唯一约束：`UNIQUE(username)`。
2. 用户名保存和登录查询时统一转为小写，格式为 3–32 位小写字母、数字或下划线。
3. 普通用户可以自行注册，注册接口只能创建 `role=user` 的账户。
4. 用户修改用户名时必须提交当前密码；后端重新校验唯一性并更新 `username_changed_at`。
5. 前端不得提交或修改 `role`、`is_active` 等管理字段。
6. 删除用户后不物理删除其审核与安全记录。
7. 接收者搜索接口只返回 `id`、`username`、`displayName` 和 `avatarUrl`。

## 7. `sessions` 登录会话表

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `ses_` |
| `user_id` | `CHAR(30)` | 外键到 `users.id` |
| `session_token_hash` | `CHAR(64)` | 唯一，只保存 Token 哈希 |
| `csrf_token_hash` | `CHAR(64)` | CSRF Token 哈希 |
| `expires_at` | `DATETIME(6)` | 过期时间 |
| `last_seen_at` | `DATETIME(6)` | 最近使用时间 |
| `revoked_at` | `DATETIME(6) NULL` | 主动退出或强制失效 |
| `created_at` | `DATETIME(6)` | 创建时间 |

1. Cookie 只保存原始 Session Token。
2. 数据库只保存 Session Token 的不可逆哈希。
3. 退出登录时填写 `revoked_at`。
4. 定期清理已过期或已撤销会话。

## 8. 固定选项表

### 8.1 `locations`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `loc_` |
| `name` | `VARCHAR(40)` | 地点名称 |
| `slug` | `VARCHAR(50)` | 唯一稳定标识 |
| `is_enabled` | `BOOLEAN` | 是否允许前端选择 |
| `sort_order` | `INT` | 展示顺序 |
| `created_at` | `DATETIME(6)` | 创建时间 |
| `updated_at` | `DATETIME(6)` | 更新时间 |

### 8.2 `patterns`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `pat_` |
| `name` | `VARCHAR(50)` | 图案名称 |
| `slug` | `VARCHAR(60)` | 唯一稳定标识 |
| `preview_url` | `VARCHAR(500)` | 预览图地址 |
| `asset_url` | `VARCHAR(500)` | 正式资源地址 |
| `is_enabled` | `BOOLEAN` | 是否允许选择 |
| `sort_order` | `INT` | 展示顺序 |
| `created_at` | `DATETIME(6)` | 创建时间 |
| `updated_at` | `DATETIME(6)` | 更新时间 |

1. 前端只能使用 `/metadata` 返回且 `is_enabled=true` 的选项。
2. 已被历史内容使用的地点和图案不能直接物理删除。
3. 停用选项不影响已有信件展示。
4. 初版信纸资源固定为：

| `slug` | 展示名称 | 资源路径 |
|---|---|---|
| `kraft` | 牛皮纸 | `/pictures/material/letter-paper/niupi.png` |
| `rice-yellow` | 米黄信纸 | `/pictures/material/letter-paper/rice-yellow.png` |
| `white` | 白色信纸 | `/pictures/material/letter-paper/white.png` |

5. 三张初版资源尺寸均为 `1055 × 1491`；`preview_url` 和 `asset_url` 初版可以指向同一文件。
6. 默认信纸尚未指定；前端在确认默认项前不得依赖数组顺序推断默认值。

## 9. `letters` 信件表

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `let_` |
| `author_id` | `CHAR(30)` | 外键到 `users.id` |
| `parent_letter_id` | `CHAR(30) NULL` | 完整回信关联的原信 |
| `recipient_type` | `VARCHAR(16)` | `wall` 或 `user` |
| `recipient_user_id` | `CHAR(30) NULL` | 收信用户；信墙信件为空 |
| `title` | `VARCHAR(80)` | 2–80 个 Unicode 字符 |
| `content` | `TEXT` | 20–1500 个 Unicode 字符，纯文本 |
| `pen_name` | `VARCHAR(30) NULL` | 可选笔名 |
| `is_anonymous` | `BOOLEAN` | 是否匿名展示 |
| `location_id` | `CHAR(30) NULL` | 外键到 `locations.id` |
| `pattern_id` | `CHAR(30)` | 外键到 `patterns.id` |
| `status` | `VARCHAR(16)` | `draft`、`active`、`deleted` |
| `visibility` | `VARCHAR(16)` | `private` 或 `public` |
| `allow_responses` | `BOOLEAN` | 是否允许简短回应 |
| `allow_replies` | `BOOLEAN` | 是否允许完整回信 |
| `submitted_at` | `DATETIME(6) NULL` | 提交管理员审核时间 |
| `published_at` | `DATETIME(6) NULL` | 审核通过并公开的时间 |
| `created_at` | `DATETIME(6)` | 创建时间 |
| `updated_at` | `DATETIME(6)` | 更新时间 |
| `deleted_at` | `DATETIME(6) NULL` | 软删除时间 |
| `version` | `INT UNSIGNED` | 乐观锁版本 |

1. `recipient_type=wall` 时，`recipient_user_id` 必须为空，`visibility=public`。
2. `recipient_type=user` 时，`recipient_user_id` 必填，`visibility=private`。
3. 用户定向信件只有作者、原接收者和有效转发接收者可以读取。
4. 草稿只有作者可以读取和编辑。
5. 公开列表只查询已经填写 `published_at` 的有效记录。
6. `parent_letter_id` 不为空时，该原信自身的 `parent_letter_id` 必须为空。
7. 完整回信不能形成无限树或循环关系。
8. `is_anonymous=true` 时，API 不返回作者内部 ID 和笔名。
9. `pattern_id` 必须指向可用或历史已使用的图案。
10. 修改已公开信件时，后端立即清空 `published_at`；旧内容不再对外展示。
11. 作者选择重新提交时填写新的 `submitted_at`，审核通过后再填写 `published_at`。

## 10. `letter_forwards` 私人信件转发授权表

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `fwd_` |
| `letter_id` | `CHAR(30)` | 被转发的私人信件 |
| `forwarded_by_user_id` | `CHAR(30)` | 执行转发的用户 |
| `recipient_user_id` | `CHAR(30)` | 获得读取权限的用户 |
| `created_at` | `DATETIME(6)` | 转发时间 |
| `deleted_at` | `DATETIME(6) NULL` | 撤销或失效时间 |

1. 转发只创建读取授权，不复制标题、正文、作者或收件人数据。
2. 只有原发送者、原接收者或仍持有有效转发授权的用户可以继续转发。
3. 只允许转发 `status=active`、`visibility=private` 的信件。
4. 同一信件对同一用户最多存在一条有效授权。
5. 原信软删除后，全部转发授权立即失效；15 天清理期内也不能继续读取。
6. 管理员不会因角色而自动获得转发或读取权限。

## 11. `resonances` 共鸣表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `rso_` |
| `user_id` | `CHAR(30)` | 操作用户 |
| `letter_id` | `CHAR(30)` | 公开信件 |
| `created_at` | `DATETIME(6)` | 创建时间 |

1. 唯一约束：`UNIQUE(user_id, letter_id)`。
2. 重复共鸣返回原有结果，不创建重复记录。
3. 共鸣数量可以实时统计，确认性能瓶颈后再增加缓存计数。

## 12. `favorites` 收藏表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `fav_` |
| `user_id` | `CHAR(30)` | 收藏用户 |
| `letter_id` | `CHAR(30)` | 被收藏信件 |
| `created_at` | `DATETIME(6)` | 创建时间 |

1. 唯一约束：`UNIQUE(user_id, letter_id)`。
2. 取消收藏直接删除关联记录。
3. 已不可访问的信件不能通过收藏接口泄露正文。

## 13. `responses` 简短回应表

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `res_` |
| `letter_id` | `CHAR(30)` | 外键到公开信件 |
| `author_id` | `CHAR(30)` | 外键到用户 |
| `content` | `VARCHAR(300)` | 2–300 个 Unicode 字符，纯文本 |
| `pen_name` | `VARCHAR(30) NULL` | 可选笔名 |
| `is_anonymous` | `BOOLEAN` | 是否匿名展示 |
| `status` | `VARCHAR(16)` | `active` 或 `deleted` |
| `submitted_at` | `DATETIME(6)` | 提交审核时间 |
| `published_at` | `DATETIME(6) NULL` | 审核通过时间 |
| `created_at` | `DATETIME(6)` | 创建时间 |
| `updated_at` | `DATETIME(6)` | 更新时间 |
| `deleted_at` | `DATETIME(6) NULL` | 软删除时间 |
| `version` | `INT UNSIGNED` | 乐观锁版本 |

1. 简短回应不使用评论树。
2. 公开页面只返回已经填写 `published_at` 的记录。
3. 原信必须已经公开并允许简短回应。
4. 管理员退回时保留审核记录，回应不会公开。

## 14. `moderation_records` 审核记录表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `mod_` |
| `target_type` | `VARCHAR(16)` | `letter` 或 `response` |
| `target_id` | `CHAR(30)` | 被审核资源 ID |
| `actor_user_id` | `CHAR(30)` | 提交者或管理员 |
| `action` | `VARCHAR(32)` | `submitted`、`approved`、`returned_for_edit`、`deleted` |
| `reason` | `VARCHAR(300) NULL` | 退回或删除原因 |
| `target_version` | `INT UNSIGNED` | 审核时资源版本 |
| `created_at` | `DATETIME(6)` | 操作时间 |

1. 审核通过、退回和删除只有 `admin` 可以执行。
2. `returned_for_edit` 和 `deleted` 必须填写原因。
3. 审核记录只追加，不修改历史记录。
4. 审核查询默认排除私人信件。
5. 管理员不能通过审核接口读取私人信件正文。

## 15. `notifications` 站内通知表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `ntf_` |
| `recipient_user_id` | `CHAR(30)` | 通知接收用户 |
| `actor_user_id` | `CHAR(30) NULL` | 触发通知的用户 |
| `type` | `VARCHAR(32)` | 通知类型 |
| `target_type` | `VARCHAR(16)` | `letter` 或 `response` |
| `target_id` | `CHAR(30)` | 关联资源 ID |
| `payload` | `JSON NULL` | 最小化的展示快照，不存完整私信正文 |
| `read_at` | `DATETIME(6) NULL` | 已读时间 |
| `created_at` | `DATETIME(6)` | 创建时间 |
| `deleted_at` | `DATETIME(6) NULL` | 用户删除通知时间 |

1. 首版通知类型：

```text
letter_approved
letter_returned
response_received
reply_received
private_letter_received
private_letter_forwarded
```

2. 通知不得复制完整私人信件正文。
3. 用户只能读取和修改自己的通知。

## 16. `idempotency_records` 幂等记录表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `CHAR(30)` | 主键，前缀 `ide_` |
| `user_id` | `CHAR(30)` | 请求用户 |
| `scope` | `VARCHAR(100)` | 接口范围 |
| `idempotency_key` | `VARCHAR(128)` | 客户端提交的 Key |
| `request_hash` | `CHAR(64)` | 请求体哈希 |
| `http_status` | `SMALLINT NULL` | 首次响应状态 |
| `response_body` | `JSON NULL` | 首次响应结果 |
| `expires_at` | `DATETIME(6)` | 失效时间 |
| `created_at` | `DATETIME(6)` | 创建时间 |

1. 唯一约束：`UNIQUE(user_id, scope, idempotency_key)`。
2. 相同 Key 和不同请求体返回 HTTP `409`。
3. 记录默认保留 24 小时。

## 17. 权限矩阵

| 操作 | 游客 | `user` | `admin` |
|---|---:|---:|---:|
| 自行注册账户 | 允许，只能注册为 `user` | 不适用 | 不适用 |
| 修改用户名 | 不允许 | 允许自己的 | 允许自己的 |
| 浏览已公开信墙信件 | 允许 | 允许 | 允许 |
| 浏览已公开简短回应 | 允许 | 允许 | 允许 |
| 本地开始写草稿 | 允许 | 允许 | 允许 |
| 云端保存草稿 | 不允许 | 允许自己的 | 允许自己的 |
| 向信墙提交公开信件 | 不允许 | 允许 | 允许 |
| 向某个用户发送私人信件 | 不允许 | 允许 | 允许 |
| 转发私人信件 | 不允许 | 仅自己有读取权时 | 仅自己有读取权时 |
| 读取私人信件 | 不允许 | 发送者、接收者或有效转发接收者 | 仅自己拥有上述关系时 |
| 编辑草稿 | 不允许 | 仅自己的 | 仅自己的 |
| 修改已公开信件 | 不允许 | 仅自己的，重新审核 | 仅自己的，重新审核 |
| 共鸣和收藏 | 不允许 | 允许 | 允许 |
| 创建简短回应 | 不允许 | 允许 | 允许 |
| 创建完整回信 | 不允许 | 允许 | 允许 |
| 审核公开信件 | 不允许 | 不允许 | 允许 |
| 审核简短回应 | 不允许 | 不允许 | 允许 |
| 管理地点、图案 | 不允许 | 不允许 | 允许 |
| 读取他人的私人信件 | 不允许 | 不允许 | 默认不允许 |
| 管理用户状态 | 不允许 | 不允许 | 允许 |

1. 权限必须由 FastAPI 服务端验证。
2. 前端隐藏按钮不构成权限保护。
3. 私人资源越权访问统一返回 HTTP `404`。
4. `admin` 角色不会自动绕过私人信件访问条件。
5. MVP 不实现管理员“紧急读取私人信件”的接口。

## 18. 关键索引

1. `users`：`UNIQUE(username)`。
2. `sessions`：`UNIQUE(session_token_hash)`、`INDEX(user_id, expires_at)`。
3. 公开信件：`INDEX(visibility, status, published_at, id)`。
4. 审核队列：`INDEX(visibility, status, submitted_at, published_at)`。
5. 作者信箱：`INDEX(author_id, status, updated_at, id)`。
6. 接收信箱：`INDEX(recipient_user_id, status, updated_at, id)`。
7. 地点筛选：`INDEX(location_id, published_at, id)`。
8. 完整回信：`INDEX(parent_letter_id, published_at, id)`。
9. 简短回应列表：`INDEX(letter_id, published_at, id)`。
10. 简短回应审核：`INDEX(status, submitted_at, published_at)`。
11. 收藏：`UNIQUE(user_id, letter_id)`、`INDEX(letter_id)`。
12. 共鸣：`UNIQUE(user_id, letter_id)`、`INDEX(letter_id)`。
13. 通知：`INDEX(recipient_user_id, read_at, created_at)`。
14. 审核记录：`INDEX(target_type, target_id, created_at)`。
15. 私人信件转发：`UNIQUE(letter_id, recipient_user_id)`、`INDEX(recipient_user_id, deleted_at, created_at)`。

## 19. 前端只能执行的动作

1. 调用 OpenAPI 明确声明的接口。
2. 调用注册接口创建普通用户账户；注册请求不得包含角色。
3. 修改自己的用户名和公开资料，用户名修改时提交当前密码。
4. 使用 `/metadata` 返回的地点和图案。
5. 通过 `recipientType=wall` 投递信墙。
6. 通过 `recipientType=user` 和有效 `recipientUserId` 投递某个用户。
7. 编辑自己的草稿和允许编辑的自有内容。
8. 读取自己发送、接收或通过有效转发授权获得的私人信件。
9. 在后端返回有读取权时，将私人信件转发给有效用户。
10. 对已公开信件共鸣、收藏、简短回应或完整回信。
11. 读取自己的通知和内容状态。
12. 管理员前端仅在后端确认 `role=admin` 后显示审核入口。

## 20. 前端禁止执行的动作

1. 直接连接 MySQL。
2. 获取数据库账号、密码或连接字符串。
3. 自行生成不存在的地点和图案 ID。
4. 自行填写或修改 `publishedAt`。
5. 自行把内容标记为审核通过。
6. 读取与当前用户无关的私人信件。
7. 通过修改请求体伪造 `authorId`、角色或接收者身份。
8. 绕过后端权限判断显示私密数据。
9. 把 Session、CSRF Token 或私人正文写入前端日志。

## 21. 删除与清理规则

1. 业务内容软删除后立即对所有普通接口不可见。
2. 软删除数据保留 15 天，期满后由后端定时任务执行物理清理。
3. 清理任务只处理 `deleted_at <= UTC_TIMESTAMP(6) - INTERVAL 15 DAY` 的记录。
4. 审核记录和必要的安全审计信息不随业务正文一起删除，但不得保留完整私人正文。
5. Session、幂等记录和日志按各自生命周期清理，不套用 15 天业务内容规则。

## 22. 首次 migration 前的确认状态

1. 已确认：开放普通用户自行注册。
2. 已确认：用户名允许后续修改。
3. 已确认：私人信件允许转发，使用独立授权关系且不复制正文。
4. 已确认：公开信件修改后旧版本立即停止展示。
5. 已确认：软删除数据保留 15 天。
6. 已确认：初版取消标签功能，不建立 `tags` 或 `letter_tags` 表。
7. 已确认：初版使用 `pictures/material/letter-paper` 中的三张信纸资源。
8. 待前端与视觉设计提供：初始地点清单、信纸展示顺序和默认信纸。
9. 后端负责为这些选项分配稳定 ID、写入 seed 数据、校验引用并通过 `/metadata` 返回。
10. 初始地点清单不影响表结构设计和首次 migration，可以后续作为 seed 数据补充。
