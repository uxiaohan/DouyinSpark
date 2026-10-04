/**
 * 测试用库。通过 bunfig.toml 的 [test].preload 在任何测试文件之前加载，
 * 把 DB_PATH 固定为 :memory:；否则先加载的测试文件会按默认路径打开真实的 data/app.db，
 * 并被 reset() 清空真实数据。
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
