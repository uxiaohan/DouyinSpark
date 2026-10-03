import "../testhelper"
import { db, reset } from "../testhelper"
import { test, expect, beforeEach } from "bun:test"
import type { Hono } from "hono"
import { createApp } from "./index"

const PW = "pw-fixed-1"

let app: Hono

beforeEach(() => {
  // 每次都用全新库跑首次初始化流程，避免用例间共享口令哈希
  reset()
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
