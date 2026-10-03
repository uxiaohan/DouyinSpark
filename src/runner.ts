import type { Page } from "playwright"
import { closeAllBrowsers, openAccountPage } from "./browser"
import { loadRunConfig } from "./config"
import { nowISO } from "./db"
import { detectBlocked, ensureLoggedIn, openConversation, sendCurrentDraft, typeMessage } from "./douyin"
import { log } from "./logger"
import { notifyRun } from "./notify"
import { addRunItem, countTodaySuccess, createRun, finishRun, touchAccountRun } from "./repo"
import type {
  AccountResult,
  AccountRuntime,
  FriendResult,
  FriendRow,
  ItemStatus,
  RunStatus,
  RunSummary,
  RuntimeSettings,
} from "./types"
import { randInt, randMs, sampleN, shuffle, sleep } from "./util"

export type { RunSummary } from "./types"

let running = false
let stopRequested = false

export function isRunning(): boolean {
  return running
}

export function requestStop(): void {
  stopRequested = true
  log.warn("收到停止请求，将在当前好友边界停下")
}

/** 新一轮跑批开始时清掉上一轮的停止标记 */
export function resetStop(): void {
  stopRequested = false
}

export type FriendOutcome = { status: ItemStatus; messages: number; reason: string | null }
export type FriendDriver = (friend: FriendRow, attempt: number) => Promise<FriendOutcome>

export type RunState = {
  runId: number
  settings: RuntimeSettings
  consecutiveFail: number
  aborted: boolean
  shouldStop: () => boolean
}

/** cookie 失效：整账号好友一律 skipped，汇总里单独标注 */
export function cookieExpiredResult(rt: AccountRuntime, reason: string): AccountResult {
  return {
    accountId: rt.account.id,
    alias: rt.account.alias,
    cookieExpired: true,
    aborted: false,
    reason,
    friends: rt.friends.map((f) => ({ friendId: f.id, name: f.name, status: "skipped" as const, messages: 0, reason: "cookie 失效" })),
  }
}

function skippedAll(rt: AccountRuntime, reason: string): AccountResult {
  return {
    accountId: rt.account.id,
    alias: rt.account.alias,
    cookieExpired: false,
    aborted: false,
    reason,
    friends: rt.friends.map((f) => ({ friendId: f.id, name: f.name, status: "skipped" as const, messages: 0, reason })),
  }
}

/**
 * 单个好友的发送决策：retryPerFriend 次重试，成功/skip 即停；
 * 连续失败计数在这里维护，达阈值把整个跑批置为 aborted。
 */
export async function handleFriend(
  friend: FriendRow,
  state: RunState,
  drive: FriendDriver,
): Promise<FriendResult> {
  const attempts = Math.max(1, state.settings.limits.retryPerFriend + 1)
  let outcome: FriendOutcome = { status: "failed", messages: 0, reason: "未执行" }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (state.shouldStop()) return { friendId: friend.id, name: friend.name, status: "skipped", messages: 0, reason: "已请求停止" }
    try {
      outcome = await drive(friend, attempt)
    } catch (err) {
      outcome = { status: "failed", messages: 0, reason: String(err).slice(0, 200) }
    }
    if (outcome.status !== "failed") break
    if (attempt < attempts) await sleep(randMs(state.settings.gapBetweenMessagesMs))
  }

  if (outcome.status === "failed") {
    state.consecutiveFail += 1
    if (state.consecutiveFail >= state.settings.limits.consecutiveFailAbort) {
      state.aborted = true
      log.warn("连续失败达阈值，中止本次跑批", { consecutiveFail: state.consecutiveFail })
    }
  } else {
    state.consecutiveFail = 0
  }
  return { friendId: friend.id, name: friend.name, ...outcome }
}

export function summarize(
  runId: number,
  trigger: string,
  startedAt: string,
  accounts: AccountResult[],
  aborted: boolean,
): RunSummary {
  const totals = { success: 0, failed: 0, skipped: 0 }
  for (const a of accounts) for (const f of a.friends) totals[f.status] += 1
  const status: RunStatus = aborted ? "aborted" : totals.failed > 0 || totals.skipped > 0 ? "partial" : "success"
  return { runId, trigger, startedAt, finishedAt: nowISO(), status, totals, accounts }
}

async function driveFriend(
  page: Page,
  friend: FriendRow,
  pool: string[],
  s: RuntimeSettings,
  capLeft: () => number,
): Promise<FriendOutcome> {
  const opened = await openConversation(page, friend.name, s.maxScrollAttempts)
  if (!opened) return { status: "skipped", messages: 0, reason: "未找到会话" }

  const blocked = await detectBlocked(page)
  if (blocked) return { status: "failed", messages: 0, reason: `风控: ${blocked}` }
  if (s.dryRun) return { status: "skipped", messages: 0, reason: "dry-run 未发送" }

  const left = capLeft()
  if (left <= 0) return { status: "skipped", messages: 0, reason: "已达当日上限" }

  const want = randInt(s.perFriendMessages[0], Math.max(s.perFriendMessages[0], s.perFriendMessages[1]))
  const texts = sampleN(pool, Math.min(want, left), s.dedupeMessagesPerFriend)
  if (texts.length === 0) return { status: "skipped", messages: 0, reason: "无可用文案" }

  let sent = 0
  for (const text of texts) {
    const now = await detectBlocked(page)
    if (now) return { status: sent > 0 ? "success" : "failed", messages: sent, reason: `风控: ${now}` }
    await typeMessage(page, text, s.typingCps)
    await sendCurrentDraft(page, s.sendKey)
    sent += 1
    await sleep(randMs(s.gapBetweenMessagesMs))
  }
  return { status: "success", messages: sent, reason: null }
}

async function runAccount(rt: AccountRuntime, state: RunState): Promise<AccountResult> {
  const { account, friends, messages } = rt
  const s = state.settings
  const base: AccountResult = {
    accountId: account.id,
    alias: account.alias,
    cookieExpired: false,
    aborted: false,
    reason: null,
    friends: [],
  }

  const cap = account.daily_cap ?? s.limits.dailyCapPerAccount
  const capLeft = () => Math.max(0, cap - countTodaySuccess(account.id) - sentInRun.value)
  const sentInRun = { value: 0 }

  let opened
  try {
    opened = await openAccountPage(account)
  } catch (err) {
    // 打不开页面（无浏览器/网络不通）不能拖垮整批
    log.warn("打开账号页面失败，跳过该账号", { alias: account.alias, err: String(err) })
    return skippedAll(rt, `打开页面失败: ${String(err).slice(0, 120)}`)
  }
  const { page, context } = opened
  try {
    if (!(await ensureLoggedIn(page))) {
      log.warn("账号未登录/cookie 失效", { alias: account.alias })
      return cookieExpiredResult(rt, "cookie 失效/未登录")
    }
    const blocked = await detectBlocked(page)
    if (blocked) {
      log.warn("登录即命中风控，停止该账号", { alias: account.alias, blocked })
      state.aborted = true
      return { ...base, aborted: true, reason: `风控: ${blocked}`, friends: skippedAll(rt, `风控: ${blocked}`).friends }
    }
    if (cap <= 0 || countTodaySuccess(account.id) >= cap) {
      log.info("已达当日上限，跳过该账号", { alias: account.alias, cap })
      return skippedAll(rt, "已达当日上限")
    }

    const order = s.shuffleFriends ? shuffle(friends) : friends
    const result: AccountResult = { ...base, friends: [] }
    for (const friend of order) {
      if (state.aborted || state.shouldStop()) {
        result.friends.push({ friendId: friend.id, name: friend.name, status: "skipped", messages: 0, reason: "跑批已停止" })
        addRunItem({ run_id: state.runId, account_id: account.id, friend_id: friend.id, friend_name: friend.name, status: "skipped", messages: 0, reason: "跑批已停止" })
        continue
      }
      const fr = await handleFriend(friend, state, (f) => driveFriend(page, f, messages, s, capLeft))
      result.friends.push(fr)
      addRunItem({ run_id: state.runId, account_id: account.id, friend_id: friend.id, friend_name: friend.name, status: fr.status, messages: fr.messages, reason: fr.reason })
      if (fr.messages > 0) {
        sentInRun.value += fr.messages
        await sleep(randMs(s.gapBetweenFriendsMs))
      }
    }
    touchAccountRun(account.id)
    return result
  } finally {
    await context.close().catch((err: unknown) => log.warn("关闭账号上下文失败", { err: String(err) }))
  }
}

export async function runOnce(trigger = "manual"): Promise<RunSummary> {
  if (running) throw new Error("已有跑批在进行中")
  running = true
  resetStop()
  const startedAt = nowISO()
  let summary: RunSummary
  try {
    const cfg = loadRunConfig()
    const runId = createRun(trigger)
    const state: RunState = {
      runId,
      settings: cfg.settings,
      consecutiveFail: 0,
      aborted: false,
      shouldStop: () => stopRequested,
    }
    const accounts: AccountResult[] = []
    for (const rt of cfg.accounts) {
      if (state.aborted || state.shouldStop()) break
      accounts.push(await runAccount(rt, state))
      if (state.aborted || state.shouldStop()) break
      await sleep(randMs(cfg.settings.gapBetweenAccountsMs))
    }
    summary = summarize(runId, trigger, startedAt, accounts, state.aborted || stopRequested)
    finishRun(runId, summary.status, summary)
  } finally {
    await closeAllBrowsers()
    running = false
  }
  log.info("跑批完成", { status: summary.status, totals: summary.totals, ms: Date.parse(summary.finishedAt) - Date.parse(summary.startedAt) })
  await notifyRun(loadRunConfig().settings, summary)
  return summary
}
