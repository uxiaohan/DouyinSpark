import { log } from "./src/logger"
import { runOnce } from "./src/runner"
import { installShutdownHandlers } from "./src/shutdown"
import { startScheduler } from "./src/scheduler"
import { reapStaleRuns } from "./src/repo"

const manual = process.argv.includes("--now")

installShutdownHandlers()

async function main(): Promise<void> {
  // 上次硬杀/崩溃会留下永远"进行中"的运行记录，先收尾再谈新的
  const reaped = reapStaleRuns()
  if (reaped > 0) log.info("收尾残留的运行记录", { count: reaped })
  if (manual) {
    const summary = await runOnce("manual")
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
