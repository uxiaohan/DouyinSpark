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
# WORKDIR 必须在任何 COPY 之前显式指定：oven/bun 基础镜像自带 WORKDIR /home/bun/app，
# 不写的话下面所有 COPY ... ./ 都落进 /home/bun/app，而 CMD 又在 /app 里找入口，
# 构建全程不报错，只在运行时炸 error: Module not found "web-server.ts"，然后 restart 循环刷屏
WORKDIR /app
# DOUYIN_CONTAINER=1：浏览器加 --no-sandbox 并跳过系统 chrome channel（镜像里没装 Chrome，走内置 chromium）
# TZ：调度窗口按容器本地时间算，必须显式设为北京时间，否则每天按 UTC 漂移 8 小时
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    DOUYIN_CONTAINER=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tini tzdata \
    && rm -rf /var/lib/apt/lists/*
# 归属在 COPY 时直接落 bun:bun：若留到后面对 /app 做 chown -R，overlayfs 会把整个 node_modules
# 复制上进层，镜像平白多出一份完整依赖的体积。运行时要写的只有 data（sqlite）和 logs（calibrate 截图）
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
# chromium 只取决于 node_modules 里 playwright 的版本，排在源码拷贝之前：
# 以后改 src/ 顶掉的是最后的代码层，这一层命中缓存，不用重新下载 150MB+
RUN bunx playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder --chown=bun:bun /app/web/dist ./web/dist
COPY --chown=bun:bun package.json index.ts web-server.ts ./
COPY --chown=bun:bun src ./src
RUN mkdir -p /app/data /app/logs && chown bun:bun /app/data /app/logs
# 兜底：入口/依赖/前端产物没落在 /app 就直接让构建失败。
# WORKDIR 写漏、COPY 目标写错都属于"构建静默通过、运行时 Module not found"一类，在这里炸掉比在用户机器上循环重启好
RUN test -f /app/web-server.ts && test -d /app/node_modules && test -d /app/src && test -d /app/web/dist
USER bun
EXPOSE 8787
# /api/bootstrap 无需登录，探活只关心进程在、HTTP 通路在
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8787/api/bootstrap || exit 1
# tini 当 PID 1：把 SIGTERM 转发给 bun（收到后会在当前好友边界收尾再退出），并回收僵尸进程
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "web-server.ts"]
