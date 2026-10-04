import { test, expect } from "bun:test"
import { randInt, randMs, shuffle } from "./util"

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

test("shuffle 不丢元素", () => {
  const a = [1, 2, 3, 4]
  expect(shuffle(a).sort()).toEqual([1, 2, 3, 4])
})
