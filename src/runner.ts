import type { BrowserContext, Page } from "playwright"
import type { AccountPage } from "./browser"
import { accountProxy, closeAccountBrowser, closeAllBrowsers, openAccountPage } from "./browser"
import { loadRunConfig } from "./config"
import { nowISO } from "./db"
import { detectBlocked, openChatPage, openFriendChat, sendTextMessage } from "./douyin"
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
import { pick, randMs, shuffle, sleep } from "./util"

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

/** 新一轮运行开始时清掉上一轮的停止标记 */
export function resetStop(): void {
  stopRequested = false
}

type FriendOutcome = { status: ItemStatus; messages: number; reason: string | null }
type FriendDriver = (friend: FriendRow, attempt: number) => Promise<FriendOutcome>

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
 * 把账号结果里的每个好友明细落成 run_items。所有路径统一在这里落账——
 * 包括 cookie 失效/已达当日上限/打不开页面/风控这些账号级提前返回，
 * 否则 summary 里记了 skipped，日志页却一条明细都看不到（用户实测撞过：
 * 「部分失败」展开只有成功的那条，失败原因无影踪）。
 */
export function persistAccountItems(runId: number, accountId: number, friends: FriendResult[]): void {
  for (const f of friends) {
    addRunItem({
      run_id: runId,
      account_id: accountId,
      friend_id: f.friendId,
      friend_name: f.name,
      status: f.status,
      messages: f.messages,
      reason: f.reason,
    })
  }
}

/**
 * 单个好友的发送决策：retryPerFriend 次重试，成功/skip 即停；
 * 连续失败计数在这里维护，达阈值把整个运行置为 aborted。
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
    // 重试前的停顿用好友间隔：消息间隔随"每好友多条"一起删了，
    // 这里不能留空——连续失败时不喘口气就是连续风控面
    if (attempt < attempts) await sleep(randMs(state.settings.gapBetweenFriendsMs))
  }

  if (outcome.status === "failed") {
    state.consecutiveFail += 1
    if (state.consecutiveFail >= state.settings.limits.consecutiveFailAbort) {
      state.aborted = true
      log.warn("连续失败达阈值，中止本次运行", { consecutiveFail: state.consecutiveFail })
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

/**
 * 给一个好友挑本轮要发的那一条文案。**每个好友每轮固定只发 1 条**
 * （用户 2026-10-05 口径：消息条数旋钮整个删掉）——过去 perFriendMessages
 * 是 [1,N] 随机，配上 retryPerFriend 会出现"设了 1 条却发了好几条"，
 * 真人好友被反复打扰，这个能力不值得留。
 *
 * 池子的归属规则（用户口径）：**账号有专属文案就不碰全局**——专属是这个
 * 账号的，全局只服务没有专属的账号。专属非空时只用专属池，专属不够就
 * 少发几条，绝不用全局垫数。
 *
 * used 是本轮运行里**前面好友已经挑走**的文案：同账户多好友优先发不同
 * 的（用户实测两个好友收到同一文案）。专属池被轮空时，还在专属池里随机
 * 抽（用户 21:44 口径：宁可对两个人说同一句专属，也不跳过、也不落全局）。
 * 只有落到全局池时，轮空同样随机补足——没得发比重复更糟。两个池都空返回
 * null，调用方据此跳过该好友。
 */
export function pickFriendText(
  messages: readonly string[],
  fallback: readonly string[],
  used: ReadonlySet<string> = new Set(),
): string | null {
  const pool = messages.length > 0 ? messages : fallback
  if (pool.length === 0) return null
  const avail = pool.filter((t) => !used.has(t))
  // 池子被前面好友轮空：在本池内随机补足（可能和别的好友重复），
  // 但绝不去另一个池——池的归属是硬规则
  return pick(avail.length > 0 ? avail : pool)
}

async function driveFriend(
  page: Page,
  friend: FriendRow,
  pool: string[],
  fallback: string[],
  s: RuntimeSettings,
  capLeft: () => number,
  used: Set<string>,
): Promise<FriendOutcome> {
  const opened = await openFriendChat(page, friend.name)
  if (!opened.ok) return { status: "skipped", messages: 0, reason: opened.reason }

  const blocked = await detectBlocked(page)
  if (blocked) return { status: "failed", messages: 0, reason: `风控: ${blocked}` }

  if (capLeft() <= 0) return { status: "skipped", messages: 0, reason: "已达当日上限" }

  // 每个好友每轮只发 1 条
  const text = pickFriendText(pool, fallback, used)
  // 只有"这个账号一条文案都没有"才会走到这里：专属空→走全局，全局也空
  if (text === null) return { status: "skipped", messages: 0, reason: "无可用文案" }
  // 挑完就登记：同账户下一个好友不再挑到同一条（多好友不发重复文案）
  used.add(text)
  log.info("挑选本轮文案", { friend: friend.name, own: pool.length, fallback: fallback.length, text })

  const now = await detectBlocked(page)
  if (now) return { status: "failed", messages: 0, reason: `风控: ${now}` }
  const r = await sendTextMessage(page, text, s.typingCps)
  if (!r.ok) return { status: "failed", messages: 0, reason: r.reason }
  // 发送状态不确定但按已发送计数的留痕：成功也有非空 reason，落 run_items 可查
  return { status: "success", messages: 1, reason: r.uncertain ?? null }
}

/**
 * 打开账号的聊天页，拿到能开工的 page/context。
 *
 * openChatPage 内部只有页面级重试（3 次尝试 + 1 次 reload），治得了 SPA 慢
 * 渲染，治不了进程级故障（渲染进程卡死、context 内存膨胀）——那类在同一
 * Chromium 里 reload 多少次都还是老样子。所以 not_ready 时在这里关掉整个
 * 浏览器再开一次（用户 2026-10-08 服务器实测：一个账号 5 个好友全被
 * 「私信页面未就绪」跳过，手动重跑却完全正常，正是这类一次性故障）。
 *
 * 边界：
 * - 只有 not_ready 值得重开。cookie 失效（含登录域落地）/风控重开无益，
 *   前者 Cookie 相同再注入还是失效，后者多开一次只多一次风控面；
 * - 有界：最多一次重开，且重开前判停止信号，不吃掉优雅停机的预算；
 * - 每轮 openAccountPage 失败（无浏览器/网络不通）单独接住，不拖垮整批。
 */
const CHAT_REOPEN_ATTEMPTS = 2
/** 重开前的停顿：给可能的抖音侧风控墙一点自愈时间，也避开"连续开关"的形态 */
const CHAT_REOPEN_PAUSE_MS = 5000

type ChatOpenResult =
  | { ok: true; page: Page; context: BrowserContext }
  | { ok: false; result: AccountResult }

/** 关账号 context：失败只 warn 不带进结果——收尾失败不能盖过发送结论 */
async function closeContext(context: BrowserContext): Promise<void> {
  await context.close().catch((err: unknown) => log.warn("关闭账号上下文失败", { err: String(err) }))
}

async function openChatPageForAccount(rt: AccountRuntime, state: RunState, base: AccountResult): Promise<ChatOpenResult> {
  const { account } = rt
  for (let attempt = 1; attempt <= CHAT_REOPEN_ATTEMPTS; attempt++) {
    let opened: AccountPage
    try {
      opened = await openAccountPage(account)
    } catch (err) {
      log.warn("打开账号页面失败，跳过该账号", { alias: account.alias, err: String(err) })
      return { ok: false, result: skippedAll(rt, `打开页面失败: ${String(err).slice(0, 120)}`) }
    }
    const chat = await openChatPage(opened.page)
    if (chat.ok) return { ok: true, page: opened.page, context: opened.context }
    // 除成功外的所有出路都先收掉这一轮的 context，再决定账号结果
    await closeContext(opened.context)
    if (chat.kind === "risk") {
      log.warn("私信页命中风控，停止该账号", { alias: account.alias, blocked: chat.blocked })
      state.aborted = true
      return {
        ok: false,
        result: {
          ...base,
          aborted: true,
          reason: `风控: ${chat.blocked}`,
          friends: skippedAll(rt, `风控: ${chat.blocked}`).friends,
        },
      }
    }
    if (chat.kind === "login") {
      log.warn("账号未登录/cookie 失效", { alias: account.alias })
      return { ok: false, result: cookieExpiredResult(rt, "cookie 失效/未登录") }
    }
    // not_ready：关掉浏览器重开一次（最后一次不关，留给上面的 closeContext 已收尾）
    const canReopen = attempt < CHAT_REOPEN_ATTEMPTS && !state.shouldStop()
    log.warn(canReopen ? "私信页面未就绪，关闭浏览器重开" : "私信页面未就绪，跳过该账号", { alias: account.alias, attempt })
    if (!canReopen) return { ok: false, result: skippedAll(rt, "私信页面未就绪") }
    // 摘掉浏览器实例，下一次 openAccountPage 才会真正重新 launch 而不是复用老进程
    await closeAccountBrowser(accountProxy(account))
    await sleep(CHAT_REOPEN_PAUSE_MS)
  }
  // CHAT_REOPEN_ATTEMPTS >= 1 时循环内必定 return，这里只为让类型收口
  return { ok: false, result: skippedAll(rt, "私信页面未就绪") }
}

async function runAccount(rt: AccountRuntime, state: RunState): Promise<AccountResult> {
  const { account, friends, messages, fallbackMessages } = rt
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

  const gate = await openChatPageForAccount(rt, state, base)
  if (!gate.ok) return gate.result
  const chatPage = gate.page
  const context = gate.context
  try {
    const blocked = await detectBlocked(chatPage)
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
    // 本轮这个账号已挑走的文案：同账户多好友不发同一条（跨好友去重）
    const usedTexts = new Set<string>()
    for (const friend of order) {
      if (state.aborted || state.shouldStop()) {
        result.friends.push({ friendId: friend.id, name: friend.name, status: "skipped", messages: 0, reason: "运行已停止" })
        continue
      }
      const fr = await handleFriend(friend, state, (f) => driveFriend(chatPage, f, messages, fallbackMessages, s, capLeft, usedTexts))
      result.friends.push(fr)
      if (fr.messages > 0) {
        sentInRun.value += fr.messages
        await sleep(randMs(s.gapBetweenFriendsMs))
      }
    }
    touchAccountRun(account.id)
    return result
  } finally {
    await closeContext(context)
  }
}

export async function runOnce(trigger = "manual"): Promise<RunSummary> {
  if (running) throw new Error("已有运行在进行中")
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
    for (const [i, rt] of cfg.accounts.entries()) {
      if (state.aborted || state.shouldStop()) break
      const result = await runAccount(rt, state)
      // 明细统一在这里落账：正常路径与账号级跳过（cookie 失效等）都要有痕
      persistAccountItems(runId, rt.account.id, result.friends)
      accounts.push(result)
      if (state.aborted || state.shouldStop()) break
      // 账号间隔只该落在账号之间：最后一个账号后再睡 30-90s 是纯浪费，
      // 连 notifyRun 推送都一起被拖晚（实测单账号运行 92.8s 里有 60s 花在这）
      if (i < cfg.accounts.length - 1) await sleep(randMs(cfg.settings.gapBetweenAccountsMs))
    }
    summary = summarize(runId, trigger, startedAt, accounts, state.aborted || stopRequested)
    finishRun(runId, summary.status, summary)
  } finally {
    await closeAllBrowsers()
    running = false
  }
  log.info("运行完成", { status: summary.status, totals: summary.totals, ms: Date.parse(summary.finishedAt) - Date.parse(summary.startedAt) })
  await notifyRun(loadRunConfig().settings, summary)
  return summary
}
