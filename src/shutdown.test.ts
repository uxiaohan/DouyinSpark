import { test, expect } from "bun:test"
import { planShutdown } from "./shutdown"

test("空闲时收到退出信号直接退出", () => {
  expect(planShutdown(false, false)).toBe("exit")
})

test("运行中收到首个信号先收尾", () => {
  expect(planShutdown(true, false)).toBe("drain")
})

test("第二个信号强制退出", () => {
  expect(planShutdown(true, true)).toBe("force")
  expect(planShutdown(false, true)).toBe("force")
})
