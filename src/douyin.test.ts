import { test, expect } from "bun:test"
import { findConversationIndex, matchName } from "./douyin"

test("备注精确匹配", () => {
  expect(matchName("张三\n昨天 12:00\n在干嘛", "张三")).toBe(true)
  expect(matchName("李四", "李四")).toBe(true)
})

test("子串不算命中（张三不匹配张三丰）", () => {
  expect(matchName("张三丰", "张三")).toBe(false)
  expect(matchName("  张三  ", "张三")).toBe(true)
})

test("空行与多余空白的会话项不误命中", () => {
  expect(matchName("\n\n  王五\n消息", "王五")).toBe(true)
  expect(matchName("", "王五")).toBe(false)
})

test("findConversationIndex 返回命中下标，未命中为 -1", () => {
  const texts = ["张一\n你好", "张三\n在吗", "李四\n晚点聊"]
  expect(findConversationIndex(texts, "张三")).toBe(1)
  expect(findConversationIndex(texts, "赵六")).toBe(-1)
  expect(findConversationIndex([], "张三")).toBe(-1)
})
