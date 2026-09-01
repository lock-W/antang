# 部署指南（稳定上线）

> 目标：让项目成为稳定、可长期访问的网站。
> 项目特点决定：**必须能跑 Python 子进程（海报渲染）+ 能写文件（海报成品）**，
> 所以不能直接用 Vercel serverless，推荐 Docker 部署。

## 三种落地方式（按推荐排序）

### 方式 A：云服务器 + Docker（推荐，正式稳定）⭐

1. **买服务器**：阿里云/腾讯云轻量应用服务器（2核2G 起，约 40-80 元/月），系统选 **Ubuntu 22.04 / Debian 12**
2. **装 Docker**（服务器上执行一次）：
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. **上传代码**：把整个项目文件夹（含 Dockerfile、docker-compose.yml、web/、skills/ 等）传到服务器（可用 git clone 或 scp）
4. **配置**：确保服务器上有 `web/.env`（含 ARK_API_KEY、ARK_MODEL、ARK_IMAGE_MODEL）
5. **启动**：
   ```bash
   cd 项目根目录
   docker compose up -d --build
   ```
6. **放行端口**：云控制台安全组放行 **3000** 端口
7. **访问**：`http://服务器公网IP:3000`（手机也能访问）
   - 正式一点：配 Nginx 反代 + 域名（需 ICP 备案；演示期可先用 IP:端口）

**日常维护**：
- 更新代码：`git pull` 后 `docker compose up -d --build`
- 看日志：`docker logs -f antang-zhixuan`
- 自动重启：`restart: unless-stopped` 已配置（服务器重启自动拉起）

### 方式 B：本机 + Cloudflare 固定隧道（零成本，临时/演示）

- 优点：不用买服务器，本机跑 `npm start` 即可
- 缺点：本机不能关机；免费 quick tunnel 的 URL 每次重启会变
- 固定 URL 需要：Cloudflare 账号 + 自有域名 → Named Tunnel（配置一次后 URL 永久）
- 适合：比赛现场演示、开发期给客户看效果

### 方式 C：PaaS 平台（Zeabur / Railway，免运维但有限制）

- Zeabur/Railway 支持 Docker 部署（能跑 Python + 持久卷），免费额度有限
- 流程：push 到 GitHub → 平台导入仓库 → 自动构建
- 注意：平台需支持 **SSE 长连接**（本项目流式输出必需）与 **持久卷**（海报文件）

## Nginx 反代（有域名时，可选）

```nginx
server {
    listen 80;
    server_name 你的域名;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # SSE 流式必需：关缓冲 + 长超时
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

## 环境变量清单（web/.env）

| 变量 | 必需 | 说明 |
|---|---|---|
| `ARK_API_KEY` | ✅ | 火山方舟密钥 |
| `ARK_MODEL` | ✅ | 文本模型（当前 doubao-seed-evolving） |
| `ARK_IMAGE_MODEL` | ✅ | 图像模型（doubao-seedream-5-0-pro-260628） |
| `HOTLIST_API_BASE` | 可选 | 热榜 API（不填用演示热榜） |
| `PROJECT_ROOT` | 容器内自动 | 指向 /data/project（skills/knowledge/scripts） |
| `PYTHON` | 可选 | 容器内默认 python3 可用 |

## 常见问题

- **海报渲染失败**：检查容器里 `python3 -c "from PIL import Image"` 是否正常（Dockerfile 已装 Pillow）；中文字体已装 fonts-noto-cjk
- **SSE 断开**：确认 Nginx `proxy_buffering off`；心跳保活已内置（每 15s ping）
- **端口冲突**：改 docker-compose 里 `"3000:3000"` 左边端口
- **密钥安全**：`.env` 不提交 git、不进镜像（docker-compose env_file 直接读取）
