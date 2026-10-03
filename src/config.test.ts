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

test("loadRunConfig 只聚合启用账号并挂上全局文案池", () => {
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
  expect(cfg.accounts[0]!.messages).toContain("全局文案")
  expect(cfg.accounts[0]!.messages).toContain("账号专属")
})

test("loadSettings 对损坏数据回落默认", () => {
  repo.setSetting("perFriendMessages", "{oops")
  repo.setSetting("dryRun", '"not-a-bool"')
  const s = config.loadSettings()
  expect(s.perFriendMessages).toEqual(config.DEFAULT_SETTINGS.perFriendMessages)
  expect(s.dryRun).toBe(config.DEFAULT_SETTINGS.dryRun)
})

test("loadSettings 对损坏 schedule 逐字段回落默认", () => {
  repo.setSetting("schedule", { startHour: "x", startMinute: 99, endHour: null, endMinute: -1 })
  expect(config.loadSettings().schedule).toEqual(config.DEFAULT_SETTINGS.schedule)
})

test("saveSettings / loadSettings 往返", () => {
  const s = config.loadSettings()
  s.perFriendMessages = [2, 4]
  s.gapBetweenFriendsMs = [1000, 2000]
  s.dryRun = false
  s.limits.retryPerFriend = 7
  config.saveSettings(s)
  const back = config.loadSettings()
  expect(back.perFriendMessages).toEqual([2, 4])
  expect(back.gapBetweenFriendsMs).toEqual([1000, 2000])
  expect(back.dryRun).toBe(false)
  expect(back.limits.retryPerFriend).toBe(7)
})

test("updateAccount 可改别名且不影响其它账号", () => {
  const id = createAccount({ alias: "before" })
  updateAccount(id, { alias: "after" })
  expect(repo.getAccount(id)!.alias).toBe("after")
})
