# AI 灵感日报

本地运行的 AI 资讯聚合与灵感管理工具。自动从优质 RSS 源抓取 AI 领域最新资讯，支持一键收藏打标签，生成报纸风格日报。

## 快速开始

```bash
npm install
npm start
```

浏览器自动打开 `http://localhost:3000`

## 功能

- **今日资讯**：聚合 12 个中英文 AI RSS 源，按时间排列，支持日期切换和来源筛选
- **灵感库**：收藏文章并打标签（选题/工具/案例/想法），支持关键词搜索和备注
- **今日日报**：报纸风格排版，合并今日资讯 + 今日收藏，支持截图分享和打印导出

## 管理 RSS 源

编辑 `data/feeds.json`，增删或修改 RSS 源，无需改代码：

```json
{ "id": "唯一ID", "name": "显示名称", "url": "RSS地址", "lang": "zh或en" }
```

## 数据文件

- `data/feeds.json` — RSS 源配置
- `data/articles.json` — 文章缓存（自动维护，保留 7 天）
- `data/bookmarks.json` — 灵感库收藏
