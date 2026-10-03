// 删除指定 SQLite 库及其 WAL/SHM 附属文件（冒烟测试前单独调用）
import { rmSync } from "node:fs"

const base = process.argv[2] ?? "data/smoke-api.db"
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${base}${suffix}`, { force: true })
}
console.log("cleaned", base)
