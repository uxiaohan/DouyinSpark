import { log } from "./src/logger"
import { runOnce } from "./src/runner"
import { installShutdownHandlers } from "./src/shutdown"
import { startScheduler } from "./src/scheduler"
import { reapStaleRuns } from "./src/repo"

const manual = process.argv.includes("--now")

// 子进程 worker 模式（src/run-child.ts 拉起）：来源标签透传，run_items 里能和
// 调度触发区分开；默认 manual 保持 `bun run now` 的口径
const triggerIdx = process.argv.indexOf("--trigger")
const trigger = triggerIdx >= 0 && process.argv[triggerIdx + 1] ? process.argv[triggerIdx + 1] : "manual"

installShutdownHandlers()

async function main(): Promise<void> {
  // 上次硬杀/崩溃会留下永远"进行中"的运行记录，先收尾再谈新的
  const reaped = reapStaleRuns()
  if (reaped > 0) log.info("收尾残留的运行记录", { count: reaped })
  if (manual) {
    const summary = await runOnce(trigger)
    console.log(
      JSON.stringify(
        {
          status: summary.status,
          totals: summary.totals,
          accounts: summary.accounts.map((a) => ({
            alias: a.alias,
            cookieExpired: a.cookieExpired,
            friends: a.friends.map((f) => `${f.name}: ${f.status}${f.reason ? ` (${f.reason})` : ""}`),
          })),
        },
        null,
        2,
      ),
    )
    return
  }
  await startScheduler()
}

main().catch((err: unknown) => {
  log.error("运行失败", { err: String(err) })
  process.exit(1)
})
