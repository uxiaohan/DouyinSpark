import { test, expect } from "bun:test"
import { openAccountPage, closeAllBrowsers } from "./browser"
import { buildUserAgent, pickFingerprint } from "./fingerprint"
import type { AccountRow } from "./types"

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
  const account: AccountRow = {
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
  }
  const { context, page } = await openAccountPage(account)
  await page.goto("https://example.com")
  expect(await page.title()).toContain("Example")
  const wd = await page.evaluate(() => (navigator as unknown as { webdriver?: boolean }).webdriver)
  expect(wd).toBeFalsy()
  await closeAllBrowsers()
  expect(context.pages().length).toBeGreaterThanOrEqual(0)
})
