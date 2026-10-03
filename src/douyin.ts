import type { Locator, Page } from "playwright"
import { log } from "./logger"
import { SEL } from "./selectors"
import { foldSpace, randInt, sleep } from "./util"

/**
 * 会话项首行即备注/昵称，精确匹配（空白折叠后）。
 * 为什么折叠：实测抖音在昵称里渲染的是 U+00A0（字符码 160），而控制台里
 * 粘贴/输入的是普通空格（码 32）。不比这一下，每个好友都匹配不上，整批只会
 * 得到"未找到会话"——工具等于完全不能用。折叠只统一空白的形态，不改变精确
 * 匹配的性质："张 三"仍不等于"张三"，空格的有无是名字的一部分。
 * text 允许 undefined：抖音会话列表是虚拟滚动，`allInnerTexts()`（底层 $$eval）
 * 在列表重渲染时会对已脱离文档的节点返回 undefined。宁可不匹配，不能抛。
 */
export function matchName(text: string | undefined, name: string): boolean {
  if (typeof text !== "string") return false
  const first = foldSpace(
    text
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? "",
  )
  return first === foldSpace(name)
}

export function findConversationIndex(texts: Array<string | undefined>, name: string): number {
  return texts.findIndex((t) => matchName(t, name))
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

/**
 * 登录按钮/链接是否可见。
 * 用 role 而不是全文本文案：已登录首页上「登录」文案仍有 1 处命中（隐藏节点），
 * 但可见按钮里没有它；未登录页则有名为「登录」的按钮。按 role 取可见项才不会误判。
 */
async function loginEntryVisible(page: Page, timeout = 1500): Promise<boolean> {
  const re = new RegExp(SEL.loginText.join("|"))
  for (const role of ["button", "link"] as const) {
    try {
      await page.getByRole(role, { name: re }).first().waitFor({ state: "visible", timeout })
      return true
    } catch {
      /* 试下一个 role */
    }
  }
  return false
}

export async function ensureLoggedIn(page: Page): Promise<boolean> {
  await page.goto(SEL.homeUrl, { waitUntil: "domcontentloaded" })
  await sleep(1000)
  if (page.url().includes("login")) return false
  return !(await loginEntryVisible(page))
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
 * 收尾：重置上一个好友留下的聊天弹层。
 *
 * 实测（2026-10-03 探针 + 真机 run 18/20，已登录态）：
 * - 点开会话后 `[data-stack-layer='chat']` 盖住整个 IM 面板：会话项 locator 仍能
 *   解析到、元素可见，但点击被 "subtree intercepts pointer events" 挡死。多好友
 *   连续跑时，第二个好友起全部记成"未找到会话"，真因是点击被拦（run 18 复现）；
 * - Escape 关不掉这层；直接重开「消息」入口也关不掉；
 * - 点 im-entry 能把 IM 面板收起，但紧接着重开入口会把面板恢复成聊天态——
 *   第二个好友的点击照样被拦（run 20 复现），所以收起/重开这套不做；
 * - reload 能把所有 stack layer 清掉，之后 openConversation 的既有兜底重新点开
 *   「消息」入口即可看到可点的会话列表（探针验证），是唯一走到确定状态的路径。
 */
export async function closeChatLayer(page: Page): Promise<void> {
  if (!(await chatLayerVisible(page))) return
  // reload 失败不抛：最坏退回旧行为（这个好友未找到会话），不拖垮整批
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined)
}

/**
 * 聊天弹层当前是否可见。这层在 DOM 里常驻，关闭时只是 display:none，
 * 所以必须看计算样式，不能只问"元素在不在"。
 * 回调在浏览器里执行，但本 tsconfig 不含 DOM lib，DOM 全局量统一经 globalThis 取；
 * 选择器必须经 arg 传进去——evaluate 只序列化函数体，闭包里的自由变量（SEL）
 * 在页面上下文不存在，直接在函数体引用会 ReferenceError（实测踩过）。
 */
async function chatLayerVisible(page: Page): Promise<boolean> {
  const sel = SEL.chatLayer.join(", ")
  return page.evaluate((s: string) => {
    const g = globalThis as unknown as {
      document: { querySelector: (sel: string) => { getBoundingClientRect: () => { width: number; height: number } } | null }
      getComputedStyle: (el: unknown) => { visibility: string; display: string }
    }
    const chat = g.document.querySelector(s)
    if (!chat) return false
    const r = chat.getBoundingClientRect()
    const style = g.getComputedStyle(chat)
    return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none"
  }, sel)
}

/**
 * 方案 A：先点开 IM 弹层，再按备注精确匹配点击会话；找不到则滚动 maxScroll 次后放弃。
 * 抖音列表是虚拟滚动，条数不变但内容会变，因此以可见文案签名判断是否已到列表末尾。
 * 弹层是否打开用"有会话项"判断——消息面板不换路由，URL 永远是首页。
 */
export async function openConversation(page: Page, friendName: string, maxScroll: number): Promise<boolean> {
  // 上一个好友的聊天弹层会盖住整个面板，不先收起来，这个好友的会话项一个也点不动
  await closeChatLayer(page)
  let anchor = await firstVisible(page, SEL.conversationItem)
  if (!anchor) {
    const entry = (await firstVisible(page, SEL.imEntry)) ?? page.getByText(new RegExp(SEL.messageEntryText.join("|"))).first()
    try {
      await entry.click({ timeout: 5000 })
      await sleep(1500)
    } catch (err) {
      log.warn("点击「消息」入口失败", { friend: friendName, err: String(err) })
      return false
    }
    anchor = await firstVisible(page, SEL.conversationItem)
  }
  if (!anchor) {
    log.warn("未找到会话列表容器", { friend: friendName })
    return false
  }

  const items = page.locator(SEL.conversationItem.join(", "))
  let prevSig = ""
  for (let attempt = 0; attempt <= maxScroll; attempt++) {
    const texts = await items.allInnerTexts()
    // 虚拟列表重渲染会吐出 undefined；出现即说明取文本这步不稳，要留痕不能静默跳过
    const nonString = texts.filter((t) => typeof t !== "string").length
    if (nonString > 0) log.warn("会话项文本取到非字符串", { friend: friendName, nonString, total: texts.length })
    const idx = findConversationIndex(texts, friendName)
    if (idx >= 0) {
      try {
        await items.nth(idx).click({ timeout: 5000 })
        await sleep(800)
        return true
      } catch (err) {
        log.warn("点击会话失败", { friend: friendName, err: String(err) })
        return false
      }
    }
    const sig = texts.join("|")
    if (sig === prevSig) {
      log.warn("会话列表已到末尾仍未找到", { friend: friendName, attempts: attempt })
      return false
    }
    prevSig = sig
    await anchor.hover().catch(() => undefined)
    await page.mouse.wheel(0, 800)
    await sleep(600)
  }
  log.warn("滚动次数用尽仍未找到会话", { friend: friendName, maxScroll })
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
 * 发送：抖音网页版 IM 只能用回车发送（设置里不可切换），
 * 所以不找发送按钮——按钮是 svg、无 aria-label，点了反而多一层不稳定。
 */
export async function sendCurrentDraft(page: Page): Promise<void> {
  await page.keyboard.press("Enter")
}

