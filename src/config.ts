import { getSetting, listAccounts, listFriends, listMessages, setSetting } from "./repo"
import type { AccountRuntime, RunConfig, RuntimeSettings, SendKey } from "./types"

export type PlaywrightCookie = {
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
  perFriendMessages: [1, 3],
  dedupeMessagesPerFriend: true,
  shuffleFriends: true,
  gapBetweenMessagesMs: [1500, 4000],
  gapBetweenFriendsMs: [5000, 10000],
  gapBetweenAccountsMs: [30000, 90000],
  typingCps: [8, 16],
  sendKey: "Auto",
  maxScrollAttempts: 10,
  dryRun: true,
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

function readNumber(k: string, def: number): number {
  const v = readJSON(k)
  return typeof v === "number" && Number.isFinite(v) ? v : def
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

export function loadSettings(): RuntimeSettings {
  const d = DEFAULT_SETTINGS
  const sendKey = readJSON("sendKey")
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
    perFriendMessages: readPair("perFriendMessages", d.perFriendMessages),
    dedupeMessagesPerFriend: readBool("dedupeMessagesPerFriend", d.dedupeMessagesPerFriend),
    shuffleFriends: readBool("shuffleFriends", d.shuffleFriends),
    gapBetweenMessagesMs: readPair("gapBetweenMessagesMs", d.gapBetweenMessagesMs),
    gapBetweenFriendsMs: readPair("gapBetweenFriendsMs", d.gapBetweenFriendsMs),
    gapBetweenAccountsMs: readPair("gapBetweenAccountsMs", d.gapBetweenAccountsMs),
    typingCps: readPair("typingCps", d.typingCps),
    sendKey: sendKey === "Enter" || sendKey === "Click" || sendKey === "Auto" ? (sendKey as SendKey) : "Auto",
    maxScrollAttempts: readNumber("maxScrollAttempts", d.maxScrollAttempts),
    dryRun: readBool("dryRun", d.dryRun),
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
  setSetting("perFriendMessages", s.perFriendMessages)
  setSetting("dedupeMessagesPerFriend", s.dedupeMessagesPerFriend)
  setSetting("shuffleFriends", s.shuffleFriends)
  setSetting("gapBetweenMessagesMs", s.gapBetweenMessagesMs)
  setSetting("gapBetweenFriendsMs", s.gapBetweenFriendsMs)
  setSetting("gapBetweenAccountsMs", s.gapBetweenAccountsMs)
  setSetting("typingCps", s.typingCps)
  setSetting("sendKey", s.sendKey)
  setSetting("maxScrollAttempts", s.maxScrollAttempts)
  setSetting("dryRun", s.dryRun)
  setSetting("pushdeerKey", s.pushdeerKey)
  setSetting("notifyOnRun", s.notifyOnRun)
  setSetting("notifyOnAbort", s.notifyOnAbort)
  setSetting("limits", s.limits)
}

export function loadRunConfig(): RunConfig {
  const settings = loadSettings()
  const accounts: AccountRuntime[] = listAccounts(true).map((account) => ({
    account,
    friends: listFriends(account.id),
    // 账号专属文案在前，全局文案池兜底
    messages: [...listMessages(account.id), ...listMessages(null)]
      .map((m) => m.text)
      .filter((t) => t.trim().length > 0),
  }))
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
