# DouyinSpark 续火花

本地自动化"抖音续火花"：每天在一个随机时间窗口内，用每个账号自己的 cookie 登录抖音网页版，
给该账号的火花好友发随机文案，配一个 Vue3 网页控制台做配置和查看。

运行引擎是 Bun + Playwright，控制台是 Hono + Vue3，数据存在本地 SQLite（`bun:sqlite`，无外部数据库）。

---

## 环境要求

| 项 | 版本 | 说明 |
|---|---|---|
| Bun | 1.4.2 | 项目按这个版本开发和测试 |
| Chrome | 任意较新版本 | **必须本机安装**。运行用 `channel: "chrome"` 起真实 Chrome，不依赖 Playwright 自带的 chromium |
| Node | 不需要 | 前端构建由 Bun 驱动 |

依赖只有三个：`playwright`、`hono`、`@types/bun`（dev）。前端额外用 `vue` + `vue-router`。

用 Docker 部署则本机不需要 Bun、Node 和 Chrome，见下文「Docker 部署」。

```bash
bun install
```

---

## 快速开始

```bash
# 1. 初始化数据库（写入示例账号、好友和文案，方便先看清楚结构）
bun run seed

# 2. 启动控制台（默认 0.0.0.0:8787）
bun run web
```

浏览器打开 `http://127.0.0.1:8787`（本机访问用 127.0.0.1 即可）。

**首次登录**：这时还没有管理口令，登录框里随便输入一个口令就会成为管理口令（只此一次）。
之后每次登录都要用这个口令。会话 cookie 24 小时有效，HttpOnly。同一 IP 一分钟内连续输错 5 次会被限流。

### 粘贴自己的 cookie

1. 浏览器登录抖音网页版（`https://www.douyin.com/`）。
2. 用 Cookie-Editor 之类的扩展导出当前域名的 cookie，得到 JSON 数组。
3. 控制台「账号」页 → 填别名 → 粘贴那段 JSON → 保存。

注意：
- cookie **只写入、不回显**，之后在界面上看到的是掩码。
- 域名必须含 `douyin`，否则该条 cookie 会被跳过。
- 保存在本地 `data/app.db`，**不会**进 git（`data/` 已在 `.gitignore`）。
- cookie 失效后运行不会崩：该账号的全部好友会被标记 `skipped (cookie 失效)`，其他账号照常跑。

### 加好友和文案

- 「好友」页按账号添加，名字必须是抖音会话列表里显示的备注/昵称，**精确匹配**（空白折叠后：NBSP、全角空格、普通空格都识别，写入时会折叠成普通空格；但空格的有无算不同名字，"张 三" ≠ "张三"）。同一账号下不可重复添加，重名返回 409。
- 「文案」页维护随机文案池，可以按账号分开。

### 第一次试跑

默认 `dryRun = true`：会真打开浏览器、真登录、真点进会话，但**停在输入之前**，不发送。
在终端手动跑一次：

```bash
bun run now
```

看到 `dry-run 未发送` 就说明整条链路通了。确认无误后再把「设置」页的 `dryRun` 关掉。

**关掉 dryRun 之前请自己想清楚**：它会真的给好友发消息。实测一次真发（单好友、单条）从启动到跑完约 27 秒。

---

## 命令

| 命令 | 作用 |
|---|---|
| `bun run web` | 启动控制台，**同时**进入每日调度循环 |
| `bun run web-server.ts --web-only` | 只跑控制台，不进调度（调试用） |
| `bun run start` | 只跑调度循环，不起控制台 |
| `bun run now` | 立刻手动跑一批（不走调度） |
| `bun run seed` | 写入示例数据 |
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

---

## Docker 部署

整套跑在容器里，不依赖本机的 Bun / Chrome。两个 compose 文件分工：

| 文件 | 用途 |
|---|---|
| `docker-compose.yml` | **直接运行** GHCR 上已发布的镜像（`ghcr.io/uxiaohan/douyinspark`），不在本机构建 |
| `docker-build-compose.yml` | 从当前源码**本地构建**再运行，改代码自测用 |

### 运行发布的镜像

```bash
# 首次 / 升级都是这两条
docker compose pull
docker compose up -d

# 指定版本：DOUYIN_TAG=sha-1a2b3c4 docker compose up -d
# 看日志，确认出现 "scheduler: 下次运行" 即调度循环就绪
docker compose logs -f
```

启动后访问 `http://<机器IP>:8787`。首次登录同本地：随便输一个口令即成为管理口令。

GHCR 的 package 默认**私有**，拉不动就先登录（用有 `read:packages` 权限的 PAT）：

```bash
docker login ghcr.io
```

#### 国内加速（ghcr.nju.edu.cn）

ghcr.io 国内直连不稳，可用南京大学的 GHCR 代理 `ghcr.nju.edu.cn`——镜像路径与 ghcr.io 相同，只换主机名：

```bash
# 直接拉
docker pull ghcr.nju.edu.cn/uxiaohan/douyinspark:latest

# 或让 compose 整体走代理（镜像名可覆盖）
DOUYIN_IMAGE=ghcr.nju.edu.cn/uxiaohan/douyinspark docker compose up -d
```

注意：代理只同步**公开**的 package。私有包要么先去 package 页面 Settings 改成 public，
否则仍然走 `docker login ghcr.io` + 有 `read:packages` 的 PAT 从官方源拉。

### 本地构建运行

```bash
docker compose -f docker-build-compose.yml up -d --build
```

### 发布镜像（GitHub Actions）

仓库 **Actions → Publish Docker image → Run workflow**，可选填标签（默认 `latest`）。
触发后基于**推送时的那个 commit** 构建 `linux/amd64`（平台框可填 `linux/amd64,linux/arm64` 出多架构，会慢不少），
推到 `ghcr.io/uxiaohan/douyinspark:<tag>`，同时打一个 `sha-<短commit>` 的不可变标签方便回滚。
所以改完代码先 push，再触发工作流。

| 项 | 说明 |
|---|---|
| 数据 | 绑定挂载 `./data`（compose 文件同级的 data 目录）到容器 `/app/data`。app.db 就躺在那里，看得见摸得着；`docker compose down` 不碰它，想删数据只能手动删目录 |
| 时区 | 固定 `TZ=Asia/Shanghai`。调度窗口按容器本地时间算，改 TZ 会让每天运行点整体漂移 |
| 手动跑一批 | `docker compose exec douyinspark bun run now` |
| 迁移旧数据 | 把本机 `data/app.db`（连同 `-wal` / `-shm`，如果有）复制到 compose 同级的 `./data/`，再 `docker compose up -d`。**同一台机器上别让本机控制台和容器同时跑**：两边共用同一个 SQLite 库，WAL 跨进程锁在 Windows 上会报 `database is locked` |
| 绑定挂载权限 | 容器内运行用户是 uid/gid 1000（bun）。Linux 宿主先 `sudo chown -R 1000:1000 ./data`；Windows Docker Desktop 首次挂 D 盘需在 Settings → Resources → File Sharing 里放行 |
| 换端口 | `DOUYIN_PORT=9000 docker compose up -d` |
| 停机 | `docker stop` 发 SIGTERM，会等当前好友边界收尾再退出（优雅停机，最多 2 分钟）；容器内再次收到信号才强制退 |
| 日志 | json-file 滚动：单文件上限 10MB，保留 3 份 |

和本机跑的两点差异：

1. 浏览器用镜像内置的 chromium，不是本机 Chrome。指纹与真实 Chrome 略有差异，首次建议保持 `dryRun = true` 在「设置」页观察一轮。
2. `HEADFUL=1` 在容器里无意义（没有显示环境），容器内始终 headless。

---

## 一轮运行是怎么跑的

1. 读取配置，按账号顺序处理；同代理的账号共用一个浏览器实例，各自独立 context。
2. 每个账号先开首页判断登录态，再点「消息」入口打开 IM 弹层。
3. 在会话列表里按备注**精确匹配**（空白折叠后）找到好友（虚拟滚动，找不到就滚 `maxScrollAttempts` 次）。
4. 逐字输入文案（速度按 `typingCps` 随机抖动），**按回车发送**。
5. 命中验证码/风控文案 → 该好友记 `failed`；连续失败达到 `consecutiveFailAbort` → 中止整批。
6. 全部跑完按 `notifyOnRun` / `notifyOnAbort` 决定是否推 PushDeer，推送失败不影响运行结果。

### 关于发送方式

抖音网页版的 IM **只能用回车发送**，设置里不可切换。所以代码里没有发送按钮的选择器——
那个按钮是个 `<svg>`，没有 `aria-label` 也没有可读文本，点它比按回车只多一层不稳定。

### 关于调度

每天在 `[schedule.start, schedule.end]` 这个本地时间窗口内取一个**随机时刻**跑一次；
当前已晚于窗口结束时间就顺延到次日。开始与结束永远是**同一天**的两个时刻（结束早于开始的
区间在控制台和后端都会被拒绝）。开始 = 结束（零长窗口）不随机：每天到点就跑。
`/api/next-run` 可以看下次预计运行时间。

2026-10-04 翻车记录：旧实现用 `end <= start` 判跨零点，用户设的 01:04–01:04 被当成跨零点、
`end` 推到次日，零长窗口悄悄变成 24 小时窗口，"下次运行"随机排到约 9 小时后。
已改为严格小于，并补了零长窗口的回归用例。

跑完一批后不会在同一个窗口内再取点：本轮窗口的结束时刻会作为 `after`
由循环带进下一轮取点。这一条 2026-10-03 之前在真机上翻过车——同一窗口连跑两轮，
`runs` 表里 run 13/14、run 15/16 各相差几十秒；已补一个用假时钟驱动真实循环的
回归用例，但"跨天只跑一轮"的真机表现要等下一个窗口才验证得了。

### 关于风控与降级

- 选择器 drift 不会静默失败：会打 `warn` 日志，把该好友记 `skipped (未找到会话)`。
- 风控检测扫的是整页 body 文本，所以候选文案**不能**收"请稍后再试"这类日常客套
  （好友聊天记录里出现这句话会误判成风控，把好友记 failed 并累计连续失败）。
- PushDeer 推送失败只记 warning，绝不让运行崩。
- `Ctrl+C` 一次：运行会在当前好友的边界停下；再按一次才强退。

---

## 已验证 / 未验证

下面这些是拿用户真实 cookie 在真机上跑过的，其余都没验证过，用之前请自己确认。

**已验证**
- 完整 dry-run 链路：登录态判定 → 打开 IM 弹层 → 取会话列表 → 按备注匹配 → 点进会话 → 风控检测 → 停在发送前。
- 真发一条消息：消息确实出现在聊天记录里（时间戳"刚刚"），输入框无残留草稿。
- 控制台：登录/登出、设置、账号、好友、文案、运行记录的读写；静态托管与 SPA 回退。
- 单测 110 项通过（另有 1 项需要真浏览器，默认跳过）。

**未验证（重要）**
- 多账号同时跑、代理、每账号 1-3 条文案的间隔节奏：只跑过单账号单条。
- Playwright 自带 chromium 的启动回退路径：CDN 装不上，只验证过本机 Chrome。
- 跨零点的每日调度循环：只有 `computeNextRunAt` 的注入时间单测，没有真跑过跨天。
- 风控命中后的降级路径：没法主动触发，没有复现过。
- PushDeer 推送：没有配 key，没真发过。

## 安全

- `data/app.db` 里存着全部账号的 cookie 和管理口令哈希，**不要提交、不要外发**（`.gitignore` 已挡）。
- 管理口令哈希用 bcrypt；登录失败才计限流次数，成功即清零。
- 控制台默认监听 `0.0.0.0`。它会话持有你的 cookie 和一键运行开关，暴露在局域网里等于把这些交出去。
  只在可信网络里用，或者设 `HOST=127.0.0.1`。

## 目录

```
index.ts             调度/手动运行入口
web-server.ts        控制台服务入口（Hono + 静态托管）
src/
  db.ts repo.ts      SQLite 与数据访问
  config.ts          设置读写、cookie 解析、指纹
  browser.ts         Playwright 启动与账号页面
  douyin.ts          登录态、会话匹配、输入、发送
  runner.ts          运行主循环
  scheduler.ts       每日随机窗口
  notify.ts          PushDeer
  selectors.ts       全部 DOM 选择器（漂移时改这里）
  calibrate.ts       真实 DOM 探针
  web/               Hono API 与认证
web/                 Vue3 控制台前端
scripts/             辅助脚本（清库、API 冒烟）
```
