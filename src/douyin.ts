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

/** 文案是否可见：getByText 的字符串是字面匹配，多个文案必须传 RegExp */
async function textVisible(page: Page, re: RegExp, timeout = 2000): Promise<boolean> {
  try {
    await page.getByText(re).first().waitFor({ state: "visible", timeout })
    return true
  } catch {
    return false
  }
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
 * 方案 A：先点开 IM 弹层，再按备注精确匹配点击会话；找不到则滚动 maxScroll 次后放弃。
 * 抖音列表是虚拟滚动，条数不变但内容会变，因此以可见文案签名判断是否已到列表末尾。
 * 弹层是否打开用"有会话项"判断——消息面板不换路由，URL 永远是首页。
 */
export async function openConversation(page: Page, friendName: string, maxScroll: number): Promise<boolean> {
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

