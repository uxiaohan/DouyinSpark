import { closeAllBrowsers } from "./browser"
import { log } from "./logger"
import { isRunning, requestStop } from "./runner"

export type ShutdownPlan = "drain" | "force" | "exit"

/**
 * 收到退出信号时的动作：
 * - 空闲：直接关浏览器退出；
 * - 运行中：先让运行在当前好友边界收尾（requestStop），否则硬杀会把
 *   输入到一半的消息和未 finishRun 的运行记录留在半路；
 * - 第二次信号：不再等，强制退出。
 */
export function planShutdown(running: boolean, signalSeen: boolean): ShutdownPlan {
  if (signalSeen) return "force"
  return running ? "drain" : "exit"
}

const DRAIN_TIMEOUT_MS = 120_000

/** 幂等安装 SIGINT/SIGTERM 处理；测试里不调用（会动 process） */
export function installShutdownHandlers(): void {
  let seen = false
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      const plan = planShutdown(isRunning(), seen)
      seen = true
      if (plan === "drain") {
        log.info("收到退出信号，将在当前好友边界收尾后退出", { signal })
        requestStop()
        const poll = setInterval(() => {
          if (!isRunning()) process.exit(0)
        }, 300)
        poll.unref()
        setTimeout(() => process.exit(0), DRAIN_TIMEOUT_MS).unref()
        return
      }
      if (plan === "force") {
        log.info("再次收到退出信号，强制退出", { signal })
        process.exit(0)
      }
      log.info("收到退出信号，正在关闭浏览器", { signal })
      void closeAllBrowsers().finally(() => process.exit(0))
    })
  }
}
