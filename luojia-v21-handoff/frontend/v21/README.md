# V21 前端交接

> **历史资料**：本文记录早期设计或接口约定，不是当前参赛演示的操作说明。当前 GitHub Pages 与 `npm run dev` 使用演示模式，公开信寄出后直接展示；`npm run dev:api` 接入的真实后端仍保留管理员审核。请以仓库根目录 README 和当前源码为准。

在仓库根目录运行 `npm run dev`，使用终端显示的地址，打开 `/frontend/v21/luojia-home.html`。

- `luojia-home.html` 是首页和各栏目入口。
- `luojia-letters.html` 是信箱、读信、写信、草稿及邮票选择。页面内的样式和脚本可直接编辑。
- `luojia-about.html` 是关于我们。
- `assets/` 存放三页实际引用的素材。

V21 默认使用浏览器本地演示数据。接后端时请参考仓库的 `backend/README.md`、`frontend/api.js` 和页面内的 `ApiClient`。重点联调登录、草稿、审核、回信和信纸素材；V21 的 API 模式还没有端到端验证。

