# 震域｜全球地震目录

一个在三维地球上查看全球地震的网页。当前目录口径是 **USGS 记录的震级 M 2.5 及以上事件**；页面可以按年份、最低震级和月份筛选。这里的“完整”指 USGS 该口径下查询到的事件，不包含 M 2.5 以下的微震，也不代表地震学意义上的全球全部震动。

## 常用地址（建议收藏）

- **网站（给访客打开）**：[https://chanjeunlam.github.io/earthquake-atlas/](https://chanjeunlam.github.io/earthquake-atlas/)
- **GitHub 仓库（代码、版本历史、About 设置）**：[https://github.com/ChanJeunlam/earthquake-atlas](https://github.com/ChanJeunlam/earthquake-atlas)
- **Vercel 项目（后端 API 部署、日志、环境变量）**：[https://vercel.com/hugo1-3a2b/earthquake-atlas](https://vercel.com/hugo1-3a2b/earthquake-atlas)
- **Vercel 部署记录（检查是否 Ready）**：[https://vercel.com/hugo1-3a2b/earthquake-atlas/deployments](https://vercel.com/hugo1-3a2b/earthquake-atlas/deployments)
- **Vercel 环境变量设置**：[https://vercel.com/hugo1-3a2b/earthquake-atlas/settings/environment-variables](https://vercel.com/hugo1-3a2b/earthquake-atlas/settings/environment-variables)
- **后端 API 示例（2026，M2.5+）**：[https://earthquake-atlas.vercel.app/api/earthquakes?year=2026&minmagnitude=2.5](https://earthquake-atlas.vercel.app/api/earthquakes?year=2026&minmagnitude=2.5)
- **Supabase 项目总览**：[https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi)
- **Supabase 地震表**：[https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi/editor/17608?schema=public](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi/editor/17608?schema=public)
- **Supabase API 设置（查看项目 URL 与 API key）**：[https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi/settings/api](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi/settings/api)
- **USGS 官方地震目录说明**：[https://earthquake.usgs.gov/fdsnws/event/1/](https://earthquake.usgs.gov/fdsnws/event/1/)

首次配置、平台连接、数据库密钥、部署流程、接口定义和调试方法见[零基础技术与运维手册](docs/TECHNICAL-GUIDE.md)。

## 技术栈

| 部分 | 使用技术 | 实际运行位置 | 作用 |
|---|---|---|---|
| 网页结构 | HTML5 | GitHub Pages | 页面结构、按钮、表单和可访问性标记 |
| 网页样式 | CSS3 | GitHub Pages | 深色界面、响应式布局、图例、时间轴和事件卡片 |
| 浏览器程序 | 原生 JavaScript（ES Modules） | GitHub Pages 上的访客浏览器 | 请求 API、筛选 GeoJSON、交互 Cesium 地图 |
| 三维地图 | CesiumJS 1.145 | 访客浏览器，CDN 下载 | 绘制 WGS 84 地球、底图与地震点 |
| 地图底图 | OpenStreetMap 瓦片 | OpenStreetMap 服务 | 海岸线、国界和地图地名（网络可用时） |
| 前端托管 | GitHub Pages | GitHub Pages CDN | 发布根目录的静态文件；不运行 Node 服务 |
| 后端运行 | Vercel Node.js Functions | Vercel | 校验查询、调用 USGS、访问 Supabase、响应浏览器 |
| API | HTTPS GET / JSON / GeoJSON | Vercel Function | 在浏览器与数据库/USGS 之间传递地震记录 |
| 数据库 | Supabase 托管 PostgreSQL | Supabase 云项目 | 缓存 USGS 目录及每年采集完整性标记 |
| 数据源 | USGS FDSN Event Web Service | USGS | 提供权威地震事件查询 |

## 运行文件

- `index.html`：页面结构和 CesiumJS CDN 引用。
- `styles.css`：网站样式、地图覆盖层和移动端布局。
- `app.js`：Cesium 初始化、调用后端、震级/月份筛选与弹窗。
- `config.js`：公开的 Vercel API 根地址；这里不放数据库密码或服务密钥。
- `api/earthquakes.js`：Vercel 服务端 API；Pages 不会执行此文件。
- `supabase/migrations/`：数据库表与目录版本字段的 SQL 迁移历史。
- `vercel.json`：Vercel 对 API 函数时长等部署设置。
- `docs/TECHNICAL-GUIDE.md`：完整配置与运维手册。

## 数据完整性说明

USGS 对单次事件查询设有返回数上限。后端按 UTC 月份拆成 12 次查询并合并，因此某一年超过单次查询上限时，不会再把整年目录静默截为相同的 20,000 条。年份标记记录所用采集版本、事件数和是否有月份触顶。若任何一个月达到单次上限，API 会把 `metadata.capped` 设为 `true`，网页显示“至少 N 条”；否则显示采集到的数量。

2026 年是当前年份，所以只应包含 1 月 1 日至现在已发生的事件；未来月份没有记录是正常的。月份时间轴选择“全年”显示所选年份已有的全部事件，拖到某个月则只显示该月。筛选震级和月份不会再次访问数据库。

更详细的采集范围、逐月核对结果和刷新方式见技术手册。不要把“没有记录”误读为数据库故障：需分别查看 API 的 HTTP 状态、`source`、`features.length` 和 Supabase 的年份标记。

## 安全提醒

`SUPABASE_SERVICE_ROLE_KEY` 是可绕过 RLS 的服务端高权限凭证，只能保存在 Vercel 项目的 Environment Variables 中。绝不能把它写进 `config.js`、提交到 GitHub、粘贴到网页源代码或截图里。若怀疑泄露，应在 Supabase 轮换密钥并更新 Vercel 环境变量，然后重新部署。

