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
  reapStaleRuns,
  addRunItem,
  listRunItems,
  listRuns,
  listFriends,
  findFriendByName,
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

// 回归：进程被硬杀/崩溃时 finishRun 来不及跑，runs 里留下永远"进行中"的行，
// 界面里阴魂不散（2026-10-04 仪表盘"最近运行"显示的僵尸 run 31）。启动时收尾。
test("reapStaleRuns 把残留的 running 行收尾为 aborted 并写结束时间", () => {
  createRun("schedule")
  expect(listRuns(1)[0]!.status).toBe("running")
  expect(reapStaleRuns()).toBe(1)
  const row = listRuns(1)[0]!
  expect(row.status).toBe("aborted")
  expect(row.finished_at).not.toBeNull()
  // 已收尾的行不会被二次处理
  expect(reapStaleRuns()).toBe(0)
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
  expect(listAccounts().find((a) => a.id === id)!.last_run_at).not.toBeNull()
})

test("session 存取与删除", () => {
  saveSession("tok-1", "2099-01-01T00:00:00.000Z")
  expect(getSession("tok-1")?.token).toBe("tok-1")
  deleteSession("tok-1")
  expect(getSession("tok-1")).toBeNull()
})

// 回归：从抖音复制来的昵称带着 NBSP（U+00A0，页面渲染用的就是它，实测码 160）
// 或全角空格，原来入库只 trim()，原样存进去——控制台看着是普通空格，字符码却不是。
// 库里只存人打得出来的形态；页面那边的形态由 douyin.ts 匹配时归一兜住，两边各管一边。
test("createFriend 入库前把空白折叠成普通空格", () => {
  const id = createAccount({ alias: "a" })
  createFriend(id, "小明\u00A0阿花")
  createFriend(id, "  全角\u3000空格  ")
  expect(listFriends(id).map((f) => f.name)).toEqual(["小明 阿花", "全角 空格"])
})

// 添加好友查重用：折叠空白后比较——从抖音复制来的 NBSP 和手打的普通空格必须算
// 同一个好友，否则查重形同虚设；不同账号可以有同名好友（各是各的抖音号）。
test("findFriendByName 折叠空白后按账号查重", () => {
  const a = createAccount({ alias: "a" })
  const b = createAccount({ alias: "b" })
  const fid = createFriend(a, "小明 阿花")
  expect(findFriendByName(a, "小明\u00A0阿花")?.id).toBe(fid)
  expect(findFriendByName(a, "  小明   阿花  ")?.id).toBe(fid)
  expect(findFriendByName(a, "别人")).toBeNull()
  createFriend(b, "小明 阿花")
  expect(findFriendByName(b, "小明 阿花")?.id).not.toBe(fid)
})
