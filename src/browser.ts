import { chromium } from "playwright"
import type { Browser, BrowserContext, Page } from "playwright"
import { parseCookies } from "./config"
import { EVASION_SCRIPT, pickFingerprint } from "./fingerprint"
import { log } from "./logger"
import type { AccountRow, ProxySetting } from "./types"

export type AccountPage = { context: BrowserContext; page: Page }

const browsers = new Map<string, Browser>()

const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
]

function proxyKey(proxy: ProxySetting | null): string {
  return proxy ? `${proxy.server}|${proxy.username ?? ""}|${proxy.password ?? ""}` : ""
}

async function launch(proxy: ProxySetting | null): Promise<Browser> {
  const base = {
    headless: process.env.HEADFUL !== "1",
    args: LAUNCH_ARGS,
    proxy: proxy
      ? { server: proxy.server, username: proxy.username ?? undefined, password: proxy.password ?? undefined }
      : undefined,
  }
  try {
    return await chromium.launch({ ...base, channel: "chrome" })
  } catch (err) {
    log.warn("chrome channel 启动失败，回退内置 chromium", { err: String(err) })
    return await chromium.launch(base)
  }
}

/** 按代理分组复用浏览器实例：同代理的账号共用一个 browser，各自独立 context */
export async function getBrowser(proxy: ProxySetting | null): Promise<Browser> {
  const key = proxyKey(proxy)
  const cached = browsers.get(key)
  if (cached && cached.isConnected()) return cached
  const browser = await launch(proxy)
  browsers.set(key, browser)
  return browser
}

/** 浏览器版本拿不到时返回 null，指纹退回通用版本号 */
function browserVersion(browser: Browser): string | null {
  try {
    return browser.version()
  } catch {
    return null
  }
}

export async function openAccountPage(account: AccountRow): Promise<AccountPage> {
  const proxy: ProxySetting | null = account.proxy_server
    ? { server: account.proxy_server, username: account.proxy_username, password: account.proxy_password }
    : null
  const browser = await getBrowser(proxy)
  const fp = pickFingerprint(browserVersion(browser))
  const context = await browser.newContext({
    userAgent: fp.userAgent,
    viewport: fp.viewport,
    deviceScaleFactor: fp.deviceScaleFactor,
    locale: fp.locale,
    timezoneId: fp.timezoneId,
  })
  await context.addInitScript(EVASION_SCRIPT)
  const cookies = parseCookies(account.cookie_json)
  if (cookies.length > 0) await context.addCookies(cookies)
  const page = await context.newPage()
  return { context, page }
}

export async function closeAllBrowsers(): Promise<void> {
  for (const browser of browsers.values()) {
    await browser.close().catch((err: unknown) => log.warn("关闭浏览器失败", { err: String(err) }))
  }
  browsers.clear()
}
