/**
 * 校准探针：bun run calibrate
 * 用首个启用账号打开抖音专用聊天页（/chat），dump 各候选选择器的命中数，
 * 截图落到 logs/calibrate.png，据此回填 src/selectors.ts。
 */
import { mkdirSync } from "node:fs"
import { closeAllBrowsers, openAccountPage } from "./browser"
import { detectBlocked, openChatPage } from "./douyin"
import { log } from "./logger"
import { listAccounts } from "./repo"
import { SEL } from "./selectors"

const account = listAccounts(true)[0]
if (!account) {
  console.error("没有启用账号：先执行 bun run seed，或在控制台添加账号并粘贴 cookie")
  process.exit(1)
}

const { page } = await openAccountPage(account)
try {
  const chat = await openChatPage(page)
  log.info("calibrate: 聊天页状态", { chat, alias: account.alias })
  if (!chat.ok) {
    console.error("聊天页未就绪（登录失效/风控/页面未渲染），终止校准")
    process.exit(1)
  }
  const blocked = await detectBlocked(page)
  if (blocked) log.warn("calibrate: 命中风控/验证码", { blocked })

  console.log("--- SEL 命中数 ---")
  for (const [field, value] of Object.entries(SEL)) {
    if (!Array.isArray(value)) continue
    for (const sel of value as readonly string[]) {
      let count = -1
      try {
        // 文案类字段用文本匹配统计，CSS 字段才用 locator.count()
        count = /^[a-zA-Z[#.*:\[(]/.test(sel)
          ? await page.locator(sel).count()
          : await page.getByText(sel).count()
      } catch (err) {
        console.log(`  ${field}: ${sel} -> 非法选择器 (${String(err).slice(0, 80)})`)
        continue
      }
      console.log(`  ${field}: ${sel} -> ${count}`)
    }
  }

  mkdirSync("logs", { recursive: true })
  await page.screenshot({ path: "logs/calibrate.png" })
  log.info("calibrate: 截图已保存", { path: "logs/calibrate.png" })
} finally {
  await closeAllBrowsers()
}
