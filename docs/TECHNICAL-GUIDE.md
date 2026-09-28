# 震域：零基础部署、数据与故障排查手册

> 本手册按“打开哪个网站、点什么、字段是什么、看到什么算成功”来写。平台按钮可能因界面更新而略有改名；遇到变化时，可从下列项目链接进入对应设置页。
>
> **当前项目口径：**USGS FDSN 目录中的 M 2.5 及以上地震事件。M 2.5 以下事件不在本应用的数据范围内。“全部地震”在本手册中特指符合这个筛选条件、USGS 能提供的事件。

## 0. 最常用的地址

请把本节收藏起来。每个链接是不同服务，不能互相替代。

| 要做什么 | 地址 |
|---|---|
| 访客打开网站 | [GitHub Pages 网站](https://chanjeunlam.github.io/earthquake-atlas/) |
| 查看或修改全部代码 | [GitHub 仓库](https://github.com/ChanJeunlam/earthquake-atlas) |
| 查看 Vercel 构建是否成功 | [Vercel Deployments](https://vercel.com/hugo1-3a2b/earthquake-atlas/deployments) |
| 设置 Vercel 后端密钥 | [Vercel Environment Variables](https://vercel.com/hugo1-3a2b/earthquake-atlas/settings/environment-variables) |
| 查看 Vercel 项目与 API 日志 | [Vercel 项目](https://vercel.com/hugo1-3a2b/earthquake-atlas) |
| 查看 Supabase 项目与数据库 | [Supabase 项目总览](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi) |
| 查看 Supabase 地震表 | [Table Editor：public.earthquakes](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi/editor/17608?schema=public) |
| 查看 Supabase API URL / keys 设置 | [Supabase API Settings](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi/settings/api) |
| 测试后端：2026 年 M2.5+ | [2026 API 请求](https://earthquake-atlas.vercel.app/api/earthquakes?year=2026&minmagnitude=2.5) |
| 测试后端：2022 年 M2.5+ | [2022 API 请求](https://earthquake-atlas.vercel.app/api/earthquakes?year=2022&minmagnitude=2.5) |
| USGS API 说明 | [FDSN Event Web Service](https://earthquake.usgs.gov/fdsnws/event/1/) |
| Cesium 地图 API 说明 | [CesiumJS Viewer](https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html) |

GitHub 仓库的 **About → Website** 应填写访客网站 GitHub Pages 地址。仓库只有一个 Website 栏；后端 Vercel 地址应放在 README 和本手册里，不要把两个网址拼在一起。

## 1. 先理解四个服务如何合作

```text
访客的浏览器
  ├─ 从 GitHub Pages 下载 index.html、styles.css、app.js、config.js
  ├─ 下载 CesiumJS 地球组件与 OpenStreetMap 地图瓦片
  └─ HTTPS GET → Vercel 的 /api/earthquakes
                    ├─ 检查年份、震级等参数
                    ├─ 先读 Supabase PostgreSQL 缓存
                    ├─ 缓存没有/要求刷新时，逐月访问 USGS
                    ├─ 将事件与年份采集标记写入 Supabase
                    └─ 返回 GeoJSON → 浏览器在 Cesium 地球上绘点
```

### GitHub 是什么

GitHub 仓库是项目代码的存放处和版本历史。仓库叫 `ChanJeunlam/earthquake-atlas`，默认分支是 `main`。将代码文件保存到电脑**不会**自动更改 GitHub；必须将改动提交并推送到 `main`（或通过 GitHub 网页提交）。

### GitHub Pages 是什么

Pages 是 GitHub 提供的静态文件托管。它把仓库中的网页文件发布给访客，网址为 `https://chanjeunlam.github.io/earthquake-atlas/`。Pages 能交付 HTML、CSS、浏览器 JavaScript、图片等文件，但不会运行 Node.js 后端代码，也不能安全保存服务器密钥。

仓库设置位置：打开仓库 → **Settings → Pages → Build and deployment**。本项目采用从 `main` 分支的根目录 `/(root)` 发布；根目录有 `index.html`。当 `main` 有新提交，Pages 会自动部署静态文件。需要等 Pages 构建完成，再刷新网站；浏览器缓存可能让新文件晚一点显示。

### Vercel 是什么

Vercel 项目已连接 GitHub 仓库。`api/earthquakes.js` 会被 Vercel 识别为服务端 Function。访客请求 API 时，该文件在 Vercel 服务器运行；服务器可读取 Vercel 的私密环境变量并连接数据库。

新提交推送到连接的生产分支 `main` 后，Vercel 会自动启动一次新部署。打开上方 Deployments 链接，检查最新提交对应的卡片状态为 **Ready**。**Building** 表示仍在构建，**Error** 表示本次版本未成功。前端 Pages 与后端 Vercel 是两条部署流水线；推送同一提交会分别触发它们，各自完成时间可能不同。

### Supabase 是什么

Supabase 托管 PostgreSQL 数据库，并提供 HTTPS 的 PostgREST API。数据库保存已下载的地震记录，避免每次都向 USGS 重复取同一年数据。Supabase 不是网站托管平台，也不负责运行这份 Cesium 前端。

### USGS 是什么

USGS FDSN Event Web Service 是本项目的地震事件来源。Supabase 是可以重建的缓存副本。第一次查询某年或手动刷新时，Vercel 向 USGS 请求；缓存命中时，Vercel 从 Supabase 读记录后返回同样格式的数据。

## 2. 技术栈逐项说明

| 技术 | 用在哪里 | 用通俗话解释 |
|---|---|---|
| HTML5 | `index.html`，GitHub Pages | 页面有哪些区域、控件和文字 |
| CSS3 | `styles.css`，GitHub Pages | 字体、颜色、排版、尺寸、响应式适配 |
| 原生 JavaScript | `app.js`，访客浏览器 | 读取用户选择、请求 API、筛选和绘制地震 |
| CesiumJS 1.145 | CDN 下载到浏览器 | 三维地球、相机、事件点、地图图层 |
| OpenStreetMap | 地图瓦片服务 | 提供海岸线、陆地、国界与地图名称；需网络允许瓦片加载 |
| Vercel Node.js Function | `api/earthquakes.js` | API 服务端逻辑；Node.js 在云端运行，不在 GitHub Pages 运行 |
| HTTPS GET | 浏览器 → Vercel | 获取某年的目录；参数写在网址查询字符串中 |
| JSON / GeoJSON | Vercel API 响应 | JSON 是数据格式；GeoJSON 是用标准结构表达地理点的数据格式 |
| Supabase PostgreSQL | Supabase 项目云端 | 关系型数据库；每行是一场地震或一个年度目录标记 |
| SQL migration | `supabase/migrations/*.sql` | 有版本记录的数据库结构改动；可复查哪次改了什么 |
| USGS FDSN | 上游 API | 以 HTTP 参数查询地震事件，返回 GeoJSON |

本项目不使用 React、Vue、Next.js 或前端打包器。根目录静态文件可直接部署，不需要 `npm run build`。`package.json` 主要用于说明项目/部署工具设置，不表示 Pages 会运行 Node 服务。

## 3. 网站运行文件分别负责什么

- `index.html`：标题、选择年份、震级按钮、三维地球容器、事件卡片、时间轴；引入 CesiumJS 与本站脚本。
- `styles.css`：网页视觉样式和小屏幕布局。覆盖在 Cesium 地球上的卡片、控制面板和底部月份滑杆也在这里。
- `app.js`：创建 `Cesium.Viewer`；请求 Vercel API；将 GeoJSON 点转成地球实体；应用震级和月份筛选；点击点时显示事件详情。
- `config.js`：公开的 API 根地址，例如 `https://earthquake-atlas.vercel.app`。这是可公开地址，不是数据库密钥。
- `api/earthquakes.js`：Vercel 服务端接口，检查参数、读写 Supabase、向 USGS 拉取数据并返回 GeoJSON。
- `vercel.json`：Vercel Function 配置，例如最长运行时间。
- `supabase/migrations/20260928000000_create_earthquake_catalog.sql`：创建原始事件表和年份标记表、索引以及 RLS 权限。
- `supabase/migrations/20260928000100_partition_catalog_by_month.sql`：给年度标记添加采集版本和是否触顶字段。
- `README.md`：项目介绍、重要链接与简要技术栈。
- `docs/TECHNICAL-GUIDE.md`：本份完整操作手册。
- `read-any-file/`：本机 Codex 辅助技能目录，不是网页运行依赖；不要因为它在电脑的 `D:\codex` 下面就公开上传。

## 4. 初次配置完整流程（从仓库到上线）

### A. GitHub 仓库

1. 打开[项目仓库](https://github.com/ChanJeunlam/earthquake-atlas)，确认仓库名和所有者无误。
2. 点击 **Code** 可以浏览网页源文件。至少应有 `index.html`、`app.js`、`styles.css`、`config.js`、`api/earthquakes.js`、`vercel.json`、`README.md`、`supabase/migrations/` 和 `docs/TECHNICAL-GUIDE.md`。
3. 在 **Settings → Pages** 检查发布来源是 `main` 分支、`/(root)` 文件夹。保存后等待 Pages 部署。
4. 仓库 **About → Website** 放访客使用的网站地址：`https://chanjeunlam.github.io/earthquake-atlas/`。API 地址单独写在 README。

### B. Supabase 项目与数据库

项目入口是[Supabase 项目总览](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi)。项目 Ref 为 `nofbidofzmoetzsdrhsi`，Supabase 项目 URL 为 `https://nofbidofzmoetzsdrhsi.supabase.co`。

数据库结构：

**`public.earthquakes` 事件表**

| 列 | 含义 |
|---|---|
| `usgs_id` | USGS 事件唯一 ID，主键，用来去重 |
| `occurred_at` | 事件发生的 UTC 时间 |
| `magnitude` | 震级（M） |
| `place` | USGS 返回的位置文字 |
| `longitude`, `latitude` | 经度、纬度（WGS 84） |
| `depth_km` | USGS 返回的深度，千米 |
| `event_url` | USGS 事件详情地址 |
| `event_type` | USGS 事件类型 |
| `updated_at` | USGS 记录最后更新时间 |

**`public.catalog_years` 年度目录标记表**

| 列 | 含义 |
|---|---|
| `year` | 年份，主键 |
| `minimum_magnitude` | 本次采集的最低震级；本项目默认 2.5 |
| `event_count` | 这个年份写入的去重事件条数 |
| `loaded_at` | 最近一次完整写入的时间 |
| `catalog_version` | 采集代码策略版本；当前逐月采集策略为 2 |
| `is_capped` | 某个月触到 USGS 单次查询上限时为 true，表示年度结果可能不全 |

**RLS** 是 PostgreSQL 的行级安全策略。两张表都启用了 RLS，访客的 `anon`/`authenticated` 角色没有读写权限；只有后端持有的 `service_role` 可以读写。这样访客只能通过经过校验的 Vercel API 获得目录，不能直接改库。

结构变化以 `supabase/migrations/` 中的 SQL 文件为准。迁移已在此 Supabase 项目执行；不要为了“让页面能读”而关闭 RLS 或给公开匿名角色开放整张表。

### C. Supabase 的 URL、anon key 和 service-role key

打开[Supabase API Settings](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi/settings/api)。

- **Project URL**：项目的 HTTPS API 根地址，本项目是 `https://nofbidofzmoetzsdrhsi.supabase.co`。它告诉后端“去哪个 Supabase 项目”。URL 本身不是密码。
- **Publishable / anon key**：用于公开浏览器访问的低权限标识；其安全性依赖 RLS 正确限制数据访问。本项目浏览器并不直接连接 Supabase，因此不需要把此 key 放入 `config.js`。
- **Secret / service_role key**：服务端高权限凭证。它能绕过 RLS，作用接近“数据库管理员服务账号”。Vercel Function 用它读写地震缓存。它不是数据库连接字符串，也不是给访客用的 key。

本项目需要在 Vercel 保存的环境变量是：

| 变量名称 | 值是什么 | 暴露风险 |
|---|---|---|
| `SUPABASE_URL` | Supabase Project URL | 可以公开，但本项目只在服务端使用 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 的服务端 Secret/service_role key | 高风险秘密，只能保存在 Vercel 服务端变量中 |

**绝对不能**把 service-role key 写进 `config.js`、`app.js`、HTML、README、截图、浏览器 localStorage、公开 issue 或 GitHub。不要把 key 前缀改成 `VITE_`、`NEXT_PUBLIC_`、`PUBLIC_` 等会嵌入网页的形式。若泄露，立即在 Supabase API Settings 轮换/撤销该 key，更新 Vercel 后重新部署。

### D. Vercel 项目连接 GitHub

Vercel 项目地址：[earthquake-atlas 项目](https://vercel.com/hugo1-3a2b/earthquake-atlas)。项目应导入 `ChanJeunlam/earthquake-atlas`，生产分支为 `main`，Root Directory 为 `./`（仓库根目录）。Framework Preset 选择 **Other** 是合理的，因为这里没有需要 Vercel 构建的 React/Next 应用；Vercel 仍会发现 `api/` 并部署 Function。

需要自己重新连接时：Vercel Dashboard → **Add New → Project → Import Git Repository** → 选择 GitHub 的 `ChanJeunlam/earthquake-atlas` → Root Directory `./` → Framework Preset `Other` → Deploy。首次导入时如 GitHub 授权页面出现，允许 Vercel 访问这个仓库。不要建立第二个同名项目；本项目现有入口是上方项目地址。

### E. 在 Vercel 写入 Supabase 环境变量

1. 打开[Vercel 环境变量页](https://vercel.com/hugo1-3a2b/earthquake-atlas/settings/environment-variables)。
2. 点 **Add Environment Variable**。
3. Name 写 `SUPABASE_URL`；Value 填 Supabase Project URL；Environment 至少勾选 **Production**；保存。
4. 再新增一项，Name 写 `SUPABASE_SERVICE_ROLE_KEY`；Value 从 Supabase 的 server-side Secret/service_role key 处复制；Environment 至少勾选 **Production**；保存。
5. 保存变量后，到 Deployments 对最新 Production 部署执行 **Redeploy**，或提交一个新版本。运行中的旧部署不会自动获得后来新增的变量。
6. 部署 Ready 后访问 API。若返回 200 且 `source` 在首次目录写入后可变成 `supabase`，说明服务端凭证和数据库访问路径可用。

不要把变量配置到 **Preview** 后就以为 Production 也有；每个 Environment 是独立配置。常规访客网站走 Production。

### F. “Enable access to System Environment Variables” 是什么

这是 Vercel 是否允许项目构建过程或 Function 读取 **Vercel 平台自己提供的系统变量** 的开关，例如部署 URL、部署环境、Git 提交信息等。它不是 Supabase 权限、不是数据库 key，也不会代替 `SUPABASE_URL` 或 `SUPABASE_SERVICE_ROLE_KEY`。本项目代码使用上面两项自定义变量，不需要依靠此开关来连接 Supabase。保持默认值即可；如果以后要在程序中读取 `VERCEL_URL`、部署环境等系统变量，再按需要启用。该选项状态改变后，必要时重新部署以便新运行实例读取设置。

**记忆方法：**自定义变量是你自己填入的 Supabase 两项；System Environment Variables 是 Vercel 自动提供的部署信息。

## 5. GitHub Pages 前端如何找到 Vercel 后端

`config.js` 中的地址类似：

```js
window.EARTHQUAKE_API_URL = 'https://earthquake-atlas.vercel.app';
```

该值是公开的 Vercel API 根地址，不包含 `/api/earthquakes`，脚本会追加接口路径。它不是密钥。

### 改完本地代码会不会立刻更新网站？

**不会。**本地保存只更改电脑文件。发布链路如下：

```text
本地修改 → 上传/提交到 GitHub main → GitHub Pages 构建静态页面
                              └→ Vercel 为 api/ 建立新生产部署
```

只有改动进入 GitHub 仓库，平台才会收到触发。Pages 和 Vercel 状态都完成后，访客才会看到对应版本。浏览器可能保留旧 JS/CSS；强制刷新（Windows 通常 Ctrl+F5）再看。每次检查都要确认线上 GitHub 文件的内容/提交时间，而不是只看本地文件。

本次任务中的代码如尚未出现于仓库最新 `main` 提交，就仍未同步到 GitHub Pages；当提交完成后 Pages 自动发布，**不是“本地改完实时同步”**。页面部署和 API 部署应各自查看状态。

## 6. API 接口规格

### 请求

```http
GET https://earthquake-atlas.vercel.app/api/earthquakes?year=2022&minmagnitude=2.5
```

参数：

| 参数 | 必填 | 规则 |
|---|---|---|
| `year` | 是 | 1900 至当前 UTC 年之间的整数 |
| `minmagnitude` | 否 | 最低震级，默认 2.5，页面按钮可选 2.5、4、5、6 |
| `refresh` | 否 | `refresh=1` 时跳过数据库读取，从 USGS 按月重新抓取并更新缓存 |

### 成功响应

成功状态是 HTTP `200`，响应为 JSON `FeatureCollection`：

```json
{
  "type": "FeatureCollection",
  "source": "supabase",
  "metadata": {
    "title": "USGS Earthquakes, 2022",
    "year": 2022,
    "minmagnitude": 2.5,
    "count": 12345,
    "capped": false
  },
  "features": [
    {
      "type": "Feature",
      "id": "usgs-event-id",
      "properties": { "mag": 4.3, "place": "12 km NNE of ...", "time": 1656576434000, "url": "https://earthquake.usgs.gov/..." },
      "geometry": { "type": "Point", "coordinates": [17.54, 43.50, 54.5] }
    }
  ]
}
```

坐标的顺序固定为 `[经度, 纬度, 深度千米]`，不是纬度在前。`source: "usgs"` 表示此次从 USGS 获取；`source: "supabase"` 表示命中 Supabase 年度缓存。`metadata.count` 是返回的特征条数。`metadata.capped=false` 表示每个按月请求都没有触到单次上限；`true` 表示至少一个月份可能仍需继续拆小或处理。

`OPTIONS` 是浏览器跨域请求的预检方法，API 会返回 CORS 允许信息。非 GET 请求返回 `405`；参数错误返回 `400`；USGS 不可用或服务内部失败时返回 `502`。前端页面与 API 是两个不同域名，所以 CORS 响应头必须存在。

## 7. 年份与月份的数据完整性

### 为什么旧数据两个年份都是 20,000？

旧版后端把一年作为一次 USGS 请求，并设置 `limit=20000`。USGS 的单次查询返回条数有限，所以旧结果按时间先后在达到该上限时停止。经数据库按月计数，旧 20,000 条实际分布为：

- **2022：**1–9 月共 20,000 条，10–12 月完全缺失。
- **2026：**1–8 月共 19,776 条，9 月只有前 224 条，总数 20,000；这是年度截断，不是 9 月完整数量。

因此两个年度碰巧到达相同上限不是巧合，而是旧查询逻辑导致的截断。

### 逐月查询能否解决？

能解决“年度总数超过 20,000 就截断”的问题：新后端把每一年拆成 12 个互不重叠的 UTC 月份请求，每月独立设置 USGS 上限，再合并、按时间排序、按 USGS ID 去重。2022 后续应包含 1–12 月；2026 应包含 1 月到 9 月 28 日（当前 UTC 日期），未来月份当然没有事件。

如果某一个月自己的记录也碰到单次上限，年度仍会被标为可能不完整，即 `is_capped=true` / `metadata.capped=true`。此时必须把该月再按日或更短时间段分块抓取；不能假装完整。是否真实完整以重建后按月核对数据库、检查标记和 USGS 响应为准。

### 旧数据如何处理

旧表是可重新下载的缓存，不是用户创作内容。旧年度截断数据和标记需要清掉，避免把旧计数误当完整目录。本次用户明确要求清空旧缓存；执行后 `earthquakes` 和 `catalog_years` 都先归零，再由新逐月 API 回填。数据库表结构本身保留，并增加 `catalog_version`、`is_capped` 字段记录新采集口径。不能仅清空 Supabase 就认为网站已重建；还必须部署新后端并实际请求每个目标年份。

### 核对查询

在 Supabase SQL Editor 运行下面的只读 SQL，可按年份和月份检查实际入库数：

```sql
select extract(year from occurred_at)::int as year,
       extract(month from occurred_at)::int as month,
       count(*)::int as events
from public.earthquakes
where extract(year from occurred_at) in (2022, 2026)
group by 1, 2
order by 1, 2;
```

查看年度标记：

```sql
select year, minimum_magnitude, event_count, catalog_version, is_capped, loaded_at
from public.catalog_years
where year in (2022, 2026)
order by year;
```

预期：2022 应有 12 个月的行；2026 只应有截至当前日期已发生的月份。2026 年 9 月是不完整月份（截至 9 月 28 日），但应包含截至查询时刻所有已发生事件。月份计数总和应等于年度标记 `event_count`。`is_capped` 必须为 `false` 才能按当前分块口径声称没有触及上限。USGS 后续可能修订历史事件，因此不同日期刷新后个别数量可变化。

**重要：**M 2.5+ 不是所有微震。如果要把数据范围改成 M 0 或 USGS 所有事件，需要同时修改采集参数、数据库存量和 API/页面口径，并重新评估数据量；不能只把页面最低震级按钮调低，因为低于 2.5 的记录根本没有下载。

## 8. 震级筛选、月份滑块、符号图例分别如何工作

- **震级按钮**：2.5+、4+、5+、6+。点击后重新筛选浏览器当前年份已加载的 GeoJSON 点，不调用后端。后端仍保留 M2.5 以上目录供各档筛选。
- **月份滑块**：值 0 表示全年；1–12 表示相应月份。拖动滑杆、点击刻度附近或键盘左右键改变月份；点数、时间区间和地球点位一起更新。它只筛选本地内存中的目录，不应再发一遍 API 请求。
- **点大小**：表示震级，示例点给出 M2.5、M4、M7+；越大代表震级越高。它表示相对大小，不表示震源实际物理直径。
- **点颜色**：表示震源深度分档：浅层 0–70 km、中层 70–300 km、深层 300 km 以上。颜色只能给出类别，不应读成精确深度；点选事件卡片会显示该条记录的实际深度。
- **事件详情**：点击地震圆点，可查看震级、位置、UTC 时间、深度、经纬度和 USGS 事件页。

底部时间轴不是动画播放条：它是月份筛选器。屏幕窄时可横向布局换行，不是必须滚动的时间序列。

## 9. 为什么曾经只看到一个深色球？地图层如何显示海陆、边界、国家名

CesiumJS 负责三维地球框架，本身不会自动带一张有国界和地名的地图。海陆底图来自地图瓦片服务，当前用 OpenStreetMap；如果瓦片请求没加载，屏幕会留下 Cesium 的纯色球，只有叠加的地震点仍可见。

Cesium 当前版本使用 `Viewer` 的 `baseLayer` 参数添加底图。只设置旧的 `imageryProvider` 参数可能在新版 Cesium 中不按预期添加图层，因此应在浏览器 Console/Network 检查瓦片。如果海陆仍不可见：

1. 强制刷新页面（Ctrl+F5），排除旧脚本缓存。
2. 浏览器开发者工具 → Network，搜索 `tile.openstreetmap.org`；请求应返回图片（HTTP 200）。
3. 若被代理、防火墙、内容拦截扩展或地区网络拦截，瓦片请求可能失败。重试其他网络。
4. 确认 Cesium 地球不是被 CSS 遮挡，且 `viewer.imageryLayers.length` 大于 0。
5. 确认底部/页面有 OpenStreetMap attribution。遵守瓦片使用政策，不要高频刷新或批量下载瓦片。

OpenStreetMap 全球缩放层级的国家名称数量有限；放大地球后会出现更多城市地名。国界和国家名由底图提供，不是地震事件数据的一部分。如果业务需要始终显示各国全名，应增加单独的国界矢量/国家标签数据层并处理跨日期线、多边形中心点、缩放避让；这需要独立的数据文件和交互设计。

## 10. 图例方案调研与设计理由

USGS 地震图使用圆形大小表达震级，并用离散颜色表达深度。USGS 示例常把深度分为 0–69 km、70–299 km、300 km 及更深几档，浅层红色/橙色、中层绿色、深层蓝色；震级则用不同大小的圆点分档。参见 [USGS 最新地震地图说明](https://earthquake.usgs.gov/earthquakes/map/?about=true&help=missing) 与 [USGS 地震图示例及图例](https://earthquake.usgs.gov/product/poster/20160824/us/1472133404498/poster.pdf)。

据此，本项目图例采用离散三档而不是没有数值标注的连续彩虹渐变：

1. 先用一句话说明通道含义（“震级·圆越大”“深度·看颜色”）。
2. 以小/中/大三个圆展示 M2.5、M4、M7+，并把标签放在圆旁，不挤在同一行末端。
3. 以橙红、绿、蓝三个明确色点分别标注 0–70、70–300、300+ km。
4. 精确深度仍放事件卡片中，避免让连续颜色看起来像精密刻度。
5. 页面主要说明字号不应小于约 13–14 CSS px，卡片时间地点保持清晰换行。

## 11. 调试：按“网页 → API → 数据库 → 上游”顺序查

### 第一步：检查网页

打开[线上网站](https://chanjeunlam.github.io/earthquake-atlas/)，等待目录状态加载。若按钮和布局仍像旧版，先确认 GitHub `main` 是否包含新文件、Pages 是否完成最新发布，再按 Ctrl+F5。网页“看起来没地图”时检查底图瓦片，不要先把它误诊成 Supabase 故障。

### 第二步：直接打开 API

浏览器打开[2022 API](https://earthquake-atlas.vercel.app/api/earthquakes?year=2022&minmagnitude=2.5)。

- HTTP 200 且 JSON `features` 非空：浏览器到 Vercel 的路径已工作。
- `source: "usgs"`：本次从 USGS 拉取；若 Supabase 密钥不存在或缓存未创建，通常会如此。
- `source: "supabase"`：读取到了数据库缓存。
- `features: []`：检查年份、月份、震级参数和上游返回，不要只凭 UI 断定。
- HTTP 400：年份或震级参数无效。
- HTTP 502：看 Vercel Function Logs，分辨 USGS 错误、Supabase 错误或运行时异常。
- HTTP 404：可能 Vercel 未把 `api/earthquakes.js` 部署为 Function，检查项目 Root Directory、Production 部署分支和部署状态。

### 第三步：查看 Vercel 日志

打开[Vercel 项目](https://vercel.com/hugo1-3a2b/earthquake-atlas) → **Logs**（或 Deployment → Functions/Logs），筛选 `/api/earthquakes`。查看请求时间、状态码与错误消息。不要在日志里输出完整 service-role key；错误日志应只显示状态和上下文，不应回显密钥。

本项目早期部署曾排查出两项具体运行时问题：Vercel Node 请求的 `request.url` 可能是相对路径，不能直接 `new URL(request.url)`；以及 Node 风格 `request.headers` 是普通对象，不能假定存在 `.get()`。当前代码用 Host 构造 URL 基址，并通过 Node response 对象写响应。这些历史错误说明部署页显示 Ready 不等于 API 每个路径都已验证；仍须实际打开 API。

### 第四步：确认 Vercel 环境变量

到[环境变量页](https://vercel.com/hugo1-3a2b/earthquake-atlas/settings/environment-variables)确认 Production 中存在 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。Vercel 不会把秘密值再次显示出来是正常安全行为；只能核对名称、环境和最后更新时间。变量刚新增/修改后，要重新部署。

### 第五步：检查 Supabase 表

打开[地震表](https://supabase.com/dashboard/project/nofbidofzmoetzsdrhsi/editor/17608?schema=public)，看事件行；再运行第 7 节 SQL 统计年月。年份标记的 `catalog_version` 应为 2。若 API 返回 `source=usgs`，但表没有新行，查 Vercel 日志中的 `Supabase catalog cache write failed`、环境变量和 RLS/权限。不要为排错公开 service-role key。

### 常见判断

| 现象 | 最常见检查方向 |
|---|---|
| 页面没有点，API 也失败 | Vercel 部署 / API 运行时错误 |
| API 返回 `source=usgs` 且数据有点，数据库没有行 | Supabase 环境变量、写入日志、权限或超时 |
| API `source=supabase` 但旧年月份缺失 | 年份标记版本、数据库逐月统计、是否强制刷新 |
| 球上只有点，没有陆地 | Cesium imagery baseLayer 和地图瓦片网络请求 |
| 本地界面已变、线上还是旧界面 | 文件尚未推到 GitHub、Pages 未部署完或浏览器缓存 |
| 目录数与 USGS 网站瞬时总数不同 | UTC 查询时间、震级门槛、目录修订时间和采集完成时间 |
| 同一数据重复行 | 应由 `usgs_id` 主键去重；检查实际查询是否按该字段 upsert |

## 12. 日常发布与刷新

**改网页：**修改 `index.html`、`styles.css`、`app.js` 或 `config.js` → 推送到 GitHub `main` → 等 GitHub Pages 发布成功 → Ctrl+F5 验证。

**改 API：**修改 `api/earthquakes.js` 或 `vercel.json` → 推送到 `main` → 等[Vercel Deployments](https://vercel.com/hugo1-3a2b/earthquake-atlas/deployments) 显示 Ready → 先直接打开 API，再查网页。

**改数据库结构：**新增一个有时间戳的 SQL migration，先 review SQL，再对 Supabase 项目应用 migration；迁移文件也提交到 GitHub，以便仓库有结构变更记录。仅改本地 migration 文件不会自动改远端数据库。

**刷新某年目录：**访问该年 API 并增加 `&refresh=1`，例如：

```text
https://earthquake-atlas.vercel.app/api/earthquakes?year=2022&minmagnitude=2.5&refresh=1
```

重新采集后，核对 `catalog_years` 标记和年月统计。USGS 可能对历史记录做修订，刷新会更新已有 USGS ID，也可能加入新事件。

## 13. 费用与服务边界

GitHub Pages、Vercel、Supabase 均由各自账号和方案管理；免费额度、限速、保留策略和价格会调整，应以对应控制台当前显示为准。CesiumJS 和 OpenStreetMap 瓦片依赖浏览器网络；瓦片服务有使用政策。USGS 可用性也受其服务状态影响。任何一个第三方不可用时，其它部分不一定同时故障，例如地图瓦片失败不会自动证明地震 API 失败。

## 14. 本项目当前状态与核验结果（2026-09-28）

旧版年度查询把两个年份都截断在 20,000 条。已按用户要求删除旧的可再下载缓存与旧年度标记，保留表结构并增加新采集版本字段。新版本部署后已重建 2022 与 2026：

| 年份 | 已采集月份 | 数据库条数 | 采集版本 | 触及月度上限 |
|---|---|---:|---:|---|
| 2022 | 1–12 月（完整自然年） | 26,911 | 2 | 否 |
| 2026 | 1–9 月（截至 9 月 28 日 UTC；未来月份尚未发生） | 21,553 | 2 | 否 |

2022 月度计数依次为 2,539、2,116、2,436、2,173、2,037、2,081、2,279、2,340、2,408、2,147、2,232、2,123。2026 月度计数依次为 2,378、2,131、2,509、2,622、2,231、2,503、2,692、2,710、1,777。两年各月之和分别等于年度标记中的 26,911 和 21,553；标记都为 `catalog_version=2`、`is_capped=false`。这说明年月上完整覆盖 M2.5+ USGS 目录，且没有月份达到单次上限。USGS 可能修订历史事件，日后刷新数量可能略有变化。

地图国界与国家中文名现由仓库内 `data/countries.geojson` 的 Natural Earth 国家边界矢量层提供，不再完全依赖第三方瓦片必须成功。底图瓦片仍由 OpenStreetMap 提供；国家名按地图缩放等级控制密度。项目当前线上代码是否含最新版手机适配，应核对 GitHub `main` 和 GitHub Pages 发布状态。

**注意口径：**这表示完整的 M2.5 及以上 USGS 目录，不包含低于 M2.5 的微震，也不是任何机构都能观测到的物理意义上的“所有地震”。

重新构建完成后，按以下顺序验收：

1. Vercel 最新 `main` 部署为 Ready。
2. 直接请求 2022 API 和 2026 API 均 HTTP 200、`features` 非空、`source` 有明确值。
3. Supabase 年份标记显示 `catalog_version=2`、`is_capped=false`。
4. 月份统计有 2022 年 1–12 月；2026 年从 1 月到当前已发生月份，不要求未来月份有数据。
5. 每年月份数总和与该年 `event_count` 一致。
6. GitHub Pages 最新版本显示新图例、新事件详情字号、无多余外链箭头、震级按钮有效、月份滑块能切换数据；手机上还应检查目录加载与微信内置浏览器失败降级。
7. Cesium 的 imagery layer 数量大于 0 且 OSM 瓦片请求成功时，底图海陆边缘可见；即使 OSM 瓦片失败，Natural Earth 矢量国家边界和国家名仍可单独显示。国家标签密度会随地图缩放变化。

