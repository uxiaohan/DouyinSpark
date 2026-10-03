import { pick } from "./util"

export type Fingerprint = {
  userAgent: string
  viewport: { width: number; height: number }
  deviceScaleFactor: number
  locale: string
  timezoneId: string
}

/** 只存与机器无关的部分：UA 现场拼，避免和真实浏览器版本/本机平台对不上 */
const BASE = [
  { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 },
  { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
]

const OS_TOKEN: Record<string, string> = {
  win32: "Windows NT 10.0; Win64; x64",
  darwin: "Macintosh; Intel Mac OS X 10_15_7",
  linux: "X11; Linux x86_64",
}

/** UA 的平台段必须和本机一致： Playwright 只会改 UA，不改 HTTP 头与 navigator.platform */
export const OS_TOKEN_STR = OS_TOKEN[process.platform] ?? OS_TOKEN.win32 as string

/**
 * UA 版本段取真实浏览器版本。
 * 用 channel:"chrome" 时请求头里的 Sec-CH-UA 由真实 Chrome 发出，
 * UA 写成别的版本会当场对不上，比不伪装更可疑。
 */
export function buildUserAgent(chromeVersion: string | null): string {
  const raw = (chromeVersion ?? "").trim()
  const ver = /^\d+\.\d+\.\d+\.\d+$/.test(raw) ? raw : `${/^\d+/.exec(raw)?.[0] ?? "131"}.0.0.0`
  return `Mozilla/5.0 (${OS_TOKEN_STR}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`
}

export function pickFingerprint(chromeVersion: string | null = null): Fingerprint {
  return {
    ...pick(BASE),
    userAgent: buildUserAgent(chromeVersion),
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  }
}

const NAV_PLATFORM = process.platform === "darwin" ? "MacIntel" : process.platform === "linux" ? "Linux x86_64" : "Win32"

/** 注入页面前执行，清掉最明显的自动化痕迹 */
export const EVASION_SCRIPT = `
delete Object.getPrototypeOf(navigator).webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true })
Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'], configurable: true })
Object.defineProperty(navigator, 'platform', { get: () => '${NAV_PLATFORM}', configurable: true })
window.chrome = window.chrome || { runtime: {} }
`
