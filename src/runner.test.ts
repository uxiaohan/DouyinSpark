import "./testhelper"
import { test, expect, beforeEach } from "bun:test"
import { DEFAULT_SETTINGS } from "./config"
import type { AccountResult, AccountRuntime, FriendRow, RuntimeSettings } from "./types"
import type { RunState } from "./runner"
import { cookieExpiredResult, handleFriend, isRunning, requestStop, resetStop, summarize } from "./runner"

const friend = (id: number, name: string): FriendRow => ({ id, account_id: 1, name, created_at: "" })

const runtime = (): AccountRuntime => ({
  account: {
    id: 1,
    alias: "a",
    cookie_json: null,
    proxy_server: null,
    proxy_username: null,
    proxy_password: null,
    enabled: 1,
    daily_cap: null,
    last_run_at: null,
    created_at: "",
  },
  friends: [friend(1, "张三"), friend(2, "李四")],
  messages: ["你好"],
})

const state = (over: Partial<RunState> = {}, settings: RuntimeSettings = DEFAULT_SETTINGS): RunState => ({
  runId: 1,
  settings,
  consecutiveFail: 0,
  aborted: false,
  shouldStop: () => false,
  ...over,
})

beforeEach(resetStop)

test("summarize 全部成功 → success 且计数一致", () => {
  const accounts: AccountResult[] = [
    {
      accountId: 1,
      alias: "a",
      cookieExpired: false,
      aborted: false,
      reason: null,
      friends: [
        { friendId: 1, name: "张三", status: "success", messages: 2, reason: null },
        { friendId: 2, name: "李四", status: "success", messages: 1, reason: null },
      ],
    },
  ]
  const s = summarize(1, "manual", "2026-10-03T00:00:00.000Z", accounts, false)
  expect(s.status).toBe("success")
  expect(s.totals).toEqual({ success: 2, failed: 0, skipped: 0 })
})

test("summarize 有失败 → partial", () => {
  const accounts: AccountResult[] = [
    {
      accountId: 1,
      alias: "a",
      cookieExpired: false,
      aborted: false,
      reason: null,
      friends: [
        { friendId: 1, name: "张三", status: "success", messages: 1, reason: null },
        { friendId: 2, name: "李四", status: "failed", messages: 0, reason: "boom" },
      ],
    },
  ]
  expect(summarize(1, "manual", "2026-10-03T00:00:00.000Z", accounts, false).status).toBe("partial")
})

test("summarize aborted 标记优先于 partial/success", () => {
  expect(summarize(1, "manual", "", [], true).status).toBe("aborted")
})

test("summarize 全部跳过不算成功", () => {
  const accounts = [cookieExpiredResult(runtime(), "cookie 失效")]
  const s = summarize(1, "manual", "", accounts, false)
  expect(s.status).toBe("partial")
  expect(s.totals).toEqual({ success: 0, failed: 0, skipped: 2 })
})

test("cookie 失效 → 该账号全部好友 skipped 且 cookieExpired=true", () => {
  const r = cookieExpiredResult(runtime(), "cookie 失效/未登录")
  expect(r.cookieExpired).toBe(true)
  expect(r.reason).toBe("cookie 失效/未登录")
  expect(r.friends.length).toBe(2)
  expect(r.friends.every((f) => f.status === "skipped")).toBe(true)
  expect(r.friends.every((f) => f.reason === "cookie 失效")).toBe(true)
})

test("handleFriend 首次失败后重试成功 → success，不计连续失败", async () => {
  let calls = 0
  const fr = await handleFriend(friend(1, "张三"), state(), async () => {
    calls += 1
    if (calls === 1) throw new Error("第一次失败")
    return { status: "success" as const, messages: 2, reason: null }
  })
  expect(fr.status).toBe("success")
  expect(calls).toBe(2)
  expect(fr.messages).toBe(2)
})

test("handleFriend 重试用尽 → failed 且连续失败累加", async () => {
  const s = state({}, { ...DEFAULT_SETTINGS, limits: { ...DEFAULT_SETTINGS.limits, retryPerFriend: 1, consecutiveFailAbort: 99 } })
  const fr = await handleFriend(friend(1, "张三"), s, async () => {
    throw new Error("一直失败")
  })
  expect(fr.status).toBe("failed")
  expect(fr.reason).toContain("一直失败")
  expect(s.consecutiveFail).toBe(1)
})

test("连续失败达阈值 → state.aborted", async () => {
  const s = state({}, { ...DEFAULT_SETTINGS, limits: { ...DEFAULT_SETTINGS.limits, retryPerFriend: 0, consecutiveFailAbort: 2 } })
  const boom = async () => {
    throw new Error("炸")
  }
  await handleFriend(friend(1, "甲"), s, boom)
  expect(s.aborted).toBe(false)
  await handleFriend(friend(2, "乙"), s, boom)
  expect(s.aborted).toBe(true)
})

test("成功会把连续失败计数清零", async () => {
  const s = state({ consecutiveFail: 5 })
  await handleFriend(friend(1, "甲"), s, async () => ({ status: "success" as const, messages: 1, reason: null }))
  expect(s.consecutiveFail).toBe(0)
})

test("requestStop 后好友标记 skipped 且不再重试", async () => {
  const s = state({ shouldStop: () => true })
  let calls = 0
  const fr = await handleFriend(friend(1, "张三"), s, async () => {
    calls += 1
    return { status: "success" as const, messages: 1, reason: null }
  })
  expect(fr.status).toBe("skipped")
  expect(fr.reason).toBe("已请求停止")
  expect(calls).toBe(0)
})

test("skip（未找到会话）不触发重试也不计连续失败", async () => {
  const s = state()
  let calls = 0
  const fr = await handleFriend(friend(1, "张三"), s, async () => {
    calls += 1
    return { status: "skipped" as const, messages: 0, reason: "未找到会话" }
  })
  expect(fr.status).toBe("skipped")
  expect(calls).toBe(1)
  expect(s.consecutiveFail).toBe(0)
})

test("isRunning 初始为 false", () => {
  expect(isRunning()).toBe(false)
})
