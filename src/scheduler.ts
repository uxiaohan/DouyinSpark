import { loadSettings } from "./config"
import { log } from "./logger"
import { runInChild } from "./run-child"
import type { RuntimeSettings } from "./types"

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
  // 合法配置的开始/结束永远是同一天的两个时刻（否则控制台和后端都拒绝保存），
  // 这里只在有人手改数据库时兜底：结束早于开始就把 end 落到次日，别算出过去的时间。
  // 相等不算——零长窗口（start == end）语义是"每天到点就跑"，
  // 曾被 <= 当成跨零点把 end 推到次日，窗口悄悄变成 24 小时、随机取点。
  if (end.getTime() < start.getTime()) end.setDate(end.getDate() + 1)

  const lo = from.getTime() < start.getTime() ? start.getTime() : from.getTime()
  if (lo < end.getTime()) return new Date(lo + Math.random() * (end.getTime() - lo))
  // 零长窗口：开始时刻还没到就今天到点跑；已经开始/已过则顺延次日同刻
  if (start.getTime() === end.getTime() && start.getTime() > from.getTime()) return new Date(start.getTime())

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

/** 睡眠中挂在这里的提前结束钩子；wakeScheduler() 调它打断睡眠 */
let wakeSleep: (() => void) | null = null

/** 唤醒方等待的应答：循环重排并登记完成后触发 */
let ackWake: (() => void) | null = null

/**
 * 可中断睡眠：ms 到点 resolve(false)，被 wakeScheduler() 提前结束 resolve(true)。
 * 保存设置后必须唤醒循环——它原本睡在旧 settings 算出的时长上，
 * 新区间要等这一觉睡完再跑一批才生效。
 */
export function interruptibleSleep(ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const onTimeout = () => {
      wakeSleep = null
      resolve(false)
    }
    const onWake = () => {
      clearTimeout(timer)
      wakeSleep = null
      resolve(true)
    }
    const timer = setTimeout(onTimeout, ms)
    wakeSleep = onWake
  })
}

/**
 * 保存设置后由 web 层调用：打断循环当前的睡眠，并等它按最新 settings
 * 重排完再返回。ack 保证调用方随后读到的 getNextRunAt() 就是新区间
 * 取的点；没在睡（--web-only 或正在运行）时直接 resolve(false)，无副作用。
 */
export function wakeScheduler(): Promise<boolean> {
  if (!wakeSleep) return Promise.resolve(false)
  const done = wakeSleep
  wakeSleep = null
  return new Promise<boolean>((resolve) => {
    ackWake = () => {
      ackWake = null
      resolve(true)
    }
    done()
  })
}

/** 包含 from 的那个调度窗口的结束时刻；同一天内不滚动（手改库的非法区间才落到次日兜底） */
export function windowEnd(settings: RuntimeSettings, from = new Date()): Date {
  const { startHour, startMinute, endHour, endMinute } = settings.schedule
  const start = new Date(from)
  start.setHours(startHour, startMinute, 0, 0)
  const end = new Date(from)
  end.setHours(endHour, endMinute, 0, 0)
  if (end.getTime() < start.getTime()) end.setDate(end.getDate() + 1)
  return end
}

/** 调度循环依赖：生产环境用默认实现，测试注入假时钟/假运行驱动它 */
export interface SchedulerDeps {
  now: () => number
  /** 睡到返回 false；被 wakeScheduler 提前结束返回 true（调用方据此重排而非运行） */
  sleep: (ms: number) => Promise<unknown>
  /** 跑一批；返回值 discarded，运行结果由子进程自己落库 */
  run: () => Promise<unknown>
  loadSettings: () => RuntimeSettings
}

const prodDeps: SchedulerDeps = {
  now: () => Date.now(),
  sleep: interruptibleSleep,
  // web-server 模式不自己 import playwright（Bun 的 ESM 缓存一导就永久常驻
  // ~65MB，控制台一天 23 小时空跑不能替这 1 小时付内存），整批丢给子进程跑
  run: () => runInChild("schedule"),
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
    // 唤醒方（PUT /api/settings）等的就是这次重排登记完成
    ackWake?.()
    after = undefined
    log.info("scheduler: 下次运行", { at: next.toISOString() })
    // 被 wakeScheduler 提前结束 = 设置刚保存过：回到顶部按最新 settings 重排，
    // 不当成到点。ack 待顶部那次 planNextRun 登记后才触发，PUT 读到的即最终值。
    if (await deps.sleep(Math.max(0, next.getTime() - deps.now()))) continue
    try {
      await deps.run()
    } catch (err) {
      log.error("运行失败，等待下一轮", { err: String(err) })
    }
    // 跑完就避开刚过去那个窗口；窗口已过（这批跑跨过了结束时刻）则不设下界，正常找下一天
    const over = windowEnd(settings, new Date(deps.now()))
    if (over.getTime() > deps.now()) {
      after = over
      log.info("scheduler: 本轮窗口未结束，顺延到下一轮", { after: over.toISOString() })
    }
  }
}
