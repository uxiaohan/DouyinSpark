import type { Locator, Page } from "playwright"
import { log } from "./logger"
import { SEL } from "./selectors"
import { foldSpace, randInt, sleep } from "./util"

/**
 * 2026-10-04 起的整体架构：跑抖音专用聊天页 https://www.douyin.com/chat，
 * 不再在首页点「消息」入口开 overlay。
 *
 * 为什么换（用户服务器 Docker 实测 6 好友 3 个"未找到会话"、1 个假成功）：
 * - 首页 overlay 那套有三重脆弱性：聊天弹层盖住会话列表导致点击被拦（run 18/20
 *   真机复现）、虚拟列表滚动匹配、SPA 异步挂载。容器里 bundled Chromium 的时序
 *   把三重全部放大；/chat 页会话列表与聊天面板并排，弹层拦截这一类结构上不存在
 *   （探针实测：聊天面板开着时点第二个会话项，命中测试的最上层元素就是会话行本身）；
 * - 好友优先搜索框找人，会话列表直点只作兜底，滚动匹配整条路径删掉；
 * - 发送确认改成终态状态机：气泡出现≠成功，抖音先渲染气泡、后解析发送状态，
 *   盯着失败标记（红 ! / 发送失败 / 重试）和转圈 spinner，稳定才算数。
 */

/**
 * 给"已存在的本人气泡"打锚点：发送后新气泡就是没有该属性的那条。
 * 导出供校准探针与单测直接引用（改名字要同步 selectors/测试）。
 */
export const SEEN_ATTR = "data-dsp-seen"

/** 单条消息发送确认的总预算；超时不判成功，交给调用方按草稿兜底 */
const SEND_CONFIRM_TIMEOUT_MS = 15_000
/** 轮询间隔 */
const SEND_POLL_MS = 300
/**
 * 新气泡的初始观察窗：刚挂上的气泡是干净的也不算成功——抖音会晚一步挂上
 * spinner/重试标记，必须持续观察整个窗口（参考项目 Issue #11 的教训）。
 */
const SEND_INITIAL_GRACE_MS = 2_000
/** spinner 消失后的稳定窗口：重试标记可能晚于 spinner 一步挂上 */
const SEND_STABLE_MS = 500
/** 打字后等草稿落定的窗口：contenteditable 的输入是异步进 DOM 的 */
const DRAFT_VERIFY_MS = 3_000

/** 发送结果 */
export type SendVerdict = "sent" | "failed" | "uncertain"

/**
 * 终态确认的时间参数。生产走默认值；测试注入小值把 15s 的确认预算压下来，
 * 否则新状态机的回归每条要跑几十秒，没人会跑它。
 */
export type SendTimings = {
  confirmTimeoutMs?: number
  initialGraceMs?: number
  stableMs?: number
  /** 打字后等草稿落定的窗口，默认 3s */
  draftVerifyMs?: number
}

/** 发给调用方的发送结果：uncertain 已按草稿兜底裁掉，只剩确定结论 */
export type SendResult =
  | { ok: true; uncertain?: string }
  | { ok: false; reason: string }

/** 打开好友会话的结果，reason 原样落 run_items */
export type OpenFriendFailReason = "未找到好友会话" | "会话打开未确认"
export type OpenFriendResult = { ok: true } | { ok: false; reason: OpenFriendFailReason }

/** 打开聊天页的结果：风控要停整个账号，登录失效走 cookie 失效 semantics */
export type ChatPageResult =
  | { ok: true }
  | { ok: false; kind: "risk"; blocked: string }
  | { ok: false; kind: "login" }
  | { ok: false; kind: "not_ready" }

/** 打开尝试的中间状态：打开了 / 找到了但没确认 / 没找到 */
type OpenAttempt = "opened" | "unconfirmed" | "not_found"

/** 搜索结果行的最长等待：SPA 异步渲染，等不到就当日友没找到 */
const SEARCH_SETTLE_MS = 2_500

/** 会话项首行即备注/昵称，精确匹配（空白折叠后）。 */
export function matchName(text: string | undefined, name: string): boolean {
  if (typeof text !== "string") return false
  return foldSpace(firstLine(text)) === foldSpace(name)
}

export function findConversationIndex(texts: Array<string | undefined>, name: string): number {
  return texts.findIndex((t) => matchName(t, name))
}

/**
 * 会话标题匹配：精确，或群聊的「名字(N)」人数后缀。
 * 为什么要后缀：实测「喝水」是 13 人群，聊天头部标题渲染成「喝水(13)」，
 * 而搜索框结果标题和会话列表里都是裸名。全角括号同样容忍。
 */
export function matchFriendTitle(text: string | undefined, name: string): boolean {
  if (typeof text !== "string") return false
  // 自己就取首行：调用方大多已经取过（幂等），但漏了也不能把
  // 「喝水(13)\n13」整串拿去比——群聊头部是名字一行、人数一行
  const folded = foldSpace(firstLine(text))
  if (folded === foldSpace(name)) return true
  const re = new RegExp(`^${escapeName(foldSpace(name))}\\s*[(（]\\s*\\d+\\s*[)）]$`)
  return re.test(folded)
}

/** 取首行非空文本：会话项/头部标题的第一行才是名字，其余行是时间/未读数 */
function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? ""
  )
}

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** 选择器漂移的兜底：逐个候选等待可见，取第一个；全不可见返回 null */
async function firstVisible(page: Page, selectors: readonly string[], timeout = 1500): Promise<Locator | null> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    try {
      await loc.waitFor({ state: "visible", timeout })
      return loc
    } catch {
      /* 该候选无效/不可见，试下一个 */
    }
  }
  return null
}

/** 若干文案任一可见即 true（登录失效标记用） */
async function anyTextVisible(page: Page, texts: readonly string[]): Promise<boolean> {
  for (const t of texts) {
    try {
      await page.getByText(t, { exact: false }).first().waitFor({ state: "visible", timeout: 800 })
      return true
    } catch {
      /* 试下一个 */
    }
  }
  return false
}

export async function detectBlocked(page: Page): Promise<string | null> {
  let body = ""
  try {
    body = await page.locator("body").innerText({ timeout: 3000 })
  } catch {
    return null
  }
  for (const t of SEL.captchaText) if (body.includes(t)) return t
  return null
}

/**
 * 打开专用聊天页并确认可用。
 *
 * /chat 是 SPA，domcontentloaded 之后搜索框才异步挂载，冷启动时可能超过单轮
 * 等待窗口。这里做有限次数重试（第一次失败 reload 一次），避免把慢渲染误判成
 * 登录失效——「搜索框没来」和「登录掉了」在过去是混在一起的，用户看到的
 * 「cookie 失效」里有相当一部分其实是页面还没渲染完。
 */
export async function openChatPage(page: Page): Promise<ChatPageResult> {
  await page.goto(SEL.chatUrl, { waitUntil: "domcontentloaded", timeout: 45000 })
  for (let attempt = 1; attempt <= 3; attempt++) {
    const blocked = await detectBlocked(page)
    if (blocked) return { ok: false, kind: "risk", blocked }
    if (await anyTextVisible(page, SEL.loginRequiredText)) return { ok: false, kind: "login" }
    if (await firstVisible(page, SEL.searchInput, 3000)) {
      // 搜索框首帧可能还不可交互，缓一拍再开工
      await sleep(1500)
      return { ok: true }
    }
    if (attempt < 3) {
      log.warn("私信页搜索框未就绪，重试", { attempt })
      if (attempt === 1) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => undefined)
      } else {
        await sleep(2000)
      }
    }
  }
  return { ok: false, kind: "not_ready" }
}

/**
 * 打开一个好友的会话：搜索框找人为主，会话列表直点为辅。
 * 两条路都要求「聊天头部标题匹配」才算打开——点击没抛错不算数（老代码正是
 * 这么判的，用户服务器上因此出现假"未找到"反过来也出现过假成功）。
 */
export async function openFriendChat(page: Page, friendName: string, confirmTimeoutMs = 8000): Promise<OpenFriendResult> {
  const viaSearch = await openFromSearch(page, friendName, confirmTimeoutMs)
  if (viaSearch === "opened") return { ok: true }
  // 搜索没搞定：清空搜索框回到列表态，再试会话列表直点
  await clearSearch(page)
  const viaList = await openFromList(page, friendName, confirmTimeoutMs)
  if (viaList === "opened") return { ok: true }
  return { ok: false, reason: viaSearch === "unconfirmed" || viaList === "unconfirmed" ? "会话打开未确认" : "未找到好友会话" }
}

/** 搜索框填名字，在结果行里按标题精确（或群后缀）匹配，点「发消息」 */
async function openFromSearch(page: Page, friendName: string, confirmTimeoutMs: number): Promise<OpenAttempt> {
  const search = await firstVisible(page, SEL.searchInput, 1500)
  if (!search) return "not_found"
  try {
    await search.click({ timeout: 3000 })
    await search.fill("")
    await search.fill(friendName)
  } catch (err) {
    log.warn("搜索框填写失败", { friend: friendName, err: String(err) })
    return "not_found"
  }
  await sleep(500)
  const rows = page.locator(SEL.searchResultBox.join(", "))
  // 搜索是 SPA 异步出的：轮询等结果行，而不是一刀切睡死——结果早到了立刻走，
  // 抖音慢了也多等一会儿（固定 sleep 两种天气都吃亏）
  const settleEnd = Date.now() + SEARCH_SETTLE_MS
  let n = 0
  while (Date.now() < settleEnd) {
    n = await rows.count().catch(() => 0)
    if (n > 0) break
    await sleep(200)
  }
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i)
    const title = await row
      .locator(SEL.searchResultTitle.join(", "))
      .first()
      .innerText({ timeout: 1000 })
      .catch(() => "")
    if (!matchFriendTitle(firstLine(title), friendName)) continue
    try {
      const btn = row.locator(SEL.searchResultChatBtn.join(", ")).first()
      if (await btn.count()) await btn.click({ force: true, timeout: 5000 })
      else await row.click({ force: true, timeout: 5000 })
    } catch (err) {
      log.warn("点击搜索结果失败", { friend: friendName, err: String(err) })
      return "unconfirmed"
    }
    return (await confirmChatOpen(page, friendName, confirmTimeoutMs)) ? "opened" : "unconfirmed"
  }
  return "not_found"
}

/** 兜底：会话列表第一屏里按备注精确匹配直点（/chat 上无遮挡，force 双保险） */
async function openFromList(page: Page, friendName: string, confirmTimeoutMs: number): Promise<OpenAttempt> {
  const items = page.locator(SEL.conversationItem.join(", "))
  const texts = await items.allInnerTexts().catch(() => [] as string[])
  const idx = findConversationIndex(texts, friendName)
  if (idx < 0) return "not_found"
  try {
    await items.nth(idx).click({ force: true, timeout: 5000 })
  } catch (err) {
    log.warn("点击会话列表项失败", { friend: friendName, err: String(err) })
    return "unconfirmed"
  }
  return (await confirmChatOpen(page, friendName, confirmTimeoutMs)) ? "opened" : "unconfirmed"
}

/** 清空搜索框回到完整会话列表态 */
async function clearSearch(page: Page): Promise<void> {
  const search = await firstVisible(page, SEL.searchInput, 1000)
  if (!search) return
  await search.fill("").catch(() => undefined)
  await sleep(800)
}

/** 轮询聊天头部标题：可见且匹配目标名，同时输入框在位，才算真的打开了 */
async function confirmChatOpen(page: Page, friendName: string, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const header = await firstVisible(page, SEL.chatHeaderTitle, 500)
    if (header) {
      const title = await header.innerText().catch(() => "")
      if (matchFriendTitle(firstLine(title), friendName) && (await firstVisible(page, SEL.messageInput, 500))) {
        return true
      }
    }
    await sleep(400)
  }
  return false
}

export async function clearInput(page: Page): Promise<void> {
  await page.keyboard.press("Control+A")
  await page.keyboard.press("Backspace")
}

/** 逐字插入 + 每字随机停顿，模拟真人输入 */
export async function typeMessage(page: Page, text: string, typingCps: [number, number]): Promise<void> {
  const input = await firstVisible(page, SEL.messageInput)
  if (!input) throw new Error("未找到消息输入框")
  await input.click()
  await clearInput(page)
  const cps = randInt(typingCps[0], Math.max(typingCps[0], typingCps[1]))
  const base = Math.max(20, Math.round(1000 / Math.max(1, cps)))
  for (const ch of text) {
    await page.keyboard.insertText(ch)
    await sleep(Math.max(10, base + randInt(-15, 15)))
  }
}

/**
 * 发一条文字消息并确认结果。
 *
 * 老代码是「typeMessage → 回车 → sent += 1」，从不验证，用户服务器实测出现过
 * 显示 success 实则没发出去（假成功不触发重试还白吃当日上限）。现在：
 * 1. 打字后先确认草稿里真有这段文字，没有就不发（发了也是白发）；
 * 2. 给当前已存在的本人气泡打锚点，发送后只认新出现的那条；
 * 3. 优先点发送按钮（/chat 实测存在），找不到才回车；
 * 4. 终态状态机确认，见 confirmSent。
 */
export async function sendTextMessage(
  page: Page,
  text: string,
  typingCps: [number, number],
  timings: SendTimings = {},
): Promise<SendResult> {
  await typeMessage(page, text, typingCps)
  const typedIn = Date.now() + (timings.draftVerifyMs ?? DRAFT_VERIFY_MS)
  while (Date.now() < typedIn) {
    const draft = await readDraft(page)
    if (draft !== null && draft.includes(text)) break
    await sleep(200)
  }
  const draft = await readDraft(page)
  if (draft === null || !draft.includes(text)) throw new Error("文字未能写入输入框")

  await markSeenOutgoing(page, text)
  await triggerSend(page)
  const verdict = await confirmSent(page, text, timings)
  if (verdict === "sent") return { ok: true }
  if (verdict === "failed") return { ok: false, reason: `发送失败: ${text}` }
  // 终态超时没等到定论：草稿已清大概率是发出去了（按已发送计数但留痕，
  // run_items 的 reason 里能看到是哪条）；草稿还在就是没出去——判失败让
  // handleFriend 的重试接手（重试重新开会话、重挑文案，不会重复发送同一条）。
  const left = await readDraft(page)
  if (left !== null && left.trim() !== "") return { ok: false, reason: `发送未确认: ${text}` }
  return { ok: true, uncertain: `发送状态不确定但草稿已清，按已发送计数: ${text}` }
}

/** 发送优先点按钮：按钮不存在/点不动才回退回车 */
async function triggerSend(page: Page): Promise<void> {
  const btn = await firstVisible(page, SEL.sendButton, 1500)
  if (btn) {
    try {
      await btn.click({ timeout: 3000 })
      return
    } catch (err) {
      log.warn("发送按钮点击失败，回退回车", { err: String(err) })
    }
  }
  await page.keyboard.press("Enter")
}

async function readDraft(page: Page): Promise<string | null> {
  const input = await firstVisible(page, SEL.messageInput, 1000)
  if (!input) return null
  return await input.innerText().catch(() => null)
}

/**
 * 页面内用的文案归一：**删掉全部空白**，不是折叠成一个空格。
 * 长消息在气泡里会被 DOM 自动换行（「在忙吗」渲染成「在忙\n吗」），
 * 折叠成空格两边就不相等，确认链永远等不到气泡，会把发成功的消息
 * 误判成 uncertain。名字匹配（matchFriendTitle）反过来必须保留空格——
 * 「张 三」≠「张三」，那是另一套归一。
 *
 * 这个归一只能内联进 evaluate 回调里：page.evaluate 是把函数源码搬到
 * 页面上下文执行的，模块作用域（SEL、常量、这个函数本身）在那边不存在
 * ——run 19 真机踩过 `SEL is not defined`，别再犯。
 */
export async function markSeenOutgoing(page: Page, text: string): Promise<void> {
  await page.evaluate(
    (arg: { outgoing: string; text: string; seen: string }) => {
      const g = globalThis as unknown as {
        document: { querySelectorAll: (s: string) => unknown[] }
      }
      const norm = (s: string) => s.replace(/[\u200B-\u200F\uFEFF]+/g, "").replace(/\s+/g, "")
      for (const el of g.document.querySelectorAll(arg.outgoing)) {
        const e = el as { innerText?: string; setAttribute: (n: string, v: string) => void }
        if (norm(e.innerText ?? "").includes(norm(arg.text))) e.setAttribute(arg.seen, "1")
      }
    },
    { outgoing: SEL.outgoingBubble, text, seen: SEEN_ATTR },
  )
}

/** 一条本人气泡在发送确认眼里的状态 */
export type BubbleState = "missing" | "failure" | "pending" | "clean"

/** 读"发送的那条气泡"当前状态：没挂上 / 有失败标记 / 在转圈 / 干净（导出供测试驱动状态机） */
export async function readBubbleState(page: Page, text: string): Promise<BubbleState> {
  return await page.evaluate(
    (arg: {
      outgoing: string
      text: string
      seen: string
      failureCss: readonly string[]
      failureText: readonly string[]
      pendingCss: readonly string[]
    }): BubbleState => {
      const g = globalThis as unknown as {
        document: { querySelectorAll: (s: string) => unknown[] }
      }
      // 与 markSeenOutgoing 同一套归一，同样必须内联（页面上下文无模块作用域）
      const norm = (s: string) => s.replace(/[\u200B-\u200F\uFEFF]+/g, "").replace(/\s+/g, "")
      type El = {
        hasAttribute: (n: string) => boolean
        querySelector: (s: string) => unknown
        innerText?: string
      }
      const all = g.document.querySelectorAll(arg.outgoing) as El[]
      const fresh = all
        .filter((el) => norm(el.innerText ?? "").includes(norm(arg.text)))
        .filter((el) => !el.hasAttribute(arg.seen))
      if (fresh.length === 0) return "missing"
      const bubble = fresh[fresh.length - 1]!
      const hit = (sel: string) => {
        try {
          return bubble.querySelector(sel) !== null
        } catch {
          return false
        }
      }
      const shown = norm(bubble.innerText ?? "")
      if (arg.failureCss.some(hit)) return "failure"
      if (arg.failureText.some((t) => shown.includes(t))) return "failure"
      if (arg.pendingCss.some(hit)) return "pending"
      return "clean"
    },
    {
      outgoing: SEL.outgoingBubble,
      text,
      seen: SEEN_ATTR,
      failureCss: SEL.sendFailureCss,
      failureText: SEL.sendFailureText,
      pendingCss: SEL.sendPendingCss,
    },
  )
}

/**
 * 终态状态机（参考项目 Issue #11 的同款 State machine）：
 *   missing   → 气泡还没挂上，继续等
 *   failure   → 页面上有失败/重试标记，判 failed（没发出去，重试安全）
 *   pending   → 转圈中，等它消失
 *   clean     → 干净；但新气泡必须干净度过整个初始观察窗才算成功——
 *               抖音会晚一步挂上 spinner/重试标记，单次干净不算数
 */
async function confirmSent(page: Page, text: string, timings: SendTimings): Promise<SendVerdict> {
  const deadline = Date.now() + (timings.confirmTimeoutMs ?? SEND_CONFIRM_TIMEOUT_MS)
  const grace = timings.initialGraceMs ?? SEND_INITIAL_GRACE_MS
  const stable = timings.stableMs ?? SEND_STABLE_MS
  // 等新气泡挂载
  while ((await readBubbleState(page, text)) === "missing") {
    if (Date.now() >= deadline) return "uncertain"
    await sleep(SEND_POLL_MS)
  }
  // 初始观察窗
  const graceEnd = Date.now() + grace
  while (Date.now() < graceEnd) {
    if (Date.now() >= deadline) return "uncertain"
    const st = await readBubbleState(page, text)
    if (st === "failure") return "failed"
    if (st === "pending") return await waitPendingClear(page, text, deadline, stable)
    await sleep(SEND_POLL_MS)
  }
  return "sent"
}

/** spinner 消失后还要稳定窗口内持续干净——重试标记可能晚于 spinner 一步挂上 */
async function waitPendingClear(page: Page, text: string, deadline: number, stable: number): Promise<SendVerdict> {
  while (true) {
    if (Date.now() >= deadline) return "uncertain"
    const st = await readBubbleState(page, text)
    if (st === "failure") return "failed"
    if (st !== "pending") {
      await sleep(stable)
      if (Date.now() >= deadline) return "uncertain"
      const settled = await readBubbleState(page, text)
      if (settled === "failure") return "failed"
      if (settled !== "pending") return "sent"
    }
    await sleep(SEND_POLL_MS)
  }
}
