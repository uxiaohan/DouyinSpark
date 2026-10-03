import "./testhelper"
import { test, expect, beforeEach } from "bun:test"
import { DEFAULT_SETTINGS } from "./config"
import type { AccountResult, AccountRuntime, FriendRow, RuntimeSettings } from "./types"
import type { RunState } from "./runner"
import { cookieExpiredResult, handleFriend, isRunning, pickFriendTexts, requestStop, resetStop, summarize } from "./runner"

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
  fallbackMessages: [],
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

// 回归（用户真机 run 22）：专属与全局文案曾合成一个池随机抽，8 条池子里 1 条
// 专属，真发出去的全是公共文案，"专属在前、全局兜底"形同虚设。
// 用户后续口径收紧：账号有专属就不碰全局。以下用循环断言压住随机性。
test("专属够用：只发账号专属文案", () => {
  for (let i = 0; i < 50; i++) {
    const texts = pickFriendTexts(["专属甲", "专属乙"], ["全局一", "全局二"], 2, true)
    expect(texts.sort()).toEqual(["专属乙", "专属甲"])
  }
})

test("专属不够：只发专属，不用全局垫数", () => {
  for (let i = 0; i < 50; i++) {
    // count 远大于专属数，也绝不多发一条全局——宁可少发
    const texts = pickFriendTexts(["专属甲"], ["全局一", "全局二"], 3, true)
    expect(texts).toEqual(["专属甲"])
  }
})

test("没有专属文案：才用全局", () => {
  const texts = pickFriendTexts([], ["全局一", "全局二"], 2, true)
  expect(texts.sort()).toEqual(["全局一", "全局二"])
})

test("两个池都空：返回空（调用方据此跳过该好友）", () => {
  expect(pickFriendTexts([], [], 2, true)).toEqual([])
})

test("同一个好友内同一条不重样（dedupe 开）", () => {
  const texts = pickFriendTexts([], ["同一条", "同一条", "别的"], 2, true)
  expect(texts.filter((t) => t === "同一条").length).toBe(1)
  expect(texts.length).toBe(2)
})

test("count 为 0 或负数：不发", () => {
  expect(pickFriendTexts(["专属甲"], ["全局一"], 0, true)).toEqual([])
  expect(pickFriendTexts(["专属甲"], ["全局一"], -3, true)).toEqual([])
})

// 回归（用户 run 22 真机反馈）：同账户两个好友收到了同一条文案。
// 专属池只有一条时"专属优先"会让每个好友都挑到它，所以挑选要避开本轮
// 前面好友已挑走的文案。
test("前面好友挑走的文案不再挑：同账户多好友不同文案", () => {
  for (let i = 0; i < 50; i++) {
    const texts = pickFriendTexts(["专属甲", "专属乙"], ["全局一"], 1, true, new Set(["专属甲"]))
    expect(texts).toEqual(["专属乙"])
  }
})

// 回归（用户 21:38 口径）：有专属就不发全局。专属被前面好友轮空时，
// 这个好友返回空、由调用方跳过——不落全局，也不对两个人发同一条。
test("专属被前面好友轮空：返回空让调用方跳过，不落全局", () => {
  for (let i = 0; i < 50; i++) {
    const texts = pickFriendTexts(["专属甲"], ["全局一", "全局二"], 1, true, new Set(["专属甲"]))
    expect(texts).toEqual([])
  }
})

test("只有全局池轮空才允许重复补足：没得发比重复更糟", () => {
  for (let i = 0; i < 50; i++) {
    const texts = pickFriendTexts([], ["全局一"], 1, true, new Set(["全局一"]))
    expect(texts).toEqual(["全局一"])
  }
})
