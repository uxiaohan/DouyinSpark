import { loadSettings } from "./config"
import { log } from "./logger"
import { runOnce } from "./runner"
import type { RuntimeSettings } from "./types"
import { sleep } from "./util"

/**
 * 在 [schedule.start, schedule.end] 内取随机点；当前晚于 end 则顺延次日。
 * now 可注入，便于测试。
 */
export function computeNextRunAt(settings: RuntimeSettings, now = new Date()): Date {
  const { startHour, startMinute, endHour, endMinute } = settings.schedule
  const start = new Date(now)
  start.setHours(startHour, startMinute, 0, 0)
  const end = new Date(now)
  end.setHours(endHour, endMinute, 0, 0)
  // 结束早于开始 = 跨零点窗口，end 落到次日
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1)

  const lo = now.getTime() < start.getTime() ? start.getTime() : now.getTime()
  if (lo < end.getTime()) return new Date(lo + Math.random() * (end.getTime() - lo))

  // 今日窗口已过 → 次日窗口
  const nextStart = new Date(start)
  nextStart.setDate(nextStart.getDate() + 1)
  const nextEnd = new Date(end)
  nextEnd.setDate(nextEnd.getDate() + 1)
  return new Date(nextStart.getTime() + Math.random() * (nextEnd.getTime() - nextStart.getTime()))
}

export async function startScheduler(): Promise<never> {
  for (;;) {
    const next = computeNextRunAt(loadSettings())
    log.info("scheduler: 下次运行", { at: next.toISOString() })
    await sleep(Math.max(0, next.getTime() - Date.now()))
    try {
      await runOnce("schedule")
    } catch (err) {
      log.error("跑批失败，等待下一轮", { err: String(err) })
    }
  }
}
