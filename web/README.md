# 安塘智宣 · 网页端（Next.js）

帮广东云浮安塘街道农户做宣传的 AI 网站。4 个功能（聊天式界面）：

| 功能 | 路由 | 说明 |
|---|---|---|
| 乡土编剧 | `/chat/rural-scriptwriter` | 六大农产品短视频脚本（粤语/普通话双版本） |
| 热点雷达 | `/chat/hotspot-radar` | 时令日历 + 全网热榜 → 3 张选题推荐卡片，含「刷新今日热榜」 |
| 物料工坊 | `/chat/promo-materials` | 朋友圈/社群/视频号文案、海报（AI 背景图 + 程序渲染文字）、违禁词检测 |
| 直播话术教练 | `/chat/live-coach` | 直播流程、话术逻辑图、救场话术、陪练模式 |

## 架构

```
前端（本目录）── HTTP ──▶ /api/chat ──▶ 火山方舟（豆包 / Seedream）
                        │
                        └─ 读 skills/<功能>/SKILL.md + knowledge/ 拼 system prompt
```

- API Key 只存在服务端 `.env`，前端绝不出现（铁律 1）
- 海报：AI 只生成背景图，文字由 `scripts/render_poster.py` 程序渲染（铁律 2），竖版 3:4
- 未配置 `ARK_API_KEY` 时自动进入**演示模式**（内置 `lib/mock.ts` 真实测试样例），界面与真实运行一致

## 开发

```bash
npm install
cp .env.example .env   # 填入 ARK_API_KEY / ARK_MODEL（向交接人私聊获取）
npm run dev            # http://localhost:3000
```

构建部署：

```bash
npm run build && npm start
```

## 部署

### 环境要求

- **Node.js 18+**（用到全局 `fetch` / `ReadableStream`）
- **Python 3 + Pillow**：海报文字渲染管线依赖（见根目录 `requirements.txt`，`pip install -r requirements.txt`）
- **中文字体**：海报渲染需要中文字体。Windows/macOS 自带；Linux 服务器需安装 Noto Sans CJK（如 `apt install fonts-noto-cjk`），或设 `POSTER_FONT` 环境变量指向一个 .ttf/.ttc 字体文件
- 可选：**DailyHotApi**（热榜抓取，见 `scripts/fetch_hotlist.py` 注释）

### 环境变量

复制 `.env.example` 为 `.env` 填写（`.env` 绝不提交 git）：

| 变量 | 必填 | 说明 |
|---|---|---|
| `ARK_API_KEY` | 否* | 火山方舟 API Key；不填则整站运行在演示模式（mock 数据） |
| `ARK_MODEL` | 否* | 文本模型接入点 ID（真实模式必填） |
| `ARK_IMAGE_MODEL` | 否 | Seedream 图像模型接入点（物料工坊海报用，已实测开通可用） |
| `HOTLIST_API_BASE` | 否 | DailyHotApi 地址；不填则热点雷达用演示热榜 |
| `PROJECT_ROOT` | 否 | 项目根目录；默认取 web/ 的上一级 |
| `PYTHON` | 否 | Python 可执行文件名/路径，默认 `python` |

### 目录结构要求

`web/` 必须与 `skills/`、`knowledge/`、`scripts/` 同级（API 路由按 `../skills/...` 读取技能与知识库文件）：

```
项目根/
├── web/        # 本目录（Next.js）
├── skills/     # 4 个 SKILL.md
├── knowledge/  # 知识库 markdown
├── scripts/    # render_poster.py / fetch_hotlist.py
└── outputs/    # 热榜缓存
```

不在此结构部署时，设 `PROJECT_ROOT` 指向真正的项目根。

### 进程工作目录

`npm start` / `npm run dev` 必须在 `web/` 目录下启动（Next.js 约定，`process.cwd()` 为 web/）。海报生成的图片写入 `web/public/generated/`（已 gitignore），进程需对该目录有写权限。

## 关键文件

- `lib/skills.ts` — 4 个功能的统一配置（SKILL.md 路径、知识库清单、UI 文案）
- `lib/server/ark.ts` — 服务端拼 prompt + 调方舟 + 海报管线（逻辑照抄 `scripts/test_skill.py`）
- `lib/poster.ts` — 海报数据包解析（兼容两种输出格式）
- `lib/hotspot.ts` / `lib/blocks.ts` — 热点卡片解析、消息分块
- `app/api/chat/route.ts` — 聊天接口；`app/api/hotlist/route.ts` — 热榜刷新接口

## 合规红线（勿删）

- 页脚固定提示「AI 生成内容请人工核对后发布」
- 海报【待补充】字段高亮提示人工补填，不静默留空
- 时令/价格等事实以产品卡与街道办口径为准，【待核实】内容不进对外物料
