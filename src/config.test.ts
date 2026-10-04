import { test, expect, beforeEach } from "bun:test"
import { config, repo, reset } from "./testhelper"

const { parseCookies, loadRunConfig } = config
const { createAccount, createFriend, createMessage, updateAccount } = repo

beforeEach(reset)

test("parseCookies 缺 domain 时默认 .douyin.com", () => {
  const c = parseCookies(JSON.stringify([{ name: "sid", value: "v" }]))
  expect(c.length).toBe(1)
  expect(c[0]!.domain).toBe(".douyin.com")
  expect(c[0]!.path).toBe("/")
  expect(c[0]!.sameSite).toBe("Lax")
})

test("parseCookies 丢弃非 douyin 域", () => {
  const c = parseCookies(
    JSON.stringify([
      { name: "a", value: "1", domain: ".example.com" },
      { name: "b", value: "2", domain: ".douyin.com" },
      { name: "", value: "3", domain: ".douyin.com" },
    ]),
  )
  expect(c.map((x) => x.name)).toEqual(["b"])
})

test("parseCookies 非法 sameSite 回落 Lax", () => {
  const c = parseCookies(
    JSON.stringify([{ name: "a", value: "1", domain: ".douyin.com", sameSite: "Whatever" }]),
  )
  expect(c[0]!.sameSite).toBe("Lax")
})

test("parseCookies 非法 JSON 与 null 返回空数组", () => {
  expect(parseCookies("not json")).toEqual([])
  expect(parseCookies(null)).toEqual([])
  expect(parseCookies("[]")).toEqual([])
})

test("loadRunConfig 只聚合启用账号，专属文案与全局文案分池", () => {
  const on = createAccount({ alias: "on" })
  const off = createAccount({ alias: "off", enabled: 0 })
  createFriend(on, "好友A")
  createFriend(off, "好友B")
  createMessage(null, "全局文案")
  createMessage(on, "账号专属")

  const cfg = loadRunConfig()
  expect(cfg.accounts.length).toBe(1)
  expect(cfg.accounts[0]!.account.alias).toBe("on")
  expect(cfg.accounts[0]!.friends.map((f) => f.name)).toEqual(["好友A"])
  // 分池是"专属优先、全局兜底"的前提：合成一个池就会被全局淹没（用户实测踩过）
  expect(cfg.accounts[0]!.messages).toEqual(["账号专属"])
  expect(cfg.accounts[0]!.fallbackMessages).toEqual(["全局文案"])
})

test("loadSettings 对损坏数据回落默认", () => {
  repo.setSetting("gapBetweenFriendsMs", "{oops")
  const s = config.loadSettings()
  expect(s.gapBetweenFriendsMs).toEqual(config.DEFAULT_SETTINGS.gapBetweenFriendsMs)
})

test("loadSettings 对损坏 schedule 逐字段回落默认", () => {
  repo.setSetting("schedule", { startHour: "x", startMinute: 99, endHour: null, endMinute: -1 })
  expect(config.loadSettings().schedule).toEqual(config.DEFAULT_SETTINGS.schedule)
})

test("saveSettings / loadSettings 往返", () => {
  const s = config.loadSettings()
  s.gapBetweenFriendsMs = [1000, 2000]
  s.limits.retryPerFriend = 7
  config.saveSettings(s)
  const back = config.loadSettings()
  expect(back.gapBetweenFriendsMs).toEqual([1000, 2000])
  expect(back.limits.retryPerFriend).toBe(7)
})

test("validateSchedule 拒绝结束早于开始（跨零点窗口不可保存）", () => {
  // 用户实测误存过 0:16–0:13：computeNextRunAt 将其当成 24 小时窗口，下次运行跳到当晚
  expect(config.validateSchedule({ startHour: 0, startMinute: 16, endHour: 0, endMinute: 13 })).not.toBeNull()
  expect(config.validateSchedule({ startHour: 22, startMinute: 0, endHour: 6, endMinute: 0 })).not.toBeNull()
})

test("validateSchedule 允许结束等于开始", () => {
  expect(config.validateSchedule({ startHour: 8, startMinute: 30, endHour: 8, endMinute: 30 })).toBeNull()
  expect(config.validateSchedule({ startHour: 20, startMinute: 6, endHour: 20, endMinute: 10 })).toBeNull()
})

test("validateSchedule 拒绝越界与非整数钟点", () => {
  expect(config.validateSchedule({ startHour: 24, startMinute: 0, endHour: 23, endMinute: 0 })).not.toBeNull()
  expect(config.validateSchedule({ startHour: 8, startMinute: 60, endHour: 9, endMinute: 0 })).not.toBeNull()
  expect(config.validateSchedule({ startHour: 8.5, startMinute: 0, endHour: 9, endMinute: 0 })).not.toBeNull()
})

test("updateAccount 可改别名且不影响其它账号", () => {
  const id = createAccount({ alias: "before" })
  updateAccount(id, { alias: "after" })
  expect(repo.getAccount(id)!.alias).toBe("after")
})
