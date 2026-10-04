import { getSetting, listAccounts, listFriends, listMessages, setSetting } from "./repo"
import type { AccountRuntime, RunConfig, RuntimeSettings } from "./types"

type PlaywrightCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: "Strict" | "Lax" | "None"
}

export const DEFAULT_SETTINGS: RuntimeSettings = {
  timezone: "Asia/Shanghai",
  schedule: { startHour: 8, startMinute: 0, endHour: 10, endMinute: 0 },
  shuffleFriends: true,
  gapBetweenFriendsMs: [5000, 10000],
  gapBetweenAccountsMs: [30000, 90000],
  typingCps: [8, 16],
  pushdeerKey: null,
  notifyOnRun: true,
  notifyOnAbort: true,
  limits: { dailyCapPerAccount: 50, retryPerFriend: 2, consecutiveFailAbort: 5 },
}

function readJSON(k: string): unknown {
  const raw = getSetting(k)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function readPair(k: string, def: [number, number]): [number, number] {
  const v = readJSON(k)
  if (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)
  ) {
    return [v[0] as number, v[1] as number]
  }
  return def
}

function readBool(k: string, def: boolean): boolean {
  const v = readJSON(k)
  return typeof v === "boolean" ? v : def
}

function readString(k: string, def: string): string {
  const v = readJSON(k)
  return typeof v === "string" && v.length > 0 ? v : def
}

function readNullableString(k: string): string | null {
  const v = readJSON(k)
  return typeof v === "string" && v.length > 0 ? v : null
}

function readClock(v: unknown, min: number, max: number, def: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : def
}

/**
 * 调度窗口合法性：时/分为范围内整数，且结束不早于开始。供 PUT /api/settings
 * 保存前拦截——结束早于开始会被 computeNextRunAt 的跨零点分支当成 24 小时
 * 窗口（用户实测误存 0:16–0:13，下次运行跳到当晚 21:36），语义不是用户
 * 想要的。历史数据里的跨零点值仍被 computeNextRunAt 兼容，这里只管新保存。
 */
export function validateSchedule(s: RuntimeSettings["schedule"]): string | null {
  const clk = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max
  if (!clk(s?.startHour, 0, 23) || !clk(s?.endHour, 0, 23)) return "开始/结束小时需为 0–23 的整数"
  if (!clk(s?.startMinute, 0, 59) || !clk(s?.endMinute, 0, 59)) return "开始/结束分钟需为 0–59 的整数"
  if (s.endHour * 60 + s.endMinute < s.startHour * 60 + s.startMinute) {
    return "结束时间不能早于开始时间（不支持跨零点窗口）"
  }
  return null
}

export function loadSettings(): RuntimeSettings {
  const d = DEFAULT_SETTINGS
  const sched = (readJSON("schedule") ?? {}) as Record<string, unknown>
  const limits = (readJSON("limits") ?? {}) as Partial<RuntimeSettings["limits"]>
  const limitsNum = (key: keyof RuntimeSettings["limits"], fallback: number): number =>
    typeof limits[key] === "number" && Number.isFinite(limits[key]) ? (limits[key] as number) : fallback
  return {
    timezone: readString("timezone", d.timezone),
    schedule: {
      startHour: readClock(sched.startHour, 0, 23, d.schedule.startHour),
      startMinute: readClock(sched.startMinute, 0, 59, d.schedule.startMinute),
      endHour: readClock(sched.endHour, 0, 23, d.schedule.endHour),
      endMinute: readClock(sched.endMinute, 0, 59, d.schedule.endMinute),
    },
    shuffleFriends: readBool("shuffleFriends", d.shuffleFriends),
    gapBetweenFriendsMs: readPair("gapBetweenFriendsMs", d.gapBetweenFriendsMs),
    gapBetweenAccountsMs: readPair("gapBetweenAccountsMs", d.gapBetweenAccountsMs),
    typingCps: readPair("typingCps", d.typingCps),
    pushdeerKey: readNullableString("pushdeerKey"),
    notifyOnRun: readBool("notifyOnRun", d.notifyOnRun),
    notifyOnAbort: readBool("notifyOnAbort", d.notifyOnAbort),
    limits: {
      dailyCapPerAccount: limitsNum("dailyCapPerAccount", d.limits.dailyCapPerAccount),
      retryPerFriend: limitsNum("retryPerFriend", d.limits.retryPerFriend),
      consecutiveFailAbort: limitsNum("consecutiveFailAbort", d.limits.consecutiveFailAbort),
    },
  }
}

export function saveSettings(s: RuntimeSettings): void {
  setSetting("timezone", s.timezone)
  setSetting("schedule", s.schedule)
  setSetting("shuffleFriends", s.shuffleFriends)
  setSetting("gapBetweenFriendsMs", s.gapBetweenFriendsMs)
  setSetting("gapBetweenAccountsMs", s.gapBetweenAccountsMs)
  setSetting("typingCps", s.typingCps)
  setSetting("pushdeerKey", s.pushdeerKey)
  setSetting("notifyOnRun", s.notifyOnRun)
  setSetting("notifyOnAbort", s.notifyOnAbort)
  setSetting("limits", s.limits)
}

export function loadRunConfig(): RunConfig {
  const settings = loadSettings()
  const accounts: AccountRuntime[] = listAccounts(true).map((account) => {
    const clean = (rows: ReturnType<typeof listMessages>) => rows.map((m) => m.text).filter((t) => t.trim().length > 0)
    return {
      account,
      friends: listFriends(account.id),
      // 专属与全局分开存：挑选时专属优先、全局兜底（见 pickFriendText），
      // 以前合成一个池随机抽，专属会被全局淹没
      messages: clean(listMessages(account.id)),
      fallbackMessages: clean(listMessages(null)),
    }
  })
  return { settings, accounts }
}

const SAME_SITE = new Set(["Strict", "Lax", "None"])

/** 解析 Cookie-Editor 导出的 JSON 数组；非 douyin 域直接丢弃 */
export function parseCookies(raw: string | null): PlaywrightCookie[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: PlaywrightCookie[] = []
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue
    const c = item as Record<string, unknown>
    const name = typeof c.name === "string" ? c.name : ""
    if (name.length === 0) continue
    const domain = typeof c.domain === "string" && c.domain.length > 0 ? c.domain : ".douyin.com"
    if (!domain.includes("douyin")) continue
    const sameSite = typeof c.sameSite === "string" && SAME_SITE.has(c.sameSite) ? (c.sameSite as PlaywrightCookie["sameSite"]) : "Lax"
    out.push({
      name,
      value: typeof c.value === "string" ? c.value : String(c.value ?? ""),
      domain,
      path: typeof c.path === "string" && c.path.length > 0 ? c.path : "/",
      expires: typeof c.expires === "number" && Number.isFinite(c.expires) ? c.expires : -1,
      httpOnly: c.httpOnly === true,
      secure: c.secure === true,
      sameSite,
    })
  }
  return out
}
