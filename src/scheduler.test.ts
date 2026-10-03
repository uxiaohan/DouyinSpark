import "./testhelper"
import { test, expect, beforeEach } from "bun:test"
import { DEFAULT_SETTINGS } from "./config"
import type { RuntimeSettings } from "./types"
import { computeNextRunAt, getNextRunAt, interruptibleSleep, planNextRun, resetNextRun, schedulerLoop, wakeScheduler, windowEnd } from "./scheduler"
import type { SchedulerDeps } from "./scheduler"

const S: RuntimeSettings = {
  ...DEFAULT_SETTINGS,
  schedule: { startHour: 8, startMinute: 0, endHour: 10, endMinute: 0 },
}

const at = (h: number, m: number) => new Date(2026, 9, 3, h, m, 0, 0)

beforeEach(() => resetNextRun())

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

// 回归：开始 == 结束时旧实现用 end <= start 把它判成跨零点，end 被推到次日，
// 零长窗口悄悄变成 24 小时窗口、在全程均匀随机取点。实测 2026-10-04：
// 用户设 01:04-01:04，保存后"下次运行"排到约 9 小时后的 09:56，而不是次日 01:04。
// 零长窗口的语义是"每天到点就跑"，必须精确落在开始时刻。
test("零长窗口（开始 == 结束）：开始前 → 今日开始时刻", () => {
  const dot: RuntimeSettings = { ...S, schedule: { startHour: 8, startMinute: 0, endHour: 8, endMinute: 0 } }
  for (let i = 0; i < 20; i++) {
    expect(computeNextRunAt(dot, at(7, 0)).getTime()).toBe(at(8, 0).getTime())
  }
})

test("零长窗口：开始后 → 次日同一时刻", () => {
  const dot: RuntimeSettings = { ...S, schedule: { startHour: 8, startMinute: 0, endHour: 8, endMinute: 0 } }
  for (let i = 0; i < 20; i++) {
    expect(computeNextRunAt(dot, at(8, 30)).getTime()).toBe(new Date(2026, 9, 4, 8, 0).getTime())
  }
})

test("零长窗口跑完一轮后排到次日同一时刻，不会连跑", () => {
  const dot: RuntimeSettings = { ...S, schedule: { startHour: 20, startMinute: 0, endHour: 20, endMinute: 0 } }
  const runAt = at(20, 0) // 到点触发
  // windowEnd 对零长窗口就是开始时刻本身；它作为 after 不应把下一轮推更远
  const over = windowEnd(dot, runAt)
  expect(over.getTime()).toBe(at(20, 0).getTime())
  const next = computeNextRunAt(dot, runAt, over)
  expect(next.getTime()).toBeGreaterThanOrEqual(over.getTime())
  expect(next.getTime()).toBe(new Date(2026, 9, 4, 20, 0).getTime())
})

test("结果始终晚于当前时间", () => {
  const now = at(8, 30)
  for (let i = 0; i < 50; i++) {
    expect(computeNextRunAt(S, now).getTime()).toBeGreaterThan(now.getTime())
  }
})

test("调度未启动时没有下次运行时间", () => {
  expect(getNextRunAt()).toBeNull()
})

// 回归：/api/next-run 原来是每次请求都重新 computeNextRunAt()，窗口内是 Math.random()
// 取点，所以刷新一次页面数字就变一次，和调度真正采用的时间对不上——界面在骗人。
test("planNextRun 之后时间固定，不再随每次读取重新随机", () => {
  const now = at(7, 0)
  const planned = planNextRun(S, now)
  expect(getNextRunAt()?.getTime()).toBe(planned.getTime())
  // 反复读取必须是同一个值
  for (let i = 0; i < 10; i++) {
    expect(getNextRunAt()?.getTime()).toBe(planned.getTime())
  }
})

test("planNextRun 取点仍落在窗口内", () => {
  for (let i = 0; i < 20; i++) {
    resetNextRun()
    const planned = planNextRun(S, at(7, 0))
    expect(within(planned, at(8, 0), at(10, 0))).toBe(true)
  }
})

test("planNextRun 的返回值与 getNextRunAt 一致（调度按它 sleep）", () => {
  const planned = planNextRun(S, at(9, 30))
  expect(getNextRunAt()?.getTime()).toBe(planned.getTime())
  expect(within(planned, at(9, 30), at(10, 0))).toBe(true)
})

// 回归：跑完一批后如果时刻仍落在同一个窗口内，旧实现会立刻在剩余窗口里再取一个点，
// 于是同一窗口连跑多轮。实测：窗口 20:00-20:03，run 在 20:02:39 触发、20:02:58 结束，
// 调度器随即排了 20:02:59 的第二轮。计划的语义是"每天在随机时刻"，一天一轮。
test("跑完一轮后避开同一窗口，排到之后的窗口", () => {
  const night: RuntimeSettings = { ...S, schedule: { startHour: 20, startMinute: 0, endHour: 20, endMinute: 3 } }
  const runAt = at(20, 2) // 20:02 触发
  const windowOver = new Date(2026, 9, 3, 20, 3, 0, 0) // 20:03 窗口结束
  const next = computeNextRunAt(night, runAt, windowOver)
  expect(next.getTime()).toBeGreaterThanOrEqual(windowOver.getTime())
  // 必须落到次日窗口，而不是今天 20:02:5x
  expect(next.getDate()).toBe(4)
  expect(within(next, new Date(2026, 9, 4, 20, 0), new Date(2026, 9, 4, 20, 3))).toBe(true)
})

test("after 早于当前时间时不改变取点结果", () => {
  const now = at(7, 0)
  const past = at(6, 0)
  expect(within(computeNextRunAt(S, now, past), at(8, 0), at(10, 0))).toBe(true)
})

test("跨零点窗口跑完后也排到次日窗口", () => {
  const night: RuntimeSettings = { ...S, schedule: { startHour: 23, startMinute: 0, endHour: 1, endMinute: 0 } }
  const runAt = new Date(2026, 9, 3, 23, 30, 0, 0)
  const windowOver = new Date(2026, 9, 4, 1, 0, 0, 0)
  const next = computeNextRunAt(night, runAt, windowOver)
  expect(next.getTime()).toBeGreaterThanOrEqual(windowOver.getTime())
  expect(within(next, new Date(2026, 9, 4, 23, 0), new Date(2026, 9, 5, 1, 0))).toBe(true)
})

// 回归：startScheduler 原来只在跑完后"登记"顺延时间，循环顶上又用 now 重取一个点，
// 把登记覆盖掉，于是同一窗口内连跑多轮。实测 2026-10-03：20:00-20:03 窗口
// run 13(20:02:39)→run 14(20:02:59)；20:06-20:10 窗口 run 15(20:09:01)→run 16(20:09:59)。
// 连跑多轮同窗口就是一天给好友发两条。computeNextRunAt 的
// after 参数早就有对应用例，缺的是把循环本身的接线钉住。
test("循环跑完一批后不会把下一轮排进同一个窗口", async () => {
  const S2: RuntimeSettings = { ...S, schedule: { startHour: 20, startMinute: 0, endHour: 20, endMinute: 3 } }
  let now = new Date(2026, 9, 3, 20, 0, 30).getTime()
  const planned: Date[] = []
  let sleeps = 0
  let runs = 0
  class Stop extends Error {}
  // 假运行不推进时钟：这样断言才和 Math.random 取到哪个点无关
  await expect(
    schedulerLoop({
      now: () => now,
      sleep: async (ms: number) => {
        const at = getNextRunAt()
        if (at) planned.push(at)
        now += ms
        if (++sleeps >= 2) throw new Stop()
      },
      run: async () => {
        runs++
      },
      loadSettings: () => S2,
    } satisfies SchedulerDeps),
  ).rejects.toThrow(Stop)
  expect(runs).toBe(1) // 只跑了一批就停，第二轮的 sleep 前就抛出
  expect(planned).toHaveLength(2)
  // 第二轮必须排到次日窗口，而不是今天 20:0x——那正是线上连跑两轮的形状
  expect(planned[1]!.getDate()).toBe(4)
  expect(within(planned[1]!, new Date(2026, 9, 4, 20, 0), new Date(2026, 9, 4, 20, 3))).toBe(true)
})

// 保存设置后 PUT /api/settings 调 wakeScheduler 打断睡眠；定时到点是 false。
// 唤醒的意义：循环正睡在旧区间算出的时长上，不打断的话新区间要等这一觉
// 睡完再跑一批才生效（那时用户改的时间早过了）。
test("interruptibleSleep 被 wakeScheduler 提前结束返回 true，不等满时长", async () => {
  const t0 = Date.now()
  const slept = interruptibleSleep(60_000)
  // ack 要等调度循环重排后才触发，本用例不起循环，不等 wakeScheduler 的 promise
  void wakeScheduler()
  expect(await slept).toBe(true)
  expect(Date.now() - t0).toBeLessThan(5_000) // 不是真等了 60s
})

test("wakeScheduler 在没有睡眠时是安全的空调用", async () => {
  expect(await wakeScheduler()).toBe(false)
})

// 打断睡眠 ≠ 到点：唤醒那一轮必须回到循环顶部按最新 settings 重排，
// 绝不运行。否则用户每次改时间区间都会立刻触发一次运行。
test("循环被唤醒后不运行，按最新 settings 重排下一轮", async () => {
  const late: RuntimeSettings = { ...S, schedule: { startHour: 22, startMinute: 0, endHour: 23, endMinute: 30 } }
  let reads = 0
  // 第一轮读旧区间，唤醒后的第二轮读到的是刚保存的新区间
  const loadSettings = () => (++reads === 1 ? S : late)
  const planned: Date[] = []
  let sleeps = 0
  let runs = 0
  class Stop extends Error {}
  await expect(
    schedulerLoop({
      now: () => new Date(2026, 9, 3, 21, 0, 0, 0).getTime(), // 21:00，旧区间 8-10 早过了
      sleep: async () => {
        const at = getNextRunAt()
        if (at) planned.push(at)
        // 第一次睡眠模拟被 wakeScheduler 打断；第二次到点前抛 Stop 收尾
        if (++sleeps === 1) return true
        throw new Stop()
      },
      run: async () => {
        runs++
      },
      loadSettings,
    } satisfies SchedulerDeps),
  ).rejects.toThrow(Stop)
  expect(runs).toBe(0) // 唤醒那一轮绝不运行
  expect(planned).toHaveLength(2)
  // 第一轮排旧区间（次日 8-10），唤醒后重排到新区间（今晚 22-23:30）
  expect(planned[0]!.getDate()).toBe(4)
  expect(within(planned[1]!, at(22, 0), at(23, 30))).toBe(true)
})
