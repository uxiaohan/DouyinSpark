import { closeAllBrowsers } from "./src/browser"
import { log } from "./src/logger"
import { runOnce } from "./src/runner"
import { startScheduler } from "./src/scheduler"

const manual = process.argv.includes("--now")

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

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("收到退出信号，正在关闭浏览器", { signal })
    void closeAllBrowsers().finally(() => process.exit(0))
  })
}

main().catch((err: unknown) => {
  log.error("运行失败", { err: String(err) })
  process.exit(1)
})
