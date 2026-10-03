/**
 * 校准探针：bun run calibrate
 * 用首个启用账号打开抖音，dump 候选按钮/可编辑元素与各候选选择器的命中数，
 * 截图落到 logs/calibrate.png，据此回填 src/selectors.ts。
 */
import { mkdirSync } from "node:fs"
import { closeAllBrowsers, openAccountPage } from "./browser"
import { detectBlocked, ensureLoggedIn } from "./douyin"
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
  const loggedIn = await ensureLoggedIn(page)
  log.info("calibrate: 登录状态", { loggedIn, url: page.url(), alias: account.alias })
  const blocked = await detectBlocked(page)
  if (blocked) log.warn("calibrate: 命中风控/验证码", { blocked })

  // 进入消息页，dump 更有价值
  const entry = page.getByText(new RegExp(SEL.messageEntryText.join("|"))).first()
  try {
    await entry.click({ timeout: 5000 })
    await page.waitForTimeout(1500)
  } catch {
    log.warn("calibrate: 未能点击「消息」入口")
  }

  const buttons = (await page.locator("button").allInnerTexts()).slice(0, 60)
  console.log("--- buttons ---")
  console.log(JSON.stringify(buttons, null, 0))
  const editables = await page.locator("[contenteditable='true'], textarea, input").count()
  console.log("--- editables/inputs ---", editables)

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

