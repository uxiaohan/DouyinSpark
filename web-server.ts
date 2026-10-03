import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { existsSync } from "node:fs"
import { log } from "./src/logger"
import { createApp } from "./src/web"
import { startScheduler } from "./src/scheduler"

const PORT = Number(process.env.PORT ?? 8787)
const app = createApp()

if (existsSync("web/dist")) {
  app.use("/*", serveStatic({ root: "./web/dist" }))
  app.get("/*", serveStatic({ path: "./web/dist/index.html" }))
}

log.info("控制台启动", { port: PORT, staticHosted: existsSync("web/dist"), webOnly: process.argv.includes("--web-only") })

// --web-only 只跑控制台，不进每日调度循环
if (!process.argv.includes("--web-only")) void startScheduler()

export default {
  port: PORT,
  hostname: process.env.HOST ?? "0.0.0.0",
  fetch: app.fetch,
}
