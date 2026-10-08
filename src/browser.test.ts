import { test, expect } from "bun:test"
import { accountProxy, closeAccountBrowser, openAccountPage, closeAllBrowsers } from "./browser"
import { buildUserAgent, pickFingerprint } from "./fingerprint"
import type { AccountRow } from "./types"

const account = (over: Partial<AccountRow> = {}): AccountRow => ({
  id: 1,
  alias: "t",
  cookie_json: null,
  proxy_server: null,
  proxy_username: null,
  proxy_password: null,
  enabled: 1,
  daily_cap: 50,
  last_run_at: null,
  created_at: "",
  ...over,
})

test("accountProxy：无代理为 null，有代理才组装（key 与 closeAccountBrowser 同源）", () => {
  expect(accountProxy(account())).toBe(null)
  const p = accountProxy(account({ proxy_server: "http://1.2.3.4:8080", proxy_username: "u", proxy_password: "p" }))
  expect(p).toEqual({ server: "http://1.2.3.4:8080", username: "u", password: "p" })
  // 只填了 server 没填账密：库里是 null 就原样带着（ProxySetting 就是 string | null），
  // 转成 Playwright 认的 undefined 是 launch() 的事
  const bare = accountProxy(account({ proxy_server: "http://1.2.3.4:8080" }))
  expect(bare).toEqual({ server: "http://1.2.3.4:8080", username: null, password: null })
})

// not_ready 重开的路径会调它；没开过浏览器时（进程级故障发生前）也必须是安全空操作
test("closeAccountBrowser 对没有缓存的代理是空操作，不抛", async () => {
  await closeAccountBrowser(null)
  await closeAccountBrowser({ server: "http://1.2.3.4:8080", username: null, password: null })
})

test("pickFingerprint 返回成套指纹，视口/DSF/UA 不混搭", () => {
  const seen = new Set<string>()
  for (let i = 0; i < 50; i++) {
    const fp = pickFingerprint()
    expect(fp.userAgent).toContain("Chrome/")
    expect(fp.viewport.width).toBeGreaterThanOrEqual(1024)
    expect(fp.viewport.height).toBeGreaterThanOrEqual(600)
    expect([1, 1.25, 1.5, 2]).toContain(fp.deviceScaleFactor)
    expect(fp.timezoneId).toBe("Asia/Shanghai")
    expect(fp.locale.startsWith("zh-CN")).toBe(true)
    seen.add(`${fp.viewport.width}x${fp.viewport.height}@${fp.deviceScaleFactor}`)
  }
  expect(seen.size).toBeGreaterThan(1)
})

test("UA 平台段与本机一致，版本段跟真实浏览器一致", () => {
  expect(buildUserAgent("131.0.6778.86")).toContain("Chrome/131.0.6778.86")
  expect(buildUserAgent("131")).toContain("Chrome/131.0.0.0")
  expect(buildUserAgent(null)).toContain("Chrome/131.0.0.0")
  expect(buildUserAgent("131.0.6778.86")).toContain(process.platform === "darwin" ? "Mac OS X" : "Win64")
  // 不会出现 Mac UA 配 Windows 机器的错搭
  if (process.platform !== "darwin") expect(buildUserAgent("131.0.6778.86")).not.toContain("Mac OS X")
})

test.skipIf(!process.env.PLAYWRIGHT)("launches and evades webdriver", async () => {
  const { context, page } = await openAccountPage(account())
  await page.goto("https://example.com")
  expect(await page.title()).toContain("Example")
  const wd = await page.evaluate(() => (navigator as unknown as { webdriver?: boolean }).webdriver)
  expect(wd).toBeFalsy()
  await closeAllBrowsers()
  expect(context.pages().length).toBeGreaterThanOrEqual(0)
})

// 关闭单个浏览器并摘掉缓存：下一次 openAccountPage 必须真正重新 launch，
// 而不是把已关闭的浏览器交出去（chat 页 not_ready 的重开全靠这条路径）。
test.skipIf(!process.env.PLAYWRIGHT)("closeAccountBrowser 之后 openAccountPage 仍能拿到新浏览器", async () => {
  const acc = account()
  await openAccountPage(acc)
  await closeAccountBrowser(accountProxy(acc))
  const second = await openAccountPage(acc)
  await second.page.goto("https://example.com")
  expect(await second.page.title()).toContain("Example")
  await closeAccountBrowser(accountProxy(acc))
})
