import { test, expect, beforeEach } from "bun:test"
import { db, repo, reset } from "./testhelper"
import { seedDefaults } from "./seed"
import { DEFAULT_MESSAGES } from "./default-messages"

const { listMessages, listAccounts, listFriends, getSetting } = repo

beforeEach(reset)

test("空库 seed 写入默认设置、198 条全局文案与示例账号好友", () => {
  const result = seedDefaults()
  expect(result).toEqual({ settings: true, messages: DEFAULT_MESSAGES.length, sampleAccount: true })

  expect(getSetting("timezone")).not.toBeNull()
  const global = listMessages(null)
  expect(global).toHaveLength(DEFAULT_MESSAGES.length)
  expect(global.every((m) => m.account_id === null)).toBe(true)
  expect(global.map((m) => m.text).sort()).toEqual([...DEFAULT_MESSAGES].sort())

  const accounts = listAccounts()
  expect(accounts).toHaveLength(1)
  expect(listFriends(accounts[0]!.id).map((f) => f.name)).toEqual(["好友A", "好友B", "好友C"])
})

test("已有数据的库 seed 是空转", () => {
  seedDefaults()
  const before = { messages: listMessages(), accounts: listAccounts() }

  expect(seedDefaults()).toEqual({ settings: false, messages: 0, sampleAccount: false })
  expect(listMessages().map((m) => m.text)).toEqual(before.messages.map((m) => m.text))
  expect(listAccounts()).toEqual(before.accounts)
})

test("文案被清空但账号还在时只补文案，不重复建账号", () => {
  seedDefaults()
  const account = listAccounts()[0]!
  db.exec("DELETE FROM messages")

  expect(seedDefaults()).toEqual({ settings: false, messages: DEFAULT_MESSAGES.length, sampleAccount: false })
  expect(listMessages(null)).toHaveLength(DEFAULT_MESSAGES.length)
  expect(listAccounts()).toHaveLength(1)
  expect(listFriends(account.id)).toHaveLength(3)
})
