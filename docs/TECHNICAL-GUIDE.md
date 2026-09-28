# 震域：部署与技术说明

本文记录项目从浏览器访问到数据入库的完整路径、每个平台各自做什么、当前配置以及常见故障排查。网站源代码在 GitHub，静态前端在 GitHub Pages，API 后端在 Vercel，数据缓存放在 Supabase PostgreSQL；地震目录的权威来源是美国地质调查局 USGS。

## 1. 网站入口和账号项目

- GitHub 仓库（代码源）：https://github.com/ChanJeunlam/earthquake-atlas
- GitHub Pages（用户访问的前端网站）：https://chanjeunlam.github.io/earthquake-atlas/
- Vercel（服务端 API）：https://earthquake-atlas.vercel.app/
- Supabase（数据库项目）：https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi
- USGS 地震目录 API：https://earthquake.usgs.gov/fdsnws/event/1/1

GitHub 仓库主页的 About 区域只有一个 Website 地址栏。建议将正式网站 GitHub Pages 地址放在这里，因为访客点仓库首页的 Website 应当进入产品页面；Vercel 地址是后端接口，可写在本 README 与本技术文档中，不需要把两个地址拼成一个无效 URL。仓库描述可写“Cesium 三维全球地震目录；USGS 数据，GitHub Pages 前端、Vercel API、Supabase PostgreSQL 缓存”。

## 2. 一次请求经过什么

```text
浏览器
  └─ GitHub Pages：index.html + styles.css + app.js + config.js
       └─ GET https://earthquake-atlas.vercel.app/api/earthquakes?year=2026&minmagnitude=2.5
            ├─ Vercel Function：检查参数、查 Supabase 缓存
            ├─ 缓存未命中：请求 USGS FDSN Event Web Service
            ├─ 将目录事件与年份加载标记写入 Supabase PostgreSQL
            └─ 返回 GeoJSON，Cesium 在三维地球上绘制事件
```

- **前端**：原生 HTML、CSS、JavaScript；CesiumJS 用于 3D 地球和事件图层。没有构建步骤。地图底图用 OpenStreetMap，Cesium 与字体从公共 CDN 加载。
- **前端托管**：GitHub Pages 从仓库 `main` 分支根目录发布静态文件。它不会运行 Node.js，也不应该存放服务端秘密。
- **后端**：Vercel Functions，入口文件 `api/earthquakes.js`。Vercel 与 GitHub 仓库连接后，`main` 有新提交时自动构建和部署。
- **API 类型**：HTTPS `GET` 请求，返回 GeoJSON `FeatureCollection`；浏览器可跨域访问。`OPTIONS` 用于跨域预检。API 路径为 `/api/earthquakes`。
- **数据库**：Supabase 托管 PostgreSQL。`public.earthquakes` 保存按 USGS event id 去重的地震事件；`public.catalog_years` 记载某年目录是否已缓存以及数量。迁移文件在 `supabase/migrations/`。
- **权威数据**：USGS FDSN Event Web Service。Supabase 是可重复使用的缓存，避免每次都从上游下载；首次访问一个年份时仍可直接从 USGS 加载。

## 3. 请求参数和响应

请求示例：

```http
GET https://earthquake-atlas.vercel.app/api/earthquakes?year=2026&minmagnitude=2.5
```

- `year`：必填整数，范围从 1900 到当前 UTC 年。
- `minmagnitude`：可选，默认 `2.5`，范围 0 至 9；页面提供 M2.5、M4、M5、M6 选项。
- `refresh=1`：跳过缓存读并从 USGS 重新获取，响应不使用 CDN 缓存。
- 成功响应是 GeoJSON，`features` 每一项的坐标依次为经度、纬度、深度（km）。`source` 表示来自 `supabase` 缓存还是 `usgs`。
- 上游请求每年最多取 20,000 条；如果 USGS 返回达到上限，`metadata.capped` 会标记可能不完整。

## 4. 账号、仓库与部署关系

### GitHub 与 Vercel 的连接

仓库是代码的唯一协作源；Vercel 项目 `earthquake-atlas` 已导入 `ChanJeunlam/earthquake-atlas`，生产分支是 `main`。提交代码到 `main` 后，Vercel 会创建新的生产部署，并将项目域名映射到最新成功部署。GitHub Pages 同样从这个仓库发布前端文件。一次提交可能同时触发 Vercel 与 Pages 的更新。

仓库根目录有 `api/`，因此 Vercel 可将后端文件打包成 Function；Pages 忽略并不会运行这些 API 文件。

### GitHub Pages 设置

仓库 Settings → Pages → Build and deployment：选择 **Deploy from a branch**、分支 `main`、目录 `/(root)` 并保存。等待 Pages 部署完成后访问上方 Pages 地址。仓库根目录必须有 `index.html`。

### Vercel 环境变量

Vercel 项目 Settings → Environment Variables 当前设置了以下 **Production** 变量：

| 名称 | 用途 | 是否保密 |
|---|---|---|
| `SUPABASE_URL` | Supabase 项目 API 地址（本项目为 `https://nofbidofzmoetzsdrhsi.supabase.co`） | 否，但只供服务端读取 |
| `SUPABASE_SERVICE_ROLE_KEY` | 后端访问数据库的高权限密钥，供 PostgREST 请求鉴权 | 是，严禁写入前端、GitHub 文件、日志或聊天 |

新增或修改 Vercel 环境变量后，必须重新部署，已运行的部署不会自动读取新变量。将来如果需要 Preview 环境测试，应另外将变量加到 Preview；此站点当前只配置 Production。

#### Supabase service-role 密钥是什么

它是 Supabase 项目的服务端数据库凭证，可绕过表的 Row Level Security（RLS）策略。后端用它将 USGS 目录写入数据库并读缓存。它不是网站访客的密钥、不是 GitHub token，也不是数据库密码。只能保存在 Vercel Environment Variables 等服务器秘密管理器中。不能设置为 `PUBLIC_`、`VITE_` 等会打进浏览器包的变量，不能复制到 `config.js`，不能提交到仓库。

### “Enable access to System Environment Variables” 是什么

这是 Vercel 环境变量页面上的一个访问开关，让 Function/构建任务能够读取 Vercel 平台预置的系统变量（例如部署域名、部署环境、Git commit 等 `VERCEL_*` 元数据）。它不是 Supabase 配置，也不会创建或授予 Supabase 权限；本项目代码不依赖它。当前页面保留其默认勾选状态，不影响上面两个自定义变量。理解它时可把它看作“是否让程序读取 Vercel 自动提供的运行环境信息”。

## 5. 前端如何找到 Vercel API

文件 `config.js` 目前应包含：

```js
window.EARTHQUAKE_API_URL = 'https://earthquake-atlas.vercel.app';
```

这个 URL 是公开 API 的地址，不是密钥。API 代码在浏览器里的请求路径由它和 `/api/earthquakes` 拼成。修改它后，提交到 GitHub `main`，等待 GitHub Pages 发布，再强制刷新页面清掉旧缓存。Supabase 的秘密只放 Vercel；不放 `config.js`。

## 6. 数据库与安全设计

迁移脚本 `supabase/migrations/20260928000000_create_earthquake_catalog.sql` 建立两张表和查询索引，并开启 RLS。匿名访客没有直接读写表的策略；后端 Function 使用 service-role 凭证访问。不要为了让前端能读数据而公开 service-role key 或关闭 RLS。访客只访问 Vercel API，由 API 控制年份、震级和输出字段。

项目创建在 Supabase 免费方案，页面创建时显示 $0/月；服务使用量仍受各平台当前免费额度与政策限制。若将来流量或存储超过免费额度，平台可能要求升级或限制请求。

## 7. 修改、发布和回滚

1. 在 `D:\codex` 修改源文件。
2. 提交文件到 GitHub 仓库 `main`。Vercel 会自动部署；Pages 也会自动重新发布静态前端。
3. 到 Vercel → Deployments 查看最新提交状态。只有 **Ready** 的部署才是成功版本；**Error** 版本不会成为可用新版本。
4. 测试 API 后再打开 GitHub Pages 检查页面。API 响应 `source: "usgs"` 表示刚取上游，`source: "supabase"` 表示命中数据库缓存。
5. 若出现故障，可在 Vercel Logs 按路径 `/api/earthquakes` 查看 Function 日志；Deployments 可查看每个提交的具体版本并回滚。

## 8. 本次调试记录与“页面没有地震”的原因

本次排查顺序：

1. Vercel 部署原本显示 Ready，但访问 API 返回 `500 FUNCTION_INVOCATION_FAILED`，所以前端只能显示空目录/连接失败；这不是由年份下拉框造成的。
2. Vercel Logs 首先显示函数收到的 `request.url` 是以 `/api/...` 开始的相对路径，直接 `new URL(request.url)` 会因缺少 URL 基址而失败。
3. 第一处修复尝试假定 `request.headers.get()` 存在。日志确认 Vercel 当前使用 Node 风格请求对象，`headers` 是普通对象，因而该假定也错误。
4. 最终兼容 Vercel Node Function 的请求/响应约定：从 `request.url` 和 `request.headers.host` 解析参数；通过响应对象发送状态码、CORS/缓存头和 GeoJSON。修复提交后要等对应 Git 提交的 Vercel 部署 **Ready**，再重试 API。
5. 数据库无目录记录本身不代表数据库连接失败：首次访问某年份时应从 USGS 取数据并写入 Supabase。检查 API 是否返回 200、`features` 是否非空；若 `source: usgs`，说明上游通但缓存可能写入失败，接着看 Vercel function log 中 `Supabase catalog cache write failed`；若 `source: supabase`，表示读到了缓存。

可手工检查：

```text
https://earthquake-atlas.vercel.app/api/earthquakes?year=2026&minmagnitude=2.5
https://earthquake-atlas.vercel.app/api/earthquakes?year=2025&minmagnitude=2.5
```

Supabase SQL 查询已确认 `earthquakes` 有 20,000 条记录，`catalog_years` 有 2026 年标记；数据库凭证、写入和缓存标记已正常工作。页面检查时仍显示 `Failed to fetch`，所以当时的空白是页面没有拿到 API 响应，不是数据库空表。最新 API 代码部署后，再打开上面的 API 地址确认 HTTP 200 和 GeoJSON；如果仍失败，查看 Vercel Logs 最新请求，区分函数运行错误、浏览器网络/跨域拦截或 USGS 上游故障。

## 9. 页面字体和空白显示排查

原页面多处辅助文字只有 7–10px，特别是图例、状态和底部标签，在高分辨率屏幕上较难读。样式表现已增加字号覆盖：主要说明文字 13–15px、控制标签约 11–13px、辅助元数据约 9–10px，并针对窄屏调整；主标题与布局比例基本维持。

如果部署后页面仍是旧字号，确认 GitHub 上 `styles.css` 的最新提交已发布，重新载入页面并清除静态资源缓存。地图瓦片、Cesium CDN 或字体 CDN 被网络拦截会影响地图外观，但不应导致 API 的 GeoJSON 目录数量变成 0；先分别检查 `/api/earthquakes` 和浏览器 Network/Console。

## 10. 文件是否都上传到 GitHub

本项目根目录的应用源码与部署配置需要逐一出现在 GitHub：`index.html`、`styles.css`、`app.js`、`config.js`、`api/earthquakes.js`、`vercel.json`、`supabase/migrations/...sql`、`README.md`、`package.json`，以及本文档 `docs/TECHNICAL-GUIDE.md`。本地 `read-any-file/` 是用于读取特定文件的个人 Codex 技能，不属于网站运行依赖，也不应上传到公开仓库。`node_modules/`、密钥文件（如 `.env`）、临时日志和本地缓存也不应提交。

用 GitHub 仓库根目录和子目录列表核对上述运行文件。请注意仅存在于 `D:\codex` 的改动不会自动到 GitHub；必须明确提交/上传。`config.js` 的 API 域名是公开值，数据库密钥绝不能进入代码仓库。

