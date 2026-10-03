import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { existsSync } from "node:fs"
import { log } from "./src/logger"
import { createApp } from "./src/web"
import { startScheduler } from "./src/scheduler"
import { reapStaleRuns } from "./src/repo"

const PORT = Number(process.env.PORT ?? 8787)
const app = createApp()

if (existsSync("web/dist")) {
  app.use("/*", serveStatic({ root: "./web/dist" }))
  app.get("/*", serveStatic({ path: "./web/dist/index.html" }))
}

log.info("控制台启动", { port: PORT, staticHosted: existsSync("web/dist"), webOnly: process.argv.includes("--web-only") })

// 上次进程若被硬杀，runs 表里会留下永远"进行中"的行；刚启动没有别人的跑批，全是尸体
const reaped = reapStaleRuns()
if (reaped > 0) log.info("收尾残留的运行记录", { count: reaped })

// --web-only 只跑控制台，不进每日调度循环
if (!process.argv.includes("--web-only")) void startScheduler()

export default {
  port: PORT,
  hostname: process.env.HOST ?? "0.0.0.0",
  fetch: app.fetch,
}
