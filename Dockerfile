# 安塘智宣 · Docker 镜像（多阶段构建）
# 构建上下文 = 项目根目录（含 web/ skills/ knowledge/ scripts/）
# 用法见 web/DEPLOY.md

# ---------- 阶段 1：Node 构建 ----------
FROM node:20-slim AS builder
WORKDIR /build
# 只复制 package 文件，利用缓存
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# 构建（生产环境变量由运行时注入，构建期不需要 API Key）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- 阶段 2：运行时（Node + Python + 中文字体） ----------
FROM node:20-slim
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Python（海报文字渲染）+ 中文字体（Linux Noto Sans CJK，render_poster.py 自动探测）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
# Pillow（render_poster.py 依赖）+ 建立 python 命令（代码里调 "python"，Debian 只有 python3）
RUN pip3 install --no-cache-dir Pillow && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app
# Next 构建产物 + 静态资源
COPY --from=builder /build/.next ./.next
COPY --from=builder /build/public ./public
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/node_modules ./node_modules

# 项目根目录内容（skills/ knowledge/ scripts/），供后端拼 prompt 与调 python
# PROJECT_ROOT 环境变量指向这里（web/lib/server/ark.ts 读取）
ENV PROJECT_ROOT=/data/project
COPY skills /data/project/skills
COPY knowledge /data/project/knowledge
COPY scripts /data/project/scripts
# Python 模块路径（render_poster.py 等）
ENV PYTHONPATH=/data/project/scripts

EXPOSE 3000
# 生产模式启动（海报成品写入 public/generated/，建议挂载持久卷）
CMD ["npm", "start"]
