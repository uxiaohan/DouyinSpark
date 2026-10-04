// 删除指定 SQLite 库及其 WAL/SHM 附属文件（重开前用）。不给路径就直接报错——
// 早年默认值指向 data/smoke-api.db，那个冒烟脚本早就删了，静默操作一个不存在的库只是骗人
import { rmSync } from "node:fs"

const base = process.argv[2]
if (!base) {
  console.error("用法: bun run scripts/clean-db.ts <db路径>")
  process.exit(1)
}
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${base}${suffix}`, { force: true })
}
console.log("cleaned", base)
