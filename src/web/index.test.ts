import "../testhelper"
import { db, repo, reset } from "../testhelper"
import { test, expect, beforeEach } from "bun:test"
import type { Hono } from "hono"
import { planNextRun, resetNextRun } from "../scheduler"
import { DEFAULT_SETTINGS } from "../config"
import { createApp } from "./index"

const PW = "pw-fixed-1"

let app: Hono

beforeEach(() => {
  // 每次都用全新库跑首次初始化流程，避免用例间共享口令哈希
  reset()
  resetNextRun()
  app = createApp()
})

async function login(password: string): Promise<string | null> {
  const res = await app.request("/api/login", {
    method: "POST",
    body: JSON.stringify({ password }),
    headers: { "content-type": "application/json" },
  })
  if (res.status !== 200) return null
  const setCookie = res.headers.get("set-cookie")
  return setCookie ? setCookie.split(";")[0]! : null
}

test("未登录访问 /api/settings 返回 401", async () => {
  const res = await app.request("/api/settings")
  expect(res.status).toBe(401)
})

test("POST /api/login 需要口令", async () => {
  const res = await app.request("/api/login", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  })
  expect(res.status).toBe(400)
})

test("错误口令登录返回 401", async () => {
  await login(PW)
  expect(await login("wrong")).toBeNull()
})

// 回归：口令哈希经 settings 表存取，getSetting 返回的是 JSON 编码串。
// 若直接把原始返回值喂给 verify，除了首次登录（写入侧）之外全部会 401，管理员被锁死。
test("同一口令重复登录都应成功", async () => {
  expect(await login(PW)).not.toBeNull()
  expect(await login(PW)).not.toBeNull()
  expect(await login(PW)).not.toBeNull()
})

test("首次登录后 /api/bootstrap 报告已初始化", async () => {
  const before = await app.request("/api/bootstrap")
  expect(((await before.json()) as { initialized: boolean }).initialized).toBe(false)
  expect(await login(PW)).not.toBeNull()
  const after = await app.request("/api/bootstrap")
  expect(((await after.json()) as { initialized: boolean }).initialized).toBe(true)
})

test("登录后带 cookie 访问 /api/settings 返回 200", async () => {
  const cookie = await login(PW)
  expect(cookie).not.toBeNull()
  const res = await app.request("/api/settings", { headers: { cookie: cookie! } })
  expect(res.status).toBe(200)
})

test("POST /api/logout 清掉会话", async () => {
  const cookie = await login(PW)
  const out = await app.request("/api/logout", { method: "POST", headers: { cookie: cookie! } })
  expect(out.status).toBe(200)
  const after = await app.request("/api/settings", { headers: { cookie: cookie! } })
  expect(after.status).toBe(401)
})

test("GET /api/accounts 不回显 cookie_json", async () => {
  const cookie = await login(PW)
  const created = await app.request("/api/accounts", {
    method: "POST",
    body: JSON.stringify({ alias: "控制台账号", cookie_json: '[{"name":"a","value":"b"}]' }),
    headers: { "content-type": "application/json", cookie: cookie! },
  })
  expect(created.status).toBe(200)
  const res = await app.request("/api/accounts", { headers: { cookie: cookie! } })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { items: Array<{ alias?: string; hasCookie?: boolean }> }
  expect(JSON.stringify(body)).not.toContain('"name":"a"')
  expect(JSON.stringify(body)).toContain("控制台账号")
  const account = body.items[0]
  expect(account?.hasCookie).toBe(true)
})

test("连续输错口令 5 次后返回 429", async () => {
  await login(PW)
  for (let i = 0; i < 5; i++) expect(await login("wrong")).toBeNull()
  const res = await app.request("/api/login", {
    method: "POST",
    body: JSON.stringify({ password: PW }),
    headers: { "content-type": "application/json" },
  })
  expect(res.status).toBe(429)
  expect(db).toBeTruthy()
})

// 直接往库里塞会话，绕开登录：同一文件前面的用例已经在限流表里留下失败记录，
// 60 秒窗口内再登录会被 429 挡掉，那样测的就不是 next-run 了。
async function sessionCookie(): Promise<string> {
  const token = "test-session-token"
  repo.saveSession(token, new Date(Date.now() + 3600_000).toISOString())
  return `session=${token}`
}

// 回归：/api/next-run 原先每次请求都重新随机取点，刷新页面就变，
// 而且和调度真正采用的时间不是同一个值。现在只回登记过的那个。
// 回归：好友原来可以重复添加，同一备注出现两行——跑批会命中同一个会话，
// dry-run 下只是多发一遍通知，dryRun=false 就是给同一个人发两条。
// 现在同账号下折叠空白后重名直接 409，不落库。
test("POST /api/accounts/:id/friends 同账号重名返回 409 且不落库", async () => {
  const cookie = await sessionCookie()
  const created = await app.request("/api/accounts", {
    method: "POST",
    body: JSON.stringify({ alias: "a" }),
    headers: { "content-type": "application/json", cookie },
  })
  const { id } = (await created.json()) as { id: number }
  const add = (name: string) =>
    app.request(`/api/accounts/${id}/friends`, {
      method: "POST",
      body: JSON.stringify({ name }),
      headers: { "content-type": "application/json", cookie },
    })
  expect((await add("小明 阿花")).status).toBe(200)
  // NBSP 变体也算重复：折叠空白后同名
  const dup = await add("小明\u00A0阿花")
  expect(dup.status).toBe(409)
  expect(((await dup.json()) as { error: string }).error).toContain("小明 阿花")
  expect(repo.listFriends(id).length).toBe(1)
})

test("GET /api/next-run 未启动调度时返回 null", async () => {
  const res = await app.request("/api/next-run", { headers: { cookie: await sessionCookie() } })
  expect(res.status).toBe(200)
  expect((await res.json() as { nextRunAt: string | null }).nextRunAt).toBeNull()
})

test("GET /api/next-run 返回调度登记过的同一个时间，且重复读取稳定", async () => {
  const cookie = await sessionCookie()
  const planned = planNextRun(DEFAULT_SETTINGS, new Date())
  const first = await app.request("/api/next-run", { headers: { cookie } })
  const second = await app.request("/api/next-run", { headers: { cookie } })
  const a = (await first.json() as { nextRunAt: string | null }).nextRunAt
  const b = (await second.json() as { nextRunAt: string | null }).nextRunAt
  expect(a).toBe(planned.toISOString())
  expect(b).toBe(a)
})
