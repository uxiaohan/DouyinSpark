import { test, expect } from "bun:test"
import { randInt, randMs, sampleN, shuffle } from "./util"

test("randInt 在闭区间内", () => {
  for (let i = 0; i < 200; i++) {
    const v = randInt(5, 10)
    expect(v).toBeGreaterThanOrEqual(5)
    expect(v).toBeLessThanOrEqual(10)
  }
})

test("randMs 在区间内且整数", () => {
  const [lo, hi] = [500, 1500]
  for (let i = 0; i < 200; i++) {
    const v = randMs([lo, hi])
    expect(Number.isInteger(v)).toBe(true)
    expect(v).toBeGreaterThanOrEqual(lo)
    expect(v).toBeLessThanOrEqual(hi)
  }
})

test("sampleN 去重且不超长度", () => {
  const a = [1, 2, 3]
  expect(sampleN(a, 5, true).length).toBe(3)
  expect(new Set(sampleN(a, 3, true)).size).toBe(3)
})

test("shuffle 不丢元素", () => {
  const a = [1, 2, 3, 4]
  expect(shuffle(a).sort()).toEqual([1, 2, 3, 4])
})
