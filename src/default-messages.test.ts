import { test, expect } from "bun:test"
import { DEFAULT_MESSAGES } from "./default-messages"

/** 只允许 emoji 图形本体、VS16 变体选择符和 ZWJ 连接符；文字、数字、标点混入都算不纯 */
const PURE_EMOJI = /^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u

test("默认全局池无空串、无重复，共 198 条", () => {
  expect(DEFAULT_MESSAGES).toHaveLength(198)
  expect(DEFAULT_MESSAGES.every((t) => t.length > 0)).toBe(true)
  expect(new Set(DEFAULT_MESSAGES).size).toBe(198)
})

test("默认全局池全是纯 emoji：无文字、无标点", () => {
  const impure = DEFAULT_MESSAGES.filter((t) => !PURE_EMOJI.test(t))
  expect(impure).toEqual([])
})
