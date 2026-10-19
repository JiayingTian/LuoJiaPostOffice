# 珞珈烟火邮局基础功能后端协作约束

## 1 文档信息

1. 文档版本：`1.0.0`。
2. 制定日期：`2026-10-19`。
3. 适用范围：基础功能版 `1.2` 的后端开发、前后端联调和交接验收。
4. 目标读者：后端开发者、前端开发者和负责验收的团队成员。
5. 本文是 [`frontend-backend-agreement.md`](./frontend-backend-agreement.md) 的阶段性补充，不替代原协议。
6. 机器可读接口契约仍为 [`openapi.yaml`](./openapi.yaml)。本文新增或调整的字段和接口必须同步写入 OpenAPI 后才能进入联调。

## 2 本轮交付结论

本轮后端只需打通以下完整流程：用户登录后浏览已公开信件，创建并继续编辑草稿，将公开信提交审核，管理员通过或退回，作者查看自己的信件状态，以及其他用户创建并查看完整回信。

本轮必须保证刷新页面后会话仍然有效、草稿不会因为内容未完成而无法保存、重复提交不会产生重复信件、失败请求不会导致前端丢失正文。

## 3 本轮功能范围

### 3.1 必须完成

1. 注册、登录、获取当前用户和退出登录。
2. 页面刷新后的 CSRF Token 恢复。
3. 已审核公开信件的分页列表和详情。
4. 创建草稿、更新草稿、读取草稿和查询我的草稿。
5. 将现有草稿提交管理员审核。
6. 查询本人草稿、待审核、已公开和退回修改的信件。
7. 管理员查询待审核信件、查看详情、通过和退回修改。
8. 使用 `parentLetterId` 创建完整回信。
9. 查询某封公开信件下已经审核通过的完整回信。
10. 为创建信件和完整回信提供幂等保护。

### 3.2 本轮不新增

1. 定时信笺。
2. 指定用户私人寄信。
3. 私人信件转发。
4. 收藏和共鸣。
5. 简短回应。
6. 互动通知。
7. 用户搜索、信件搜索和随机拆信。
8. 专题、故事和真实首页统计。

已实现的范围外接口可以保留，但不得影响本轮接口的稳定性，也不得成为本轮验收的前置条件。

## 4 契约与兼容性

1. 已有接口继续保留，不得因本轮开发删除或改名。
2. OpenAPI 是路径、字段、类型、枚举、状态码和示例的唯一机器可读事实来源。
3. 本文与现有 OpenAPI 不一致时，后端必须先按本文列出的补充决策修改 OpenAPI，再实现代码。
4. 前端不得依赖 OpenAPI 未声明的字段。
5. 后端不得在未通知前端的情况下删除字段、收紧必填条件或改变字段语义。
6. 所有新增 JSON 字段使用 `lowerCamelCase`，数据库字段使用 `snake_case`。
7. API 基础路径保持为 `/api/v1`。

## 5 交接材料

后端开始联调前必须一次性提供以下内容：

1. 可联调的 Git 分支名或 commit SHA。
2. 与该 commit 对应的最新 `restriction/openapi.yaml`。
3. 核心接口可用状态表，状态只使用 `未开始`、`开发中`、`可联调`、`已验收`。
4. 依赖安装命令。
5. 本地启动命令。
6. Alembic 升级命令和当前 migration head。
7. 测试数据或测试账号生成命令。
8. 不包含真实密钥的 `.env.example`。
9. 测试 API 地址。
10. 允许访问测试 API 的前端 Origin。
11. 用户 A、用户 B 和管理员账号的创建方式。
12. 已知限制和暂未实现的接口清单。

任何文档、截图、日志或 Git 提交都不得包含数据库密码、Session Token、CSRF Token 或真实用户密码。

## 6 环境和启动约束

1. 后端使用 FastAPI、SQLAlchemy 2.x、Alembic、PyMySQL 和 MySQL 8.x。
2. 应用使用独立 MySQL 账户，不得使用 `root` 运行。
3. 本地后端默认地址为 `http://127.0.0.1:8000`。
4. 前端只通过环境变量配置 API 地址，不在组件中硬编码完整地址。
5. 本地联调必须明确列出允许的 Origin，并设置 `allow_credentials=true`。
6. 携带 Cookie 时不得使用 `Access-Control-Allow-Origin: *`。
7. 数据库结构只能通过 Alembic migration 变更，不得依赖 `create_all()`。
8. migration 必须能在空数据库中从头升级到当前 head。
9. 联调测试账号由后端执行 `python -m scripts.create_test_accounts` 创建或重置；终端随机密码必须单独安全发送给前端，不得提交到 Git。

## 7 登录和会话恢复

### 7.1 Session

1. Web 端继续使用服务端 Session 和 `luojia_session` Cookie。
2. 前端所有请求必须使用 `credentials: "include"`。
3. Session Cookie 在生产环境必须使用 `HttpOnly=true`、`Secure=true`、`SameSite=Lax` 和 `Path=/`。
4. 本地 HTTP 环境允许 `Secure=false`。
5. 前端不得读取、记录或自行构造 Session Cookie。

### 7.2 CSRF Token 恢复

当前登录或注册响应提供的 CSRF Token 只保存在前端内存，页面刷新后会丢失。后端必须新增以下恢复接口：

```http
GET /api/v1/auth/csrf
```

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "csrfToken": "<token>"
  },
  "requestId": "req_01..."
}
```

约束如下：

1. 该接口必须验证 Session Cookie，但自身不要求 CSRF Token。
2. 后端每次调用时生成新的 Token，数据库只保存 Token 哈希，并使旧 Token 失效。
3. 前端启动后先调用 `/auth/me` 恢复用户，再调用 `/auth/csrf` 恢复 CSRF Token。
4. 前端只把 CSRF Token 保存在内存，不写入 `localStorage`、`sessionStorage`、日志或埋点。
5. 写请求因 CSRF 失效返回 `403` 时，前端只允许重新获取一次 Token，并使用原请求体和原 `Idempotency-Key` 重试一次。
6. `/auth/csrf` 返回 `401` 时，前端清空登录状态并显示登录入口。
7. CSRF Token 缺失、错误或失效统一返回业务错误码 `40302`；普通权限不足继续使用 `40301`。

## 8 本轮接口清单

| 功能 | 方法和路径 | 本轮要求 |
|---|---|---|
| 注册 | `POST /auth/register` | 保留现有行为 |
| 登录 | `POST /auth/login` | 保留现有行为 |
| 当前用户 | `GET /auth/me` | 刷新后恢复用户 |
| CSRF 恢复 | `GET /auth/csrf` | 本轮新增 |
| 退出 | `POST /auth/logout` | 需要 CSRF Token |
| 公开信列表 | `GET /letters` | 只返回已公开信件 |
| 创建信件或草稿 | `POST /letters` | 支持不完整草稿和完整回信 |
| 信件详情 | `GET /letters/{letterId}` | 根据状态和身份判断可见性 |
| 更新草稿 | `PATCH /letters/{letterId}` | 支持继续编辑和提交审核 |
| 我的信件 | `GET /me/letters` | 返回展示状态和退回原因 |
| 完整回信列表 | `GET /letters/{letterId}/replies` | 本轮新增 |
| 待审核列表 | `GET /admin/letters` | 仅管理员 |
| 审核信件 | `POST /admin/letters/{letterId}/review` | 通过或退回修改 |

所有接口的完整请求、响应和错误 Schema 必须在 OpenAPI 中声明。

## 9 公开信件约束

1. 公开列表只返回同时满足以下条件的信件：

```text
status = active
visibility = public
published_at IS NOT NULL
deleted_at IS NULL
```

2. 默认排序为 `published_at DESC, id DESC`。
3. 分页从 `1` 开始，默认 `pageSize=20`，最大 `pageSize=50`。
4. 列表项至少包含 `id`、`title`、`excerpt`、`author`、`publishedAt`、`pattern` 和 `replyCount`。
5. `excerpt` 由后端从纯文本正文生成，最多 120 个 Unicode 字符，并保留前端生成两行摘要所需的自然文本。
6. 前端负责使用 CSS 截断为两行，后端不返回带 HTML 的摘要。
7. 公开详情不得泄露真实作者 ID、审核记录或草稿内容。
8. 匿名信件的作者只返回匿名展示信息。

## 10 草稿保存约束

### 10.1 草稿允许不完整

1. `saveAsDraft=true` 时，标题和正文允许为空或低于正式投递的最小长度。
2. 草稿标题允许 `0` 至 `80` 个 Unicode 字符。
3. 草稿正文允许 `0` 至 `1500` 个 Unicode 字符。
4. 空白字符可以暂时保存在草稿中，但正式提交前必须按去除首尾空白后的内容重新校验。
5. 草稿可以暂时缺少 `locationId`，地点始终为可选字段。
6. 本轮只启用白色信纸，稳定 `patternId` 为 `pat_00000000000000000000000001`，资源路径为 `/pictures/material/letter-paper/white.png`。
7. 如果创建草稿时没有提供 `patternId`，后端使用本轮唯一启用的图案；如果启用图案不是唯一值，后端返回 `422`，不得依赖数据库顺序猜测默认项。
8. 草稿不得出现在公开列表、审核列表或其他用户的查询结果中。

### 10.2 创建草稿

创建草稿仍使用：

```http
POST /api/v1/letters
```

最小请求示例：

```json
{
  "saveAsDraft": true
}
```

后端在缺失字段时使用以下草稿默认值：

```json
{
  "title": "",
  "content": "",
  "recipientType": "wall",
  "recipientUserId": null,
  "parentLetterId": null,
  "penName": null,
  "isAnonymous": false,
  "locationId": null,
  "allowResponses": true,
  "allowReplies": true
}
```

### 10.3 更新和读取草稿

1. 作者使用 `PATCH /letters/{letterId}` 局部更新草稿。
2. 更新请求只修改明确出现的字段，缺失字段保持原值；显式 `null` 只用于 OpenAPI 允许为空的字段。
3. `GET /letters/{letterId}` 必须允许作者读取自己的草稿。
4. `GET /me/letters?workflowState=draft` 必须返回作者自己的草稿。
5. 草稿创建和更新返回的数据结构必须一致，且包含 `id`、完整内容、`updatedAt` 和 `workflowState`。
6. 非作者访问草稿统一返回 `404`，避免泄露资源是否存在。

## 11 正式提交校验

创建时 `saveAsDraft=false`，或更新时 `submitForReview=true`，均视为正式提交。后端必须在事务中执行完整校验：

1. 标题去除首尾空白后为 `2` 至 `80` 个 Unicode 字符。
2. 正文去除首尾空白后为 `20` 至 `1500` 个 Unicode 字符。
3. 正文为纯文本，不接收可执行 HTML。
4. `recipientType` 本轮只接受 `wall`。
5. `recipientUserId` 必须为 `null`。
6. `patternId` 必须指向启用或该信件历史已使用的信纸图案。
7. `locationId` 可以为 `null`；非空时必须指向启用或历史已使用的地点。
8. `penName` 最多 30 个 Unicode 字符。
9. `parentLetterId` 非空时必须满足完整回信规则。
10. 校验失败返回 `422`，并在 `data.fieldErrors` 中按请求字段返回错误，不改变原草稿状态和内容。

提交成功后，公开信件必须满足：

```text
status = active
visibility = public
submitted_at IS NOT NULL
published_at IS NULL
```

## 12 我的信件和展示状态

数据库状态继续只使用 `draft`、`active` 和 `deleted`。为方便前端展示，`GET /me/letters` 必须额外返回派生字段 `workflowState`：

| `workflowState` | 判断规则 | 前端文案 |
|---|---|---|
| `draft` | `status=draft`，且最近一次审核不是退回修改 | 草稿 |
| `pendingReview` | `status=active`、`submittedAt!=null`、`publishedAt=null` | 待审核 |
| `published` | `status=active`、`publishedAt!=null` | 已公开 |
| `returnedForEdit` | `status=draft`，且最近一次审核为 `returned_for_edit` | 退回修改 |

1. `workflowState` 是 API 展示字段，不得写入数据库的 `status` 列。
2. 我的信件列表必须返回 `reviewNote`；没有退回原因时为 `null`。
3. `reviewNote` 取最近一条适用于当前版本的退回审核记录。
4. 退回原因仅对作者和管理员可见，不出现在公开列表和公开详情中。
5. `GET /me/letters` 支持按 `workflowState` 筛选，并保持稳定分页。

## 13 审核约束

1. 待审核列表只包含公开信件和公开完整回信。
2. 只有 `admin` 可以访问审核列表和审核接口。
3. 管理员可以通过 `GET /letters/{letterId}` 查看待审核详情；普通非作者用户访问时返回 `404`。
4. `approve` 操作填写 `publishedAt`，信件进入公开列表。
5. `returnForEdit` 必须填写 `reason`，并执行以下更新：

```text
status = draft
submitted_at = NULL
published_at = NULL
```

6. 每次提交、通过和退回都必须追加 `moderation_records`，不得覆盖历史记录。
7. 作者修改退回信件后，可以通过 `submitForReview=true` 再次提交。
8. 重复审核已处理的同一版本必须返回 `409`，不得重复生成审核记录。
9. 审核接口不得把私人信件加入本轮审核队列。

## 14 完整回信约束

1. 完整回信复用 `POST /letters`，并填写 `parentLetterId`。
2. 原信必须是已公开且未删除的信件，并且 `allowReplies=true`。
3. 原信自身的 `parentLetterId` 必须为 `null`，因此本轮只允许一层完整回信。
4. 完整回信本身按公开信件执行草稿、提交和审核流程。
5. 未审核通过的完整回信只对作者和审核管理员可见。
6. 查询已公开完整回信使用：

```http
GET /api/v1/letters/{letterId}/replies?page=1&pageSize=20
```

7. 回信列表只返回 `publishedAt` 非空且未删除的直接回信，默认按 `publishedAt ASC, id ASC` 排序。
8. 原信不存在、未公开或已删除时，公开回信列表返回 `404`。
9. 创建完整回信也必须携带 `Idempotency-Key`。

## 15 幂等和重复提交

1. `POST /letters` 必须携带 `Idempotency-Key`，包括创建普通信件、草稿和完整回信。
2. Key 推荐使用 UUID，长度为 `16` 至 `128` 个字符。
3. 后端按用户、路由和 Key 保存请求摘要及首次响应。
4. 相同 Key 和相同请求体在 24 小时内返回首次结果，不创建重复记录。
5. 相同 Key 配合不同请求体返回 `409`。
6. 前端点击提交后立即禁用按钮。
7. 网络超时、CSRF Token 恢复或用户主动重试时，必须复用原 Key。
8. `PATCH` 提交已经处于待审核状态的同一信件时，不得重复写入提交记录；返回当前结果或稳定的 `409`，具体行为必须在 OpenAPI 中固定。

## 16 错误和失败恢复

1. 所有错误返回统一的 `code`、`message`、`data` 和 `requestId`。
2. 字段校验错误在 `data.fieldErrors` 中使用请求字段名作为键。
3. 前端使用 `code` 判断业务错误，不依赖中文 `message`。
4. 登录失效时返回 `401`，前端保留当前编辑文本并显示登录入口。
5. CSRF 校验失败时返回 `403`，前端按第 7.2 节恢复一次 Token。
6. 无权读取草稿、待审核信或其他受限信件时返回 `404`。
7. 状态冲突、重复审核和幂等冲突返回 `409`。
8. 后端内部错误返回 `500`，不得暴露 SQL、调用栈、文件路径或配置值。
9. 所有响应体和 `X-Request-Id` 响应头必须提供同一个 `requestId`。
10. 后端失败不得部分提交数据库事务。

## 17 文本和显示约束

1. 标题、正文、笔名和退回原因按 Unicode 字符计数，不按 UTF-8 字节计数。
2. 中文、Emoji 和 `\n` 换行必须能够完整写入、读取和再次更新。
3. 正文存储为纯文本；后端不得原样返回可执行 HTML。
4. 前端使用 `textContent` 或框架默认转义能力展示正文。
5. 信封悬停摘要、双击进入详情、按钮悬停发光均由前端实现，不增加后端字段或事件接口。
6. 信纸资源由前端展示，后端只返回稳定图案 ID、名称和资源 URL。

## 18 权限约束

1. 游客只能读取已公开信件和已公开完整回信。
2. 登录用户只能创建、读取和修改自己的草稿。
3. 作者可以查看自己的待审核信件和退回原因。
4. 普通用户不能读取其他人的草稿或待审核信件。
5. 管理员可以读取本轮审核队列中的公开待审核信件。
6. 管理员身份不能由前端请求体指定，只能由后端 Session 对应的用户角色决定。
7. 前端隐藏按钮不构成权限控制，所有权限必须由后端验证。

## 19 联调验收场景

### 19.1 草稿恢复

1. 用户 A 注册或登录。
2. 用户 A 只输入部分正文并保存草稿。
3. 页面刷新或关闭后重新打开。
4. 前端通过 Session 恢复用户和 CSRF Token。
5. 用户 A 在我的信件中找到草稿并继续编辑。

### 19.2 公开信审核

1. 用户 A 完成草稿并提交审核。
2. 用户 A 的列表显示 `pendingReview`。
3. 普通用户 B 无法读取该待审核信件。
4. 管理员在审核列表中打开详情并通过。
5. 用户 B 在另一浏览器会话中从公开列表读取该信件。

### 19.3 退回修改

1. 管理员填写原因并退回用户 A 的信件。
2. 用户 A 的列表显示 `returnedForEdit` 和退回原因。
3. 用户 A 修改后重新提交。
4. 新审核记录保留历史，公开列表只显示最新审核通过后的内容。

### 19.4 完整回信

1. 用户 B 从公开信件详情创建带 `parentLetterId` 的完整回信。
2. 回信审核前不出现在公开回信列表中。
3. 管理员通过后，原信的回信列表能够读取该回信。
4. 对已有 `parentLetterId` 的回信再次回信时返回 `422`。

### 19.5 边界与失败

1. 中文、Emoji、换行、空草稿和 1500 字正文均能正确处理。
2. 标题、正文和退回原因的边界校验返回对应字段错误。
3. 连续点击或超时重试不会产生重复信件。
4. 登录失效、CSRF 失效和服务器错误均不会清空前端编辑区。

## 20 后端完成标准

后端只有同时满足以下条件，才能把核心接口标记为 `可联调`：

1. OpenAPI 已同步并可正常解析，所有 `$ref` 均有效。
2. FastAPI `/docs` 中可以看到对应接口、请求字段和响应模型。
3. ORM Model、Pydantic Schema、Alembic migration 和 OpenAPI 已同步提交。
4. 自动化测试覆盖草稿、提交、审核、回信、权限、CSRF 恢复和幂等场景。
5. migration 可以在空数据库中完整执行。
6. 本文第 19 节的验收场景通过。
7. 交接说明包含启动命令、测试账号生成方式和已知限制。

## 21 前端责任

1. 前端按 OpenAPI 生成类型或维护等价的类型定义。
2. 所有请求携带 `credentials: "include"`。
3. 写请求携带内存中的 `X-CSRF-Token`。
4. 创建信件和回信时生成并复用 `Idempotency-Key`。
5. 草稿允许保存不完整内容，正式提交前可以做同等前置校验，但以后端结果为准。
6. 网络错误和业务错误使用不同提示。
7. 请求失败时保留编辑区内容。
8. 前端不得记录密码、Cookie、CSRF Token 或完整私密正文。
9. 前端不得自行把信件标记为审核通过，也不得伪造 `workflowState`。

## 22 交接回复模板

后端提交联调版本时，回复必须包含以下内容：

```text
分支或 commit：
OpenAPI 版本：
API 地址：
允许的前端 Origin：
安装命令：
启动命令：
迁移命令与 head：
测试账号创建命令：

核心接口状态：
- 认证与退出：
- CSRF 恢复：
- 公开信件列表与详情：
- 草稿创建、更新与读取：
- 我的信件：
- 提交审核：
- 管理员审核：
- 完整回信创建与列表：

草稿校验方案：
CSRF 恢复方案：
审核状态与退回原因方案：
完整回信列表方案：
已知限制：
```

## 23 OpenAPI 必须同步的补充项

现有 OpenAPI 在进入本轮联调前必须完成以下调整：

1. 新增 `GET /auth/csrf` 及响应 Schema。
2. 将草稿请求改为条件校验，允许 `saveAsDraft=true` 时标题和正文为空。
3. 保持正式提交时标题 `2–80` 字、正文 `20–1500` 字的严格校验。
4. 在我的信件响应中增加 `workflowState` 和 `reviewNote`。
5. 为 `GET /me/letters` 增加 `workflowState` 筛选参数。
6. 新增 `GET /letters/{letterId}/replies` 及分页响应 Schema。
7. 明确作者和管理员读取草稿、待审核信件详情的权限响应。
8. 为草稿创建、提交审核、退回修改和完整回信补充请求与响应示例。

