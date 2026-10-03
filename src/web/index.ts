import { Hono } from "hono"
import { loadSettings, saveSettings } from "../config"
import {
  createAccount,
  createFriend,
  createMessage,
  deleteAccount,
  findFriendByName,
  deleteFriend,
  deleteMessage,
  deleteSession,
  getSession,
  listAccounts,
  listFriends,
  listMessages,
  listRunItems,
  listRuns,
  saveSession,
  updateAccount,
} from "../repo"
import { getNextRunAt } from "../scheduler"
import { isRunning, requestStop, runOnce } from "../runner"
import { log } from "../logger"
import { sendPushDeer } from "../notify"
import { issueSession, readPasswordHash, verifyPassword, writePasswordHash } from "./auth"
import type { AccountRow, Bool, RunItemRow, RuntimeSettings } from "../types"

const COOKIE = "session"

/**
 * 登录尝试限流：按 IP 计时窗，超过 MAX_TRIES 返回 429。
 * 记的是失败尝试，避免误伤正常登录；内存实现，重启即清。
 */
const fails = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_FAILS = 5

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const list = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_FAILS) return false
  fails.set(ip, list)
  return true
}

function noteFailure(ip: string): void {
  const now = Date.now()
  const list = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  list.push(now)
  fails.set(ip, list)
}

function clearFailures(ip: string): void {
  fails.delete(ip)
}

export function createApp(): Hono {
  const app = new Hono()

  app.use("/api/*", async (c, next) => {
    const path = c.req.path
    if (path === "/api/login" || path === "/api/logout" || path === "/api/bootstrap") {
      await next()
      return
    }
    if (path === "/api/runs/now" && !(await hasSession(c))) {
      return c.body(null, 401)
    }
    if (!(await hasSession(c))) return c.body(null, 401)
    await next()
  })

  async function hasSession(c: Parameters<Parameters<Hono["use"]>[1]>[0]): Promise<boolean> {
    const header = c.req.header("cookie") ?? ""
    const match = /(?:^|;\s*)session=([^;]+)/.exec(header)
    if (!match) return false
    const token = decodeURIComponent(match[1] as string)
    const session = getSession(token)
    if (!session) return false
    if (Date.parse(session.expires_at) <= Date.now()) {
      deleteSession(token)
      return false
    }
    return true
  }

  app.post("/api/login", async (c) => {
    const ip = c.req.header("x-forwarded-for") ?? "local"
    if (!checkRateLimit(ip)) return c.json({ error: "尝试过于频繁" }, 429)
    const body = (await c.req.json().catch(() => null)) as { password?: string } | null
    const password = body?.password
    if (typeof password !== "string" || password.length === 0) return c.json({ error: "口令不能为空" }, 400)
    const hash = readPasswordHash()
    if (hash) {
      if (!(await verifyPassword(password, hash))) {
        noteFailure(ip)
        return c.json({ error: "口令错误" }, 401)
      }
    } else {
      // 首次访问：一次性初始化口令
      await writePasswordHash(password)
    }
    clearFailures(ip)
    const { token, expiresAt } = await issueSession()
    saveSession(token, expiresAt)
    c.header("set-cookie", `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`)
    return c.json({ ok: true })
  })

  app.post("/api/logout", async (c) => {
    const header = c.req.header("cookie") ?? ""
    const match = /(?:^|;\s*)session=([^;]+)/.exec(header)
    if (match) deleteSession(decodeURIComponent(match[1] as string))
    c.header("set-cookie", `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`)
    return c.json({ ok: true })
  })

  app.get("/api/bootstrap", (c) => c.json({ initialized: readPasswordHash() !== null }))

  app.get("/api/settings", (c) => c.json(loadSettings()))

  app.put("/api/settings", async (c) => {
    const body = (await c.req.json().catch(() => null)) as RuntimeSettings | null
    if (!body || typeof body !== "object") return c.json({ error: "无效的配置" }, 400)
    saveSettings(body)
    return c.json(loadSettings())
  })

  /** 不回显 cookie 原文；只暴露 hasCookie 标志 */
  const maskAccount = (a: AccountRow) => ({
    id: a.id,
    alias: a.alias,
    hasCookie: a.cookie_json !== null,
    proxy_server: a.proxy_server ? maskProxy(a.proxy_server) : null,
    proxy_username: a.proxy_username !== null,
    enabled: a.enabled === 1,
    daily_cap: a.daily_cap,
    last_run_at: a.last_run_at,
    created_at: a.created_at,
  })

  function maskProxy(server: string): string {
    try {
      const u = new URL(/:\/\//.test(server) ? server : `http://${server}`)
      return `${u.protocol}//***@${u.host}`
    } catch {
      return "***"
    }
  }

  /** 账号口令只写不回显；未填 cookie 时保持旧值不动 */
  app.post("/api/accounts", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const alias = body?.alias
    if (typeof alias !== "string" || alias.trim().length === 0) return c.json({ error: "别名不能为空" }, 400)
    const id = createAccount({
      alias: alias.trim(),
      cookie_json: typeof body?.cookie_json === "string" ? body.cookie_json : null,
      proxy_server: strOrNull(body?.proxy_server),
      proxy_username: strOrNull(body?.proxy_username),
      proxy_password: strOrNull(body?.proxy_password),
      daily_cap: typeof body?.daily_cap === "number" ? body.daily_cap : null,
    })
    return c.json({ ok: true, id })
  })

  app.get("/api/accounts", (c) => c.json({ items: listAccounts().map(maskAccount) }))

  app.put("/api/accounts/:id", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return c.json({ error: "无效的配置" }, 400)
    const patch: Parameters<typeof updateAccount>[1] = {}
    if (typeof body.alias === "string") patch.alias = body.alias.trim()
    if (typeof body.cookie_json === "string") patch.cookie_json = body.cookie_json
    if (typeof body.proxy_server === "string") patch.proxy_server = body.proxy_server
    if (typeof body.proxy_username === "string") patch.proxy_username = body.proxy_username
    if (typeof body.proxy_password === "string") patch.proxy_password = body.proxy_password
    if (typeof body.enabled === "boolean") patch.enabled = (body.enabled ? 1 : 0) as Bool
    if (typeof body.daily_cap === "number") patch.daily_cap = body.daily_cap
    updateAccount(Number(c.req.param("id")), patch)
    return c.json({ ok: true })
  })

  app.delete("/api/accounts/:id", (c) => {
    deleteAccount(Number(c.req.param("id")))
    return c.json({ ok: true })
  })

  app.get("/api/accounts/:id/friends", (c) =>
    c.json({ items: listFriends(Number(c.req.param("id"))) }),
  )

  app.post("/api/accounts/:id/friends", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { name?: string } | null
    const name = body?.name
    if (typeof name !== "string" || name.trim().length === 0) return c.json({ error: "备注不能为空" }, 400)
    const accountId = Number(c.req.param("id"))
    // 同账号下重名直接拒：跑批会命中同一个会话，等于给同一个人发两条。
    // 折叠空白后比较，所以 NBSP/全角空格和普通空格算同一个名字；不同账号可以有同名好友。
    const dup = findFriendByName(accountId, name)
    if (dup) return c.json({ error: `该账号下已有同名好友「${dup.name}」` }, 409)
    // 规范化（折叠空白）统一在 repo.createFriend 里做，这里只管校验
    const id = createFriend(accountId, name)
    return c.json({ ok: true, id })
  })

  app.delete("/api/accounts/:id/friends/:fid", (c) => {
    deleteFriend(Number(c.req.param("fid")))
    return c.json({ ok: true })
  })

  /** accountId 缺省时返回全部，否则只返回该账号 */
  app.get("/api/messages", (c) => {
    const raw = c.req.query("accountId")
    const items = listMessages(raw === undefined ? undefined : raw === "global" ? null : Number(raw))
    return c.json({ items })
  })

  app.post("/api/messages", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { text?: string; accountId?: number | null } | null
    const text = body?.text
    if (typeof text !== "string" || text.trim().length === 0) return c.json({ error: "文案不能为空" }, 400)
    const id = createMessage(typeof body?.accountId === "number" ? body.accountId : null, text.trim())
    return c.json({ ok: true, id })
  })

  app.delete("/api/messages/:id", (c) => {
    deleteMessage(Number(c.req.param("id")))
    return c.json({ ok: true })
  })

  app.get("/api/runs", (c) => c.json({ items: listRuns(50) }))

  app.get("/api/runs/:id/items", (c) => c.json({ items: listRunItems(Number(c.req.param("id"))) }))

  app.post("/api/runs/now", (c) => {
    if (isRunning()) return c.json({ error: "已有跑批在进行中" }, 409)
    void runOnce("manual").catch((err: unknown) => log.error("手动跑批失败", { err: String(err) }))
    return c.json({ ok: true })
  })

  app.post("/api/stop", (c) => {
    requestStop()
    return c.json({ ok: true })
  })

  // 只回调度登记过的那个时间。原来是这里现算，窗口内是 Math.random() 取点，
  // 每次请求都是新随机数——刷新一次页面数字就变，而且和调度真正采用的时间对不上。
  // 未启动调度（--web-only）时返回 null，前端据此显示"调度未运行"。
  app.get("/api/next-run", (c) => c.json({ nextRunAt: getNextRunAt()?.toISOString() ?? null }))

  app.post("/api/notify/test", async (c) => {
    const key = loadSettings().pushdeerKey
    if (!key) return c.json({ error: "未配置 PushDeer Key" }, 400)
    const ok = await sendPushDeer(key, "DouyinSpark 测试", "配置正确，推送正常。")
    return c.json({ ok })
  })

  return app
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}
