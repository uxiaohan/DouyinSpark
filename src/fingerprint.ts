import { pick } from "./util"

export type Fingerprint = {
  userAgent: string
  viewport: { width: number; height: number }
  deviceScaleFactor: number
  locale: string
  timezoneId: string
}

/** 成套指纹：UA 与视口/DSF/语言/时区必须成套取用，不可逐字段随机 */
export const FINGERPRINTS: Fingerprint[] = [
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1536, height: 864 },
    deviceScaleFactor: 1.25,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
]

export function pickFingerprint(): Fingerprint {
  return pick(FINGERPRINTS)
}

/** 注入页面前执行，清掉最明显的自动化痕迹 */
export const EVASION_SCRIPT = `
delete Object.getPrototypeOf(navigator).webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true })
Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'], configurable: true })
window.chrome = window.chrome || { runtime: {} }
`
