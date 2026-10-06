# DouyinSpark 续火花

本地自动化抖音续火花：每天在随机时间窗口内，用每个账号自己的 cookie 登录抖音网页版，给该账号的火花好友发随机文案。引擎 Bun + Playwright，控制台 Hono + Vue3，数据存本地 SQLite（`bun:sqlite`，无外部数据库）。运行时依赖只有 `playwright`、`hono`、`@hono/bun`（dev：`@types/bun`），前端另用 `vue` + `vue-router`。

## 环境要求

| 项 | 要求 |
|---|---|
| Bun | 1.4.2，按此版本开发和测试 |
| Chrome | **本机必须安装**。运行时 `channel: "chrome"` 起真实 Chrome，不用 Playwright 自带 chromium |
| Node | ≥18，仅前端类型检查需要：`vue-tsc` 靠补丁 `fs.readFileSync` 给 tsc 注入 Vue 插件，只在 Node 下生效；Bun 下补丁失效，所有 `.vue` 导入会报 TS2307（后端和 `vite build` 仍由 Bun 驱动） |

Docker 部署则本机不需要 Bun / Node / Chrome。

```bash
bun install
```

## 快速开始

```bash
bun run web   # 控制台默认 0.0.0.0:8787，同时进入每日调度循环
```

浏览器开 `http://127.0.0.1:8787`。全新库首启自动写示例数据，没有单独初始化步骤（`bun run seed` 可手动补写，幂等）。

**首进控制台**：库里有管理口令要求时先走初始化引导——设一个 ≥6 位口令（二次确认），只以 bcrypt 哈希存在本机库，**忘记无法找回，只能删 `data/app.db` 重新初始化**。之后每次登录都用它；会话 cookie 24 小时有效、HttpOnly；同 IP 一分钟输错 5 次触发限流。

### 获取 cookie（Cookie-Editor 浏览器插件）

1. 装好 Cookie-Editor 浏览器插件。
2. 登录抖音网页版 `https://www.douyin.com/`。
3. 在 douyin.com 域名下点插件 Export → JSON，复制导出的 cookie 数组。
4. 控制台「账号」页 → 填别名 → 粘贴 → 保存。

注意：

- cookie **只写入、不回显**，之后在界面上看到的是掩码。
- 域名必须含 `douyin`，否则该条 cookie 会被跳过。
- 保存在本地 `data/app.db`，**不会**进 git（`data/` 已在 `.gitignore`）。
- cookie 失效后运行不会崩：该账号的全部好友会被标记 `skipped (cookie 失效)`，其他账号照常跑。

**好友 / 文案**：好友按账号添加，名字必须与抖音会话列表显示的备注/昵称**精确匹配**（空白折叠：NBSP、全角空格、普通空格都识别，写入时折叠成普通空格；空格有无算不同名字，"张 三" ≠ "张三"），同账号不可重复（重名 409）。文案页维护随机文案池，可按账号分开。

**试跑**：`bun run now` 会真开浏览器、真登录、真发送。实测单好友单条约 27 秒。

## 命令

| 命令 | 作用 |
|---|---|
| `bun run web` | 启动控制台，**同时**进入每日调度循环 |
| `bun run web-server.ts --web-only` | 只跑控制台，不进调度（调试用） |
| `bun run start` | 只跑调度循环，不起控制台 |
| `bun run now` | 立刻手动跑一批（不走调度） |
| `bun run seed` | 手动补写默认数据（首启已自动执行且幂等，一般用不到） |
| `bun run calibrate` | 打开真实页面 dump DOM + 截图到 `logs/calibrate.png`，用来更新选择器 |
| `bun test` | 跑全部单测 |
| `bun run typecheck` | 后端类型检查 |
| `bun run build:web` | 构建前端（先 `bun run --cwd web build` 一次，控制台才会托管静态文件） |
| `bun run scripts/clean-db.ts <db路径>` | 删掉一个 sqlite 库及其 wal/shm（重开前用） |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `DB_PATH` | `data/app.db` | SQLite 路径。`bun test` 里会强制指向临时库，不会碰你的真库 |
| `PORT` | `8787` | 控制台端口 |
| `HOST` | `0.0.0.0` | 监听地址。**默认全网卡**，局域网内任何人都能访问到登录页；只想本机访问就设 `127.0.0.1` |
| `HEADFUL` | 空 | 设成 `1` 显示浏览器窗口，方便眼看过程 |
| `PLAYWRIGHT` | 空 | 设成 `1` 才跑需要真浏览器的单测 |
| `DOUYIN_CONTAINER` | 空 | 设成 `1` 时浏览器加 `--no-sandbox` 并跳过系统 Chrome 探测（Docker 镜像默认注入） |

## Docker 部署

复制下面内容存成 `docker-compose.yml`，`docker compose up -d` 直接跑（用 GHCR 已发布镜像，本机构建都不需要）：

```yaml
services:
  douyinspark:
    image: ${DOUYIN_IMAGE:-ghcr.io/uxiaohan/douyinspark}:${DOUYIN_TAG:-latest}
    container_name: douyinspark
    restart: unless-stopped
    # 优雅停机要在当前好友边界收尾（最多 2 分钟），宽限必须比它长，
    # 否则 docker stop 的默认 10s 宽限会 SIGKILL 掉正在收尾的运行
    stop_grace_period: 2m10s
    # Chromium 默认只用 64MB /dev/shm，页面一复杂就崩
    shm_size: "1gb"
    ports:
      - "${DOUYIN_PORT:-8787}:8787"
    environment:
      TZ: "${DOUYIN_TZ:-Asia/Shanghai}"
    volumes:
      - ./data:/app/data
    # 日志不设上限会把磁盘吃光
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

起来后访问 `http://<机器IP>:8787`，首进走初始化引导设管理口令。

```bash
docker compose pull && docker compose up -d     # 升级到最新镜像
```

GHCR 的 package 默认私有，拉不动先 `docker login ghcr.io`（需要 `read:packages` 权限的 PAT）。

**国内加速**：ghcr.io 直连不稳，换成南京大学的 GHCR 代理 `ghcr.nju.edu.cn`（镜像路径相同，只换主机名）：

```bash
docker pull ghcr.nju.edu.cn/uxiaohan/douyinspark:latest
# 或让 compose 整体走代理：
DOUYIN_IMAGE=ghcr.nju.edu.cn/uxiaohan/douyinspark docker compose up -d
```

代理只同步**公开** package：私有包要么去 package 页面 Settings 改成 public，否则仍走 `docker login ghcr.io` + 有 `read:packages` 的 PAT 从官方源拉。

**改代码自测**：用仓库里的 `docker-build-compose.yml` 从当前源码本地构建再运行（一样挂 `./data`，别和上面同时跑，SQLite 会撞锁）：

```bash
docker compose -f docker-build-compose.yml up -d --build
```

**发布镜像**：仓库 Actions → Publish Docker image → Run workflow，无需参数。基于**推送时的 commit**：amd64 在标准 runner、arm64 在 GitHub 免费 arm runner（不走 QEMU，全程约 10 分钟）上原生并行构建，合成多架构 manifest 推到 `ghcr.io/uxiaohan/douyinspark`，固定打两个标签：`sha-<7位短哈希>`（不可变，按 commit 回滚）和 `latest`；任一侧失败不打新标签，线上镜像保持原样。所以改完代码先 push 再触发。

| 项 | 说明 |
|---|---|
| 数据 | 绑定挂载 `./data`（compose 同级的 data 目录）到容器 `/app/data`，app.db 就在那里；`docker compose down` 不碰它，删数据只能手动删目录 |
| 时区 | 固定 `TZ=Asia/Shanghai`（compose 里可改）。调度窗口按容器本地时间算，改 TZ 会让每天运行点整体漂移 |
| 迁移旧数据 | 把本机 `data/app.db`（连同 `-wal` / `-shm`）复制到 compose 同级的 `./data/` 再 `up -d`。**同一台机器上别让本机控制台和容器同时跑**：共用同一个 SQLite 库，WAL 跨进程锁在 Windows 上会报 `database is locked` |
| 绑定挂载权限 | 容器内运行用户是 uid/gid 1000（bun）；Linux 宿主先 `sudo chown -R 1000:1000 ./data`；Windows Docker Desktop 首次挂 D 盘需在 Settings → Resources → File Sharing 里放行 |
| 换端口 | `DOUYIN_PORT=9000 docker compose up -d` |

容器与本机的两点差异：浏览器用镜像内置 chromium（指纹与真实 Chrome 略有差异）；`HEADFUL=1` 无意义（无显示环境，容器内始终 headless）。

## 安全

- `data/app.db` 里存着全部账号的 cookie 和管理口令哈希，**不要提交、不要外发**（`.gitignore` 已挡）。
- 管理口令哈希用 bcrypt；登录失败才计限流次数，成功即清零。
- 控制台默认监听 `0.0.0.0`。它会话持有你的 cookie 和一键运行开关，暴露在局域网里等于把这些交出去。只在可信网络里用，或者设 `HOST=127.0.0.1`。

## 目录

```
index.ts             调度/手动运行入口
web-server.ts        控制台服务入口（Hono + 静态托管）
src/
  db.ts repo.ts      SQLite 与数据访问
  config.ts          设置读写、cookie 解析、指纹
  browser.ts         Playwright 启动与账号页面
  douyin.ts          聊天页打开、好友匹配、输入、发送与终态确认
  runner.ts          运行主循环
  run-child.ts       调度运行丢进子进程（内存隔离）
  cache-evict.ts     运行后驱逐页缓存（vmtouch，容器内存回落）
  scheduler.ts       每日随机窗口
  notify.ts          PushDeer
  selectors.ts       全部 DOM 选择器（漂移时改这里）
  calibrate.ts       真实 DOM 探针
  web/               Hono API 与认证
web/                 Vue3 控制台前端
scripts/             辅助脚本（清库）
```
