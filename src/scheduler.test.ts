import "./testhelper"
import { test, expect } from "bun:test"
import { DEFAULT_SETTINGS } from "./config"
import type { RuntimeSettings } from "./types"
import { computeNextRunAt } from "./scheduler"

const S: RuntimeSettings = {
  ...DEFAULT_SETTINGS,
  schedule: { startHour: 8, startMinute: 0, endHour: 10, endMinute: 0 },
}

const at = (h: number, m: number) => new Date(2026, 9, 3, h, m, 0, 0)

function within(next: Date, from: Date, to: Date): boolean {
  return next.getTime() >= from.getTime() && next.getTime() <= to.getTime()
}

test("窗口开始前 → 今日窗口内", () => {
  const now = at(7, 0)
  for (let i = 0; i < 50; i++) {
    expect(within(computeNextRunAt(S, now), at(8, 0), at(10, 0))).toBe(true)
  }
})

test("窗口进行中 → 剩余窗口内", () => {
  const now = at(9, 0)
  for (let i = 0; i < 50; i++) {
    expect(within(computeNextRunAt(S, now), at(9, 0), at(10, 0))).toBe(true)
  }
})

test("窗口已过 → 次日窗口内", () => {
  const now = at(11, 0)
  for (let i = 0; i < 50; i++) {
    const next = computeNextRunAt(S, now)
    expect(next.getDate()).toBe(4)
    expect(within(next, new Date(2026, 9, 4, 8, 0), new Date(2026, 9, 4, 10, 0))).toBe(true)
  }
})

test("跨零点窗口不会被当成已过", () => {
  const night: RuntimeSettings = {
    ...S,
    schedule: { startHour: 23, startMinute: 0, endHour: 1, endMinute: 0 },
  }
  const now = at(20, 0)
  for (let i = 0; i < 50; i++) {
    const next = computeNextRunAt(night, now)
    expect(within(next, at(23, 0), new Date(2026, 9, 4, 1, 0))).toBe(true)
  }
})

test("结果始终晚于当前时间", () => {
  const now = at(8, 30)
  for (let i = 0; i < 50; i++) {
    expect(computeNextRunAt(S, now).getTime()).toBeGreaterThan(now.getTime())
  }
})
