import { log } from "./src/logger"
import { runOnce } from "./src/runner"
import { installShutdownHandlers } from "./src/shutdown"
import { startScheduler } from "./src/scheduler"

const manual = process.argv.includes("--now")

installShutdownHandlers()

async function main(): Promise<void> {
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
