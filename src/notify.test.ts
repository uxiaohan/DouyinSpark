import { afterEach, expect, spyOn, test } from "bun:test"
import { DEFAULT_SETTINGS } from "./config"
import type { AccountResult, RunSummary } from "./types"
import { buildSummaryMarkdown, notifyRun, sendPushDeer } from "./notify"

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 1,
    trigger: "manual",
    startedAt: "2026-10-03T01:00:00.000Z",
    finishedAt: "2026-10-03T01:05:00.000Z",
    status: "partial",
    totals: { success: 0, failed: 0, skipped: 0 },
    accounts: [],
    ...over,
  }
}

function account(over: Partial<AccountResult> = {}): AccountResult {
  return { accountId: 1, alias: "账号A", cookieExpired: false, aborted: false, reason: null, friends: [], ...over }
}

afterEach(() => {
  // 每个用例自己 spy，这里兜底恢复
})

test("cookie 失效账号渲染 ⏭️ cookie 失效", () => {
  const md = buildSummaryMarkdown(
    summary({
      totals: { success: 0, failed: 0, skipped: 2 },
      accounts: [
        account({
          cookieExpired: true,
          reason: "cookie 失效/未登录",
          friends: [
            { friendId: 1, name: "张三", status: "skipped", messages: 0, reason: "cookie 失效" },
            { friendId: 2, name: "李四", status: "skipped", messages: 0, reason: "cookie 失效" },
          ],
        }),
      ],
    }),
  )
  expect(md).toContain("⏭️")
  expect(md).toContain("cookie 失效")
  expect(md).toContain("账号A")
})

test("成功与失败分块列出昵称并带原因", () => {
  const md = buildSummaryMarkdown(
    summary({
      totals: { success: 1, failed: 1, skipped: 0 },
      accounts: [
        account({
          friends: [
            { friendId: 1, name: "张三", status: "success", messages: 2, reason: null },
            { friendId: 2, name: "王五", status: "failed", messages: 0, reason: "发送超时" },
          ],
        }),
      ],
    }),
  )
  expect(md).toContain("✅")
  expect(md).toContain("张三")
  expect(md).toContain("❌")
  expect(md).toContain("王五（发送超时）")
})

test("超过 20 人折叠为「…等共 N 人」", () => {
  const friends = Array.from({ length: 25 }, (_, i) => ({
    friendId: i,
    name: `好友${i}`,
    status: "success" as const,
    messages: 1,
    reason: null,
  }))
  const md = buildSummaryMarkdown(
    summary({ totals: { success: 25, failed: 0, skipped: 0 }, accounts: [account({ friends })] }),
  )
  expect(md).toContain("…等共 25 人")
  expect(md).toContain("好友0")
  expect(md).not.toContain("好友24")
})

test("末尾合计行与输入计数一致", () => {
  const md = buildSummaryMarkdown(
    summary({
      totals: { success: 3, failed: 4, skipped: 5 },
      accounts: [
        account({
          friends: [
            { friendId: 1, name: "a", status: "success", messages: 1, reason: null },
            { friendId: 2, name: "b", status: "failed", messages: 0, reason: "x" },
            { friendId: 3, name: "c", status: "skipped", messages: 0, reason: "y" },
          ],
        }),
      ],
    }),
  )
  expect(md).toContain("成功 3")
  expect(md).toContain("失败 4")
  expect(md).toContain("跳过 5")
})

test("sendPushDeer 成功时返回 true 并按 markdown 提交", async () => {
  let body = ""
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (_input: unknown, init?: RequestInit) => {
    body = String(init?.body ?? "")
    return new Response(JSON.stringify({ code: 0 }), { status: 200 })
  }) as typeof fetch)
  expect(await sendPushDeer("key-1", "标题", "正文")).toBe(true)
  expect(body).toContain("type=markdown")
  expect(body).toContain("pushkey=key-1")
  spy.mockRestore()
})

test("sendPushDeer 返回 code!==0 时返回 false 且不抛", async () => {
  const spy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ code: 400 }), { status: 200 }) as Response,
  )
  expect(await sendPushDeer("key-1", "t", "d")).toBe(false)
  spy.mockRestore()
})

test("sendPushDeer 网络异常时返回 false 且不抛", async () => {
  const spy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"))
  expect(await sendPushDeer("key-1", "t", "d")).toBe(false)
  spy.mockRestore()
})

test("notifyRun 未配置 key 时不发起请求", async () => {
  const spy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}") as Response)
  await notifyRun(DEFAULT_SETTINGS, summary({ status: "success" }))
  expect(spy).not.toHaveBeenCalled()
  spy.mockRestore()
})

test("notifyRun 按 notifyOnRun / notifyOnAbort 开关决定是否发送", async () => {
  const s = { ...DEFAULT_SETTINGS, pushdeerKey: "key-1", notifyOnRun: false, notifyOnAbort: true }
  const off = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}") as Response)
  await notifyRun(s, summary({ status: "success" }))
  expect(off).not.toHaveBeenCalled()
  await notifyRun(s, summary({ status: "aborted" }))
  expect(off).toHaveBeenCalledTimes(1)
  off.mockRestore()
})
