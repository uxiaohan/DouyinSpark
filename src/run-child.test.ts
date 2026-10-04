import { test, expect } from "bun:test"
import { existsSync } from "node:fs"
import {
  isChildRunning,
  killChild,
  runInChild,
  stopChild,
  WORKER_ENTRY,
  workerCmd,
  type ChildLike,
  type Spawner,
} from "./run-child"

/** 假子进程：exited 由测试自己决定何时以什么码 resolve，kill 记录收到的信号 */
function fakeChild() {
  let resolveExit!: (code: number) => void
  const exited = new Promise<number>((r) => {
    resolveExit = r
  })
  const killed: (NodeJS.Signals | number | undefined)[] = []
  const child: ChildLike = {
    pid: 4242,
    exited,
    kill: (signal) => {
      killed.push(signal)
      resolveExit(signal === "SIGKILL" ? 137 : 0)
    },
  }
  return { child, killed, exit: resolveExit }
}

test("worker 命令行：bun 跑仓库根的 index.ts --now --trigger <t>", () => {
  const cmd = workerCmd("schedule")
  expect(cmd[0]).toBe(process.execPath)
  expect(cmd[1]).toBe(WORKER_ENTRY)
  expect(existsSync(WORKER_ENTRY)).toBe(true)
  expect(cmd.slice(2)).toEqual(["--now", "--trigger", "schedule"])
})

test("触发标签透传给 spawner，运行期间 isChildRunning 为真", async () => {
  const fake = fakeChild()
  const seen: string[] = []
  const spawner: Spawner = (trigger) => {
    seen.push(trigger)
    return fake.child
  }
  const p = runInChild("schedule", spawner)
  expect(seen).toEqual(["schedule"])
  expect(isChildRunning()).toBe(true)
  fake.exit(0)
  await p
  expect(isChildRunning()).toBe(false)
})

test("退出码非 0 抛错，并释放占用让下一轮能跑", async () => {
  const first = fakeChild()
  const p = runInChild("schedule", () => first.child)
  first.exit(3)
  await expect(p).rejects.toThrow("退出码 3")
  expect(isChildRunning()).toBe(false)

  const second = fakeChild()
  const p2 = runInChild("manual", () => second.child)
  second.exit(0)
  await p2
})

test("运行期间再次触发被拒绝，不会叠出两个浏览器", async () => {
  const first = fakeChild()
  const p = runInChild("schedule", () => first.child)
  await expect(runInChild("manual", () => fakeChild().child)).rejects.toThrow("已有运行在进行中")
  first.exit(0)
  await p
})

test("stopChild 转发 SIGTERM 并等子进程退出；没有子进程时是空操作", async () => {
  await stopChild() // 空闲：直接返回，不抛

  const fake = fakeChild()
  const p = runInChild("schedule", () => fake.child)
  const stopping = stopChild("SIGTERM")
  expect(fake.killed).toEqual(["SIGTERM"])
  await stopping
  await p
})

test("子进程已退出时 kill 不炸场（stopChild 静默放行）", async () => {
  const fake = fakeChild()
  const p = runInChild("schedule", () => fake.child)
  fake.exit(0)
  await p
  // 跑到这里 current 已清空，stopChild 走"没有子进程"分支
  await stopChild("SIGTERM")
})

test("killChild 发 SIGKILL；异常退出码被 runInChild 接住", async () => {
  const fake = fakeChild()
  const p = runInChild("schedule", () => fake.child).catch((err: unknown) => {
    expect(String(err)).toContain("退出码 137")
  })
  killChild()
  expect(fake.killed).toEqual(["SIGKILL"])
  await p
  expect(isChildRunning()).toBe(false)
})
