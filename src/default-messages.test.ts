import { test, expect } from "bun:test"
import { DEFAULT_MESSAGES } from "./default-messages"

test("默认全局池无空串、无重复，两批合计去重后 198 条", () => {
  expect(DEFAULT_MESSAGES).toHaveLength(198)
  expect(DEFAULT_MESSAGES.every((t) => t.trim().length > 0)).toBe(true)
  expect(new Set(DEFAULT_MESSAGES).size).toBe(198)
})

test("第二批自身重复的两条只保留一条", () => {
  // 用户粘贴的第二批里这两条各出现两次，导出去重后应只剩一次
  for (const t of ["老铁，出来透气🌬️", "兄弟，出来整两句💬"]) {
    expect(DEFAULT_MESSAGES.filter((x) => x === t)).toHaveLength(1)
  }
})

test("两批交错混排：奇数位是第一批、偶数位是第二批", () => {
  // 交错是用户"插混进去"的要求；0/2/4... 下标出自第一批（长句），
  // 1/3/5... 下标出自第二批（短称呼开头）。防的是两批在文件里各自堆到一起
  const odd = DEFAULT_MESSAGES.filter((_, i) => i % 2 === 0)
  const even = DEFAULT_MESSAGES.filter((_, i) => i % 2 === 1)
  expect(odd.length).toBeGreaterThan(0)
  expect(even.length).toBeGreaterThan(0)
  const avg = (xs: string[]) => xs.reduce((s, t) => s + t.length, 0) / xs.length
  expect(avg(odd)).toBeGreaterThan(avg(even))
  expect(DEFAULT_MESSAGES[0]).toBe("碳基生物，又上线了？🫧")
  expect(DEFAULT_MESSAGES[1]).toBe("宝贝嘛呢？💬")
  expect(DEFAULT_MESSAGES[197]).toBe("铁子，出来续火花✊🔥")
})
