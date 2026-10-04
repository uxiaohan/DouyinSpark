import { closeAllBrowsers } from "./browser"
import { log } from "./logger"
import { isRunning, requestStop } from "./runner"

type ShutdownPlan = "drain" | "force" | "exit"

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

/**
 * 退出信号落在谁身上。两种目标：
 * - 进程内一次运行（`bun run now` / docker exec / run-child 拉起的 worker）——
 *   运行就在本进程，收尾靠 runner 的 requestStop，清理关浏览器；
 * - 父进程里的运行子进程（web-server 模式）——父进程从不 import playwright，
 *   收尾 = 转发 SIGTERM 给子进程等它自己 drain，强制 = SIGKILL，无需清理。
 */
interface DrainTarget {
  /** 是否忙（决定 drain 还是直接退） */
  isBusy: () => boolean
  /** drain：请求在当前边界收尾，并等到不忙 */
  drain: () => Promise<void>
  /** 二次信号 / 收尾超时后的强制手段 */
  forceStop: () => void
  /** 空闲分支退出前的清理 */
  cleanup: () => Promise<void> | void
}

/** 默认目标：运行就在本进程里 */
function inProcessTarget(): DrainTarget {
  return {
    isBusy: isRunning,
    drain: async () => {
      requestStop()
      while (isRunning()) await new Promise((resolve) => setTimeout(resolve, 300))
    },
    forceStop: () => {},
    cleanup: () => closeAllBrowsers(),
  }
}

/** 幂等安装 SIGINT/SIGTERM 处理；测试里不调用（会动 process） */
export function installShutdownHandlers(target: DrainTarget = inProcessTarget()): void {
  let seen = false
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      const plan = planShutdown(target.isBusy(), seen)
      seen = true
      if (plan === "drain") {
        log.info("收到退出信号，将在当前好友边界收尾后退出", { signal })
        void target.drain().finally(() => process.exit(0))
        // 收尾等不到头（浏览器卡死之类）就别把停机一直挂着：到点强制收摊
        setTimeout(() => {
          target.forceStop()
          process.exit(0)
        }, DRAIN_TIMEOUT_MS).unref()
        return
      }
      if (plan === "force") {
        log.info("再次收到退出信号，强制退出", { signal })
        target.forceStop()
        process.exit(0)
      }
      log.info("收到退出信号，正在关闭浏览器", { signal })
      void Promise.resolve(target.cleanup()).finally(() => process.exit(0))
    })
  }
}
