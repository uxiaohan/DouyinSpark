# syntax=docker/dockerfile:1
# 多阶段构建：deps 装依赖（浏览器二进制不进依赖层）→ builder 构建前端 → runtime 只带生产所需 + chromium
FROM oven/bun:1.4-slim AS deps
WORKDIR /app
# 浏览器由 runtime 阶段统一装进 /ms-playwright，依赖层不下载
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY web/package.json web/bun.lock ./web/
RUN cd web && bun install --frozen-lockfile

FROM deps AS builder
# vue-tsc 靠猴子补丁 fs.readFileSync 改写 tsc 源码来注入 Vue 语言插件，只有 Node 运行时生效；
# bun 在 Linux 下生成的 .bin 启动器用 bun 运行时跑脚本，补丁会静默失效，
# 表现为所有 .vue 导入报 TS2307（Windows 的 .bin/vue-tsc.exe 走 Node，所以本地发现不了）
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN bun run build:web

FROM oven/bun:1.4-slim AS runtime
# DOUYIN_CONTAINER=1：浏览器加 --no-sandbox 并跳过系统 chrome channel（镜像里没装 Chrome，走内置 chromium）
# TZ：调度窗口按容器本地时间算，必须显式设为北京时间，否则每天按 UTC 漂移 8 小时
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    DOUYIN_CONTAINER=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tini tzdata \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/web/dist ./web/dist
COPY package.json index.ts web-server.ts ./
COPY src ./src
# chromium：--with-deps 一并装齐运行所需的系统库；装完放开读权限给运行用户
RUN bunx playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright
# 数据目录（sqlite + wal/shm）预建并交给运行用户，挂卷后权限一致
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
WORKDIR /app
EXPOSE 8787
# /api/bootstrap 无需登录，探活只关心进程在、HTTP 通路在
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8787/api/bootstrap || exit 1
# tini 当 PID 1：把 SIGTERM 转发给 bun（收到后会在当前好友边界收尾再退出），并回收僵尸进程
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "web-server.ts"]
