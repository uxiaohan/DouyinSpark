import { loadSettings } from "./config"
import { log } from "./logger"
import { runOnce } from "./runner"
import type { RuntimeSettings } from "./types"
import { sleep } from "./util"

/**
 * 在 [schedule.start, schedule.end] 内取随机点；当前晚于 end 则顺延次日。
 * now 可注入，便于测试。
 * after：取点结果的硬下界。跑完一批后传"刚过去那个窗口的结束时刻"，
 * 避免同一窗口内连跑多轮（见 startScheduler 里的用法）。
 */
export function computeNextRunAt(settings: RuntimeSettings, now = new Date(), after?: Date): Date {
  // after 晚于 now 时以它为起点重算：等价于"从这一轮窗口结束之后开始找下一个点"
  const from = after && after.getTime() > now.getTime() ? after : now
  const { startHour, startMinute, endHour, endMinute } = settings.schedule
  const start = new Date(from)
  start.setHours(startHour, startMinute, 0, 0)
  const end = new Date(from)
  end.setHours(endHour, endMinute, 0, 0)
  // 结束早于开始 = 跨零点窗口，end 落到次日
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1)

  const lo = from.getTime() < start.getTime() ? start.getTime() : from.getTime()
  if (lo < end.getTime()) return new Date(lo + Math.random() * (end.getTime() - lo))

  // 今日窗口已过 → 次日窗口
  const nextStart = new Date(start)
  nextStart.setDate(nextStart.getDate() + 1)
  const nextEnd = new Date(end)
  nextEnd.setDate(nextEnd.getDate() + 1)
  return new Date(nextStart.getTime() + Math.random() * (nextEnd.getTime() - nextStart.getTime()))
}

/**
 * 本轮调度实际采用的时间。只有 planNextRun 会写它，
 * startScheduler 按它 sleep，/api/next-run 也读它——调度和界面共用同一份真相。
 */
let nextRunAt: Date | null = null

export function getNextRunAt(): Date | null {
  return nextRunAt
}

/** 仅测试用：清掉登记状态，避免用例间互相污染 */
export function resetNextRun(): void {
  nextRunAt = null
}

/** 取下一个运行点并登记；返回值就是 startScheduler 要 sleep 到的时刻 */
export function planNextRun(settings: RuntimeSettings, now = new Date(), after?: Date): Date {
  nextRunAt = computeNextRunAt(settings, now, after)
  return nextRunAt
}

/** 包含 from 的那个调度窗口的结束时刻；跨零点时落到次日 */
export function windowEnd(settings: RuntimeSettings, from = new Date()): Date {
  const { startHour, startMinute, endHour, endMinute } = settings.schedule
  const start = new Date(from)
  start.setHours(startHour, startMinute, 0, 0)
  const end = new Date(from)
  end.setHours(endHour, endMinute, 0, 0)
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1)
  return end
}

/** 调度循环依赖：生产环境用默认实现，测试注入假时钟/假跑批驱动它 */
export interface SchedulerDeps {
  now: () => number
  sleep: (ms: number) => Promise<void>
  /** 跑一批；返回值 discarded，跑批结果由 runner 自己落库 */
  run: () => Promise<unknown>
  loadSettings: () => RuntimeSettings
}

const prodDeps: SchedulerDeps = {
  now: () => Date.now(),
  sleep,
  run: () => runOnce("schedule"),
  loadSettings,
}

export async function startScheduler(): Promise<never> {
  return schedulerLoop(prodDeps)
}

export async function schedulerLoop(deps: SchedulerDeps): Promise<never> {
  // after：跑完一批后下一轮取点的硬下界——刚过去那个窗口的结束时刻。
  // 它必须由循环顶上带进 planNextRun。曾经只在这里登记一下，loop 顶部又用 now
  // 重取一个点把登记覆盖掉，同一窗口连跑多轮（2026-10-03 实测两组，见回归用例）。
  let after: Date | undefined
  for (;;) {
    const settings = deps.loadSettings()
    const next = planNextRun(settings, new Date(deps.now()), after)
    after = undefined
    log.info("scheduler: 下次运行", { at: next.toISOString() })
    await deps.sleep(Math.max(0, next.getTime() - deps.now()))
    try {
      await deps.run()
    } catch (err) {
      log.error("跑批失败，等待下一轮", { err: String(err) })
    }
    // 跑完就避开刚过去那个窗口；窗口已过（这批跑跨过了结束时刻）则不设下界，正常找下一天
    const over = windowEnd(settings, new Date(deps.now()))
    if (over.getTime() > deps.now()) {
      after = over
      log.info("scheduler: 本轮窗口未结束，顺延到下一轮", { after: over.toISOString() })
    }
  }
}
