import { test, expect } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evictionTargets, evictRuntimeCache, walkFiles } from "./cache-evict"

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "cache-evict-"))
}

test("驱逐目标 = bun 可执行文件 + 传入且存在的浏览器目录", () => {
  const dir = tempDir()
  try {
    expect(evictionTargets(dir)).toEqual([process.execPath, dir])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  // 目录不存在（本地开发机）时只留 bun 本体
  expect(evictionTargets(join(tempDir(), "no-such-dir"))).toEqual([process.execPath])
})

test("walkFiles 递归列出常规文件，跳过符号链接", () => {
  const root = tempDir()
  try {
    mkdirSync(join(root, "chrome-linux/locales"), { recursive: true })
    writeFileSync(join(root, "chrome-linux/chrome"), "bin")
    writeFileSync(join(root, "chrome-linux/libmock.so"), "lib")
    writeFileSync(join(root, "chrome-linux/locales/en-US.pak"), "pak")
    let linked = false
    try {
      // Windows 无管理员权限建不了符号链接：建失败就跳过软链接断言
      symlinkSync(join(root, "chrome-linux/chrome"), join(root, "chrome-link"))
      linked = true
    } catch {
      /* 无权限环境没有软链接可断言 */
    }
    const files = walkFiles(root).sort()
    expect(files).toEqual(
      [
        join(root, "chrome-linux/chrome"),
        join(root, "chrome-linux/libmock.so"),
        join(root, "chrome-linux/locales/en-US.pak"),
      ].sort(),
    )
    if (linked) expect(files).not.toContain(join(root, "chrome-link"))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("目录里什么都没有时 walkFiles 返回空", () => {
  const root = tempDir()
  try {
    expect(walkFiles(root)).toEqual([])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("没装 vmtouch 的环境驱逐是空操作，不抛", async () => {
  // 开发机（Windows/macOS，或没装 vmtouch 的 Linux）Bun.which 返回 null 直接返回；
  // CI 若装了 vmtouch 也只是对存在的路径做无害 fadvise
  await evictRuntimeCache()
})
