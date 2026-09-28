# 震域 · 全球地震目录

CesiumJS 三维地球上的全球地震目录。数据来自 USGS FDSN Event Web Service，Vercel Functions 提供 API，Supabase PostgreSQL 缓存目录。

- 在线网站：https://chanjeunlam.github.io/earthquake-atlas/
- 后端 API：https://earthquake-atlas.vercel.app/api/earthquakes?year=2026&minmagnitude=2.5
- 技术架构、首次配置、部署和故障排查：[docs/TECHNICAL-GUIDE.md](docs/TECHNICAL-GUIDE.md)

## 技术栈

- 前端：原生 HTML、CSS、JavaScript、CesiumJS；由 GitHub Pages 发布
- 后端：Vercel Node.js Function，提供 HTTPS GET GeoJSON API
- 数据库：Supabase 托管 PostgreSQL，RLS 开启，由 Vercel 服务端密钥读写
- 数据来源：USGS FDSN Event Web Service

## 重要安全说明

SUPABASE_SERVICE_ROLE_KEY 只应放在 Vercel 的服务端 Environment Variables 中。不要提交密钥、.env 文件或把该值写进浏览器端 config.js。config.js 只存公开的 Vercel API 地址。
