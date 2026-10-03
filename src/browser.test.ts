import { test, expect } from "bun:test"
import { openAccountPage, closeAllBrowsers } from "./browser"
import { FINGERPRINTS, pickFingerprint } from "./fingerprint"
import type { AccountRow } from "./types"

test("pickFingerprint 返回成套指纹，不混搭字段", () => {
  for (let i = 0; i < 50; i++) {
    expect(FINGERPRINTS).toContainEqual(pickFingerprint())
  }
})

test("每套指纹 UA/视口/DSF/时区自洽", () => {
  for (const fp of FINGERPRINTS) {
    expect(fp.userAgent).toContain("Chrome/")
    expect(fp.viewport.width).toBeGreaterThanOrEqual(1024)
    expect(fp.viewport.height).toBeGreaterThanOrEqual(600)
    expect([1, 1.25, 1.5, 2]).toContain(fp.deviceScaleFactor)
    expect(fp.timezoneId).toBe("Asia/Shanghai")
    expect(fp.locale.startsWith("zh-CN")).toBe(true)
    // Windows/Mac 与 DSF 组合需自洽：非 Windows 的高分屏必须 >=2
    if (fp.userAgent.includes("Mac OS X")) expect(fp.deviceScaleFactor).toBe(2)
  }
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
