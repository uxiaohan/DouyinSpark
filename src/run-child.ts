import { resolve } from "node:path"
import { log } from "./logger"

/**
 * 把"跑一批"关进子进程：playwright 的 import 一旦发生就在 Bun 的 ESM 缓存里
 * 永久常驻（实测 +65MB，强制 GC 收不回），控制台进程一天 23 小时空跑，
 * 不能替这 1 小时付内存。所以 web-server 模式（含每日调度）只 spawn 子进程，
 * 父进程从头到尾不 import playwright，常驻回到 15MB 量级。
 *
 * 子进程入口就是入口文件 index.ts 的 --now 模式：同一份 runOnce、同一份
 * 关闭处理，避免两份入口慢慢漂移。`bun run now` / docker exec 仍可独立跑
 * （一次性进程，跑完即退，内存随进程一起还给系统）。
 */

/** 与 Bun.Subprocess 对齐的最小面；kill 的 signal 形态 bun/node 各版本有差异，这里自己收口 */
export interface ChildLike {
  readonly pid: number
  readonly exited: Promise<number>
  kill(signal?: number | NodeJS.Signals): void
}

export type Spawner = (trigger: string) => ChildLike

export const WORKER_ENTRY = resolve(import.meta.dir, "..", "index.ts")

/** worker 命令行（导出供测试断言参数，免得默认 spawn 悄悄漂移） */
export function workerCmd(trigger: string): string[] {
  return [process.execPath, WORKER_ENTRY, "--now", "--trigger", trigger]
}

/** 默认 spawner：bun 跑 index.ts --now --trigger <t>，日志原样透传（docker logs 不丢） */
function defaultSpawn(trigger: string): ChildLike {
  const child = Bun.spawn({
    cmd: workerCmd(trigger),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: process.env,
  })
  return child as unknown as ChildLike
}

let current: ChildLike | null = null

/** 父进程侧是否有运行中的子进程（关闭信号处置据此选 drain 还是直接退） */
export function isChildRunning(): boolean {
  return current !== null
}

/**
 * 在子进程里跑一批。并发保护与 runOnce 的 running 标志同一用意：
 * 调度器是唯一调用方，但手动 docker exec 撞上调度时不该叠两个浏览器。
 */
export async function runInChild(trigger: string, spawner: Spawner = defaultSpawn): Promise<void> {
  if (current) throw new Error("已有运行在进行中")
  const child = spawner(trigger)
  current = child
  try {
    const code = await child.exited
    // 子进程退出码非 0 = runOnce 抛异常或进程崩了；summary 状态由子进程自己落库
    if (code !== 0) throw new Error(`运行子进程退出码 ${code}`)
  } finally {
    current = null
  }
}

/**
 * 通知子进程收尾并等它退出（转发 SIGTERM，子进程自己的关闭处理器会在
 * 当前好友边界停）。没有子进程时直接返回。
 */
export async function stopChild(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  const child = current
  if (!child) return
  log.info("转发退出信号给运行子进程", { pid: child.pid, signal })
  try {
    child.kill(signal)
  } catch {
    // 已经退出了：kill 抛错就当作没得可转
  }
  await child.exited.catch(() => 0)
}

/** 二次信号后的强制手段 */
export function killChild(): void {
  try {
    current?.kill("SIGKILL")
  } catch {
    // 同上：已经退出
  }
}
