import type { Locator, Page } from "playwright"
import { log } from "./logger"
import { SEL } from "./selectors"
import type { SendKey } from "./types"
import { randInt, sleep } from "./util"

/** 会话项首行即备注/昵称，精确匹配 */
export function matchName(text: string, name: string): boolean {
  const first = text
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0)
  return first === name.trim()
}

export function findConversationIndex(texts: string[], name: string): number {
  return texts.findIndex((t) => matchName(t, name))
}

/** 选择器漂移的兜底：逐个候选尝试，取第一个可见项；全不可见返回 null */
async function firstVisible(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    try {
      if (await loc.isVisible({ timeout: 1500 })) return loc
    } catch {
      /* 该候选无效/不可见，试下一个 */
    }
  }
  return null
}

export async function ensureLoggedIn(page: Page): Promise<boolean> {
  await page.goto(SEL.homeUrl, { waitUntil: "domcontentloaded" })
  await sleep(1500)
  if (page.url().includes("login")) return false
  const login = page.getByText(SEL.loginText.join("|")).first()
  try {
    if (await login.isVisible({ timeout: 2000 })) return false
  } catch {
    /* 未找到登录入口文案 */
  }
  return true
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
 * 方案 A：在会话列表中按备注精确匹配点击进入；找不到则滚动 maxScroll 次后放弃。
 * 抖音列表是虚拟滚动，条数不变但内容会变，因此以可见文案签名判断是否已到列表末尾。
 */
export async function openConversation(page: Page, friendName: string, maxScroll: number): Promise<boolean> {
  let list = await firstVisible(page, SEL.conversationList)
  if (!list) {
    const entry = page.getByText(SEL.messageEntryText.join("|")).first()
    try {
      await entry.click({ timeout: 5000 })
      await sleep(1500)
    } catch (err) {
      log.warn("点击「消息」入口失败", { friend: friendName, err: String(err) })
      return false
    }
    list = await firstVisible(page, SEL.conversationList)
  }
  if (!list) {
    log.warn("未找到会话列表容器", { friend: friendName })
    return false
  }

  const items = page.locator(SEL.conversationItem.join(", "))
  let prevSig = ""
  for (let attempt = 0; attempt <= maxScroll; attempt++) {
    const texts = await items.allInnerTexts()
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
    await list.hover().catch(() => undefined)
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

export async function sendCurrentDraft(page: Page, sendKey: SendKey): Promise<void> {
  if (sendKey === "Enter") {
    await page.keyboard.press("Enter")
    return
  }
  const btn = await firstVisible(page, SEL.sendButton)
  if (btn) {
    await btn.click({ timeout: 5000 })
    return
  }
  if (sendKey === "Click") throw new Error("未找到发送按钮")
  await page.keyboard.press("Enter")
}
