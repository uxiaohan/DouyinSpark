import { test, expect, beforeEach } from "bun:test"
import { db, repo, reset } from "./testhelper"

const {
  createAccount,
  createFriend,
  createMessage,
  listMessages,
  listAccounts,
  deleteAccount,
  createRun,
  finishRun,
  addRunItem,
  listRunItems,
  listRuns,
  listFriends,
  countTodaySuccess,
  saveSession,
  getSession,
  deleteSession,
  touchAccountRun,
} = repo

beforeEach(reset)

test("listMessages(null) 只返回全局文案，数字只返回该账号，undefined 返回全部", () => {
  const id = createAccount({ alias: "a" })
  createMessage(null, "全局")
  createMessage(id, "专属")
  expect(listMessages(null).map((m) => m.text)).toEqual(["全局"])
  expect(listMessages(id).map((m) => m.text)).toEqual(["专属"])
  expect(listMessages().map((m) => m.text).sort()).toEqual(["全局", "专属"].sort())
})

test("删除账号级联删除其好友与文案", () => {
  const id = createAccount({ alias: "a" })
  createFriend(id, "好友")
  createMessage(id, "文案")
  deleteAccount(id)
  expect(listFriends(id)).toEqual([])
  expect(listMessages(id)).toEqual([])
})

test("countTodaySuccess 只统计当天 success", () => {
  const id = createAccount({ alias: "a" })
  const runId = createRun("manual")
  addRunItem({ run_id: runId, account_id: id, friend_id: null, friend_name: "ok", status: "success", messages: 2, reason: null })
  addRunItem({ run_id: runId, account_id: id, friend_id: null, friend_name: "bad", status: "failed", messages: 0, reason: "x" })
  addRunItem({ run_id: runId, account_id: id, friend_id: null, friend_name: "skip", status: "skipped", messages: 0, reason: "y" })
  expect(countTodaySuccess(id)).toBe(1)

  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  db.query("UPDATE run_items SET created_at = ? WHERE friend_name = 'ok'").run(yesterday)
  expect(countTodaySuccess(id)).toBe(0)
})

test("finishRun 落库状态与汇总", () => {
  const runId = createRun("schedule")
  addRunItem({ run_id: runId, account_id: null, friend_id: null, friend_name: "A", status: "success", messages: 1, reason: null })
  finishRun(runId, "success", { ok: true })
  const runs = listRuns(10)
  expect(runs[0]!.status).toBe("success")
  expect(runs[0]!.finished_at).not.toBeNull()
  expect(listRunItems(runId).length).toBe(1)
})

test("listAccounts(onlyEnabled) 过滤禁用账号", () => {
  createAccount({ alias: "on" })
  createAccount({ alias: "off", enabled: 0 })
  expect(listAccounts().length).toBe(2)
  expect(listAccounts(true).map((a) => a.alias)).toEqual(["on"])
})

test("touchAccountRun 更新时间戳", () => {
  const id = createAccount({ alias: "a" })
  touchAccountRun(id)
  expect(repo.getAccount(id)!.last_run_at).not.toBeNull()
})

test("session 存取与删除", () => {
  saveSession("tok-1", "2099-01-01T00:00:00.000Z")
  expect(getSession("tok-1")?.token).toBe("tok-1")
  deleteSession("tok-1")
  expect(getSession("tok-1")).toBeNull()
})
