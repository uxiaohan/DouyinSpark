/**
 * 测试用库：Bun 在同一进程内跨测试文件共享模块缓存，逐文件设置 DB_PATH 不生效，
 * 因此统一使用一个 :memory: 库，由 reset() 在用例之间清表。
 * 导入本文件后不要再静态 import ./db、./repo、./config。
 */
process.env.DB_PATH = ":memory:"

const { db } = await import("./db")
export { db }

export const repo = await import("./repo")
export const config = await import("./config")

const TABLES = ["run_items", "runs", "messages", "friends", "accounts", "settings", "sessions"]

export function reset(): void {
  for (const t of TABLES) db.exec(`DELETE FROM ${t}`)
}

export function cleanup(): void {
  db.close()
}
