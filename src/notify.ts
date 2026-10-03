import type { Page } from "playwright"
import { log } from "./logger"
import type { RunSummary } from "./types"

/** Task 7 之前先落一个可用的桩，避免跑批收尾时缺函数。 */
export function notifyRun(_settings: unknown, summary: RunSummary): Promise<void> {
  log.info("notify: 桩实现，Task 7 替换", { status: summary.status, totals: summary.totals })
  return Promise.resolve()
}
