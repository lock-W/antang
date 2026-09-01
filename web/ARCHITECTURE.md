# 安塘智宣 · Web 架构说明

> 面向：新加入的开发者 / 求职面试讲解 / 代码评审
> 配套：README.md（运行部署）、docs/决策记录.md（为什么这么做）

## 1. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 16（App Router）+ React 19 | 前后端一体，单服务部署 |
| 语言 | TypeScript（strict） | 全栈同语言 |
| 样式 | Tailwind CSS v4 | 响应式（投屏 + 手机） |
| 渲染 | react-markdown + remark-gfm | 模型输出是 markdown，统一渲染 |
| AI | 火山方舟（豆包 doubao-seed-evolving + Seedream 5.0 Pro） | OpenAI 兼容端点 |
| 海报渲染 | Python + Pillow（scripts/render_poster.py） | child_process 调用，程序渲染文字 |
| 数据 | 无数据库（演示期）；知识库为 Markdown 文件 | 会话在内存，刷新即清空 |

## 2. 目录结构

```
web/
├── app/                        # 路由层（Next.js App Router）
│   ├── layout.tsx              # 品牌栏 + 全局合规提示
│   ├── page.tsx                # 首页：4 功能入口
│   ├── chat/[feature]/page.tsx # 功能聊天页（动态路由，4 个功能共用）
│   └── api/
│       ├── chat/route.ts       # POST /api/chat —— SSE 流式聊天（核心）
│       ├── hotlist/route.ts    # POST /api/hotlist —— 抓热榜（演示数据兜底）
│       └── generated/[name]/route.ts # GET 海报成品（白名单防路径穿越）
├── components/                 # UI 层（无业务逻辑）
│   ├── ChatWindow.tsx          # 聊天主组件：SSE 消费/加载态/热榜按钮/引导菜单
│   ├── MessageBubble.tsx       # 消息气泡：分块渲染（正文/卡片/海报）
│   ├── HotspotCardView.tsx     # 热点卡片组件
│   ├── PosterCard.tsx          # 海报气泡：字段展示 + 【待补充】高亮 + 下载
│   ├── Markdown.tsx            # markdown 渲染封装
│   └── ComplianceNotice.tsx    # 合规提示条（红线，固定展示）
├── lib/                        # 业务/领域层
│   ├── skills.ts               # 4 功能统一配置（SKILL 路径、知识库清单、UI 文案）
│   ├── server/ark.ts           # 【服务端】拼 prompt/调方舟/海报管线/敏感内容过滤
│   ├── poster.ts               # 海报数据包解析（兼容 3 种格式、多海报）
│   ├── hotspot.ts              # 热点卡片解析（容错版，4 种格式）
│   ├── blocks.ts               # 消息分块（海报/卡片从正文剥离）
│   └── mock.ts                 # 无 Key 演示数据（真实测试样例）
├── public/                     # 静态资源（mock 海报）
├── .env.example                # 环境变量模板（.env 不入库）
└── ARCHITECTURE.md             # 本文档
```

**分层原则**：`app/` 只管 HTTP 编排 → `lib/server/` 管外部依赖（AI API、文件系统）→ `lib/` 纯函数（解析器，可单测）→ `components/` 纯展示。解析器与 UI 解耦，是前端能单测的核心资产。

## 3. 核心请求链路

### 3.1 聊天（SSE 流式）

```
浏览器 ──POST /api/chat {feature, messages}──▶ Route Handler
      │
      ├─ 1. sanitizeMessages()     清洗：role 白名单 / 限 50 条 / 截断 4000 字
      ├─ 2. sanitizeHotlistText()  程序层过滤热榜敏感条目（防模型安全拒答）
      ├─ 3. buildSystemPrompt()    SKILL.md + 当前真实日期 + 运行纪律/输出格式纪律 + 知识库文件
      ├─ 4. callChat(stream)       调方舟 chat/completions（SSE），逐 chunk 回调
      │      └─ 心跳：每 15s 发 SSE 注释行，防 Cloudflare 隧道 100s 掐断
      ├─ 5. 检测【海报数据包】→ generatePoster() 管线（见 3.2）
      └─ 6. 事件流：delta(逐字) → rendering(海报渲染中) → done(posters) → [DONE]
```

### 3.2 海报管线（多模态）

```
回复含【海报数据包】→ extractPosterBlocks（可多个 1/2、2/2）
  → 每块 parsePosterFields（3 种格式兼容）
  → Seedream 生成背景图 1728×2304（提示词强制追加 "No text..." 防 AI 画假价格）
  → execFile python render_poster.py 渲染文字（T01/T02/T03 模板，程序保证文字 100% 准确）
  → 成品图存 public/generated/，经 /api/generated/[name] 动态路由返回（生产 404 修复）
```

### 3.3 热点雷达（双轨）

```
轨道A：年度内容日历.md（确定性时令，永远可用）
轨道B：/api/hotlist 抓取 5 平台热榜 → 三道工序（过滤→三档匹配→排序）
输出 3 张卡片（### 卡片 N ｜ 类型 + 7 字段）→ 前端容错解析 → 卡片组件
```

## 4. 关键设计决策（面试可讲）

| 问题 | 方案 | 为什么 |
|---|---|---|
| API Key 泄露 | 只存服务端 .env，浏览器只打 /api/chat | 铁律 1 |
| AI 写错海报汉字 | AI 只生成无字背景图，程序渲染文字 | 价格/电话错一个字是事故 |
| 模型首 token 要 1-2 分钟 | SSE 流式 + 心跳保活 | 用户逐字看到生成过程 |
| 模型输出格式漂移 | 容错解析器（4 种格式兼容）+ 输出格式纪律 | LLM 不确定性是常态 |
| 敏感热榜触发模型拒答 | 程序层关键词过滤 + 运行纪律指令 | 双层保险 |
| 模型瞎猜日期 | 注入服务器真实日期 | 时令推荐必须基于"今天" |
| 知识库太大拖慢首 token | 按功能精简（物料工坊 -40%） | 实测首 token 116s→7.9s |
| 生产模式 public 404 | /api/generated/[name] 动态路由 | build 后新增文件不可用 |

## 5. 改进方向（Roadmap）

- [ ] 会话持久化：SQLite 存历史/统计（当前刷新即清）
- [ ] 单元测试：Vitest 覆盖解析器（poster/hotspot/blocks 纯函数）
- [ ] RAG 升级：embedding 检索知识库，替代全量注入（减 prompt、提相关度）
- [ ] CI/CD：GitHub Actions 自动 build + 部署
- [ ] Docker 部署 + docker-compose（Node + Python + 字体）
- [ ] 限流防刷（保护 API 额度）、pino 日志、错误监控
- [ ] 图片生成异步化（队列 + 轮询，避免长连接）
