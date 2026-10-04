import { test, expect } from "bun:test"
import type { Page } from "playwright"
import {
  findConversationIndex,
  markSeenOutgoing,
  matchFriendTitle,
  matchName,
  openChatPage,
  openFriendChat,
  readBubbleState,
  sendTextMessage,
  SEEN_ATTR,
} from "./douyin"
import type { SendTimings } from "./douyin"
import { SEL } from "./selectors"

/** SEL 是 as const 的字符串字面量元组，includes(string) 过不了类型，这里统一收口 */
const selHas = (list: readonly string[], sel: string): boolean => (list as readonly string[]).includes(sel)

/* ------------------------------------------------------------------ *
 * 纯函数：会话标题匹配
 * ------------------------------------------------------------------ */

test("备注精确匹配", () => {
  expect(matchName("张三\n昨天 12:00\n在干嘛", "张三")).toBe(true)
  expect(matchName("李四", "李四")).toBe(true)
})

test("子串不算命中（张三不匹配张三丰）", () => {
  expect(matchName("张三丰", "张三")).toBe(false)
  expect(matchName("  张三  ", "张三")).toBe(true)
})

test("空行与多余空白的会话项不误命中", () => {
  expect(matchName("\n\n  王五\n消息", "王五")).toBe(true)
  expect(matchName("", "王五")).toBe(false)
})

// 回归：真实运行时 allInnerTexts()（底层 $$eval）在虚拟列表重渲染下返回过 undefined，
// matchName 直接 .split 抛 TypeError，把好友记成 failed 并累计连续失败。
test("会话项文本为 undefined 时不抛，按不匹配处理", () => {
  expect(matchName(undefined, "张三")).toBe(false)
  expect(findConversationIndex([undefined, "张三\n在吗", undefined], "张三")).toBe(1)
  expect(findConversationIndex([undefined, undefined], "张三")).toBe(-1)
})

// 回归：抖音在昵称里渲染的是不换行空格 U+00A0（实测码 160），控制台粘贴进来的是
// 普通空格 U+0020（实测码 32）。不做空白归一的话 every friend 都匹配不上，
// 全部记成"未找到"——工具等于完全不能用。
test("不换行空格与普通空格视为同一个名字", () => {
  expect(matchName("灵匠\u00a0宋泽浩\n15分钟前\n行", "灵匠 宋泽浩")).toBe(true)
  expect(matchName("灵匠 宋泽浩\n15分钟前", "灵匠\u00a0宋泽浩")).toBe(true)
  // 全角空格同理
  expect(matchName("灵匠\u3000宋泽浩", "灵匠 宋泽浩")).toBe(true)
  // 多个连续空白折叠成一个，仍是同一个名字
  expect(matchName("灵匠  宋泽浩", "灵匠 宋泽浩")).toBe(true)
})

test("空白归一不放松精确匹配：空格有无仍是两个名字", () => {
  expect(matchName("张 三", "张三")).toBe(false)
  expect(matchName("张三", "张 三")).toBe(false)
  expect(matchName("灵匠 宋泽", "灵匠 宋泽浩")).toBe(false)
})

test("findConversationIndex 返回命中下标，未命中为 -1", () => {
  const texts = ["张一\n你好", "张三\n在吗", "李四\n晚点聊"]
  expect(findConversationIndex(texts, "张三")).toBe(1)
  expect(findConversationIndex(texts, "赵六")).toBe(-1)
  expect(findConversationIndex([], "张三")).toBe(-1)
})

/* ------------------------------------------------------------------ *
 * matchFriendTitle：头部标题匹配（群聊带人数后缀）
 * ------------------------------------------------------------------ */

test("群聊头部标题容忍人数后缀：喝水 匹配 喝水(13)", () => {
  expect(matchFriendTitle("喝水(13)", "喝水")).toBe(true)
  expect(matchFriendTitle("喝水（13）", "喝水")).toBe(true) // 全角括号
  expect(matchFriendTitle("喝水 ( 13 )", "喝水")).toBe(true)
  expect(matchFriendTitle("喝水", "喝水")).toBe(true)
  // 首行取名字：群聊头部是「喝水(13)」再跟一行数字
  expect(matchFriendTitle("喝水(13)\n13", "喝水")).toBe(true)
})

test("人数后缀不放宽成子串匹配", () => {
  expect(matchFriendTitle("喝水斯基(13)", "喝水")).toBe(false)
  expect(matchFriendTitle("张三丰(2)", "张三")).toBe(false)
  // 有名无群/有群无名都算没打开对
  expect(matchFriendTitle("奥特曼", "奥特曼🎊刁刁")).toBe(false)
  expect(matchFriendTitle(undefined, "张三")).toBe(false)
  expect(matchFriendTitle("", "张三")).toBe(false)
})

/* ------------------------------------------------------------------ *
 * 假页面
 * ------------------------------------------------------------------ */

/**
 * 假气泡元素：只实现 page.evaluate 回调里用到的那几个方法。
 * markers 里的选择器会让 bubble.querySelector(sel) 命中，用来扮演
 * 失败标记 / 转圈 spinner。
 */
class FakeEl {
  attrs = new Map<string, string>()
  constructor(
    public innerText: string,
    public markers: Set<string> = new Set(),
  ) {}
  hasAttribute(n: string): boolean {
    return this.attrs.has(n)
  }
  setAttribute(n: string, v: string): void {
    this.attrs.set(n, v)
  }
  querySelector(sel: string): unknown {
    return this.markers.has(sel) ? {} : null
  }
}

type SearchRow = { title: string; hasBtn?: boolean; clickThrows?: boolean }

/**
 * NodeList 语义的查询结果：只有迭代协议和 item/length，**没有** filter/map/some。
 * 2026-10-04 真机首跑三个好友全 failed，就是因为代码对 querySelectorAll 的
 * 返回值直接 .filter，而浏览器给的是 NodeList；假件此前返回真数组所以单测全绿。
 * 假件必须比真件严，否则就是给 bug 发通行证。
 */
class FakeNodeList {
  constructor(private items: FakeEl[]) {}
  get length(): number {
    return this.items.length
  }
  item(i: number): FakeEl | null {
    return this.items[i] ?? null
  }
  [Symbol.iterator](): Iterator<FakeEl> {
    return this.items[Symbol.iterator]()
  }
}

/**
 * 最小 Page 假件：只覆盖 douyin.ts 真正调到的 API。
 *
 * 两类等待（waitFor / 固定 sleep）都没有真实时长——这里验的是分支决策，
 * 不是真实时序；真实时序只有真机跑过才算数。页面内 evaluate 是真跑的：
 * 装着假 document 执行同一个回调，状态机的归一/锚点/四态判定因此是
 * 真逻辑而不是影子实现。
 */
class FakePage {
  gotoCalls = 0
  reloadCalls = 0
  lastUrl = ""
  clicks: Array<{ sel: string; force?: boolean }> = []
  keyPresses: string[] = []
  fills: Array<{ sel: string; value: string }> = []
  searchQuery = ""
  /** 点了发送按钮或按了回车即为 true（模拟"已触发发送"） */
  triggered = false
  onReload: (() => void) | null = null

  /** 这些选择器可见（按 SEL 里的原串匹配） */
  visible = new Set<string>()
  /** selector -> innerText */
  texts = new Map<string, string>()
  /** getByText 能等到的文案 */
  shownTexts: string[] = []
  /** 搜索结果行 */
  searchRows: SearchRow[] = []
  /** 会话列表各项 innerText */
  conversationItems: string[] = []
  /** 发送前就挂在页面上的本人气泡 */
  existingBubbles: FakeEl[] = []
  /** 发送后新出现的气泡（每次读都可能不同，用来演状态机的时间线） */
  newBubble: () => FakeEl[] = () => []
  /** 输入框草稿 */
  draftValue: string | null = ""
  /** 草稿取值钩子：发送后草稿被清空这类时序靠它演（triggered 之后换个值） */
  draftFn: ((p: FakePage) => string | null) | null = null
  /** 逐字插入是否真的落进草稿（false = 模拟输入框不接收） */
  insertWritesDraft = true
  /** evaluate 抛异常（模拟页面结构变了 / NodeList 用法错误这类运行时炸点） */
  evaluateThrows = false
  /** 前几次 evaluate 照常放行：markSeenOutgoing 是第 1 次，之后才是确认链 */
  evaluateThrowsAfter = 1
  private evaluateCalls = 0

  asPage(): Page {
    return this as unknown as Page
  }

  private draft(): string | null {
    return this.draftFn ? this.draftFn(this) : this.draftValue
  }

  /** selector -> 该元素的 innerText（注意 detectBlocked 直接调 locator.innerText，不经 first） */
  private textOf(sel: string): string {
    if (sel === "body") return this.texts.get("body") ?? ""
    if (selHas(SEL.messageInput, sel)) return this.draft() ?? ""
    return this.texts.get(sel) ?? ""
  }

  private countOf(sel: string): number {
    if (sel === SEL.searchResultBox.join(", ")) return this.searchRows.length
    if (sel === SEL.conversationItem.join(", ")) return this.conversationItems.length
    return this.visible.has(sel) ? 1 : 0
  }

  private first(sel: string) {
    const self = this
    return {
      waitFor: async ({ state }: { state: string }) => {
        if (state === "visible" && !self.visible.has(sel)) throw new Error(`not visible: ${sel}`)
      },
      click: async (opts?: { force?: boolean }) => {
        if (selHas(SEL.sendButton, sel)) self.triggered = true
        self.clicks.push({ sel, force: opts?.force })
      },
      fill: async (value: string) => {
        self.fills.push({ sel, value })
        if (selHas(SEL.searchInput, sel)) self.searchQuery = value
      },
      innerText: async () => self.textOf(sel),
      count: async () => self.countOf(sel),
    }
  }

  private nth(sel: string, i: number) {
    const self = this
    const isRows = sel === SEL.searchResultBox.join(", ")
    return {
      locator: (child: string) => ({
        first: () => ({
          innerText: async () => (isRows ? (self.searchRows[i]?.title ?? "") : ""),
          count: async () => (isRows && self.searchRows[i]?.hasBtn ? 1 : 0),
          click: async () => {
            if (self.searchRows[i]?.clickThrows) throw new Error("click intercepted")
            self.clicks.push({ sel: child, force: true })
          },
        }),
      }),
      click: async (opts?: { force?: boolean }) => {
        if (isRows) {
          if (self.searchRows[i]?.clickThrows) throw new Error("click intercepted")
          self.clicks.push({ sel, force: opts?.force })
          return
        }
        if (self.conversationItems[i] === undefined) throw new Error("no such conversation")
        self.clicks.push({ sel, force: opts?.force })
      },
    }
  }

  locator(sel: string) {
    const self = this
    return {
      first: () => self.first(sel),
      count: async () => self.countOf(sel),
      innerText: async () => self.textOf(sel),
      allInnerTexts: async () => (sel === SEL.conversationItem.join(", ") ? self.conversationItems : []),
      nth: (i: number) => self.nth(sel, i),
    }
  }

  getByText(text: string) {
    const self = this
    return {
      first: () => ({
        waitFor: async ({ state }: { state: string }) => {
          const hit = self.shownTexts.some((t) => t.includes(text))
          if (state === "visible" && !hit) throw new Error(`text not visible: ${text}`)
        },
      }),
      count: async () => (self.shownTexts.some((t) => t.includes(text)) ? 1 : 0),
    }
  }

  keyboard = {
    press: async (key: string) => {
      this.keyPresses.push(key)
      if (key === "Enter") this.triggered = true
      if (key === "Backspace") this.draftValue = ""
    },
    insertText: async (t: string) => {
      if (this.insertWritesDraft) this.draftValue = (this.draftValue ?? "") + t
    },
  }

  async goto(url: string): Promise<void> {
    this.gotoCalls += 1
    this.lastUrl = url
  }

  async reload(): Promise<void> {
    this.reloadCalls += 1
    this.onReload?.()
  }

  async evaluate(fn: (arg: unknown) => unknown, arg: unknown): Promise<unknown> {
    this.evaluateCalls += 1
    if (this.evaluateThrows && this.evaluateCalls > this.evaluateThrowsAfter) {
      throw new TypeError("g.document.querySelectorAll(...).filter is not a function")
    }
    const g = globalThis as { document?: unknown }
    const prev = g.document
    g.document = {
      // NodeList 语义，和浏览器一致：没有 filter/map/some
      querySelectorAll: (sel: string) =>
        sel === SEL.outgoingBubble
          ? new FakeNodeList([...this.existingBubbles, ...(this.triggered ? this.newBubble() : [])])
          : new FakeNodeList([]),
    }
    try {
      return await fn(arg)
    } finally {
      g.document = prev
    }
  }
}

/* ------------------------------------------------------------------ *
 * openChatPage：聊天页三种结局
 * ------------------------------------------------------------------ */

test("聊天页就绪：搜索框可见即 ok，且去的是 /chat 而不是首页", async () => {
  const page = new FakePage()
  page.visible.add(SEL.searchInput[0])
  expect(await openChatPage(page.asPage())).toEqual({ ok: true })
  expect(page.gotoCalls).toBe(1)
  expect(page.lastUrl).toBe(SEL.chatUrl)
})

test("命中风控文案：判 risk 并带上命中的文案（调用方据此停整个账号）", async () => {
  const page = new FakePage()
  page.texts.set("body", "拖动下方滑块完成验证")
  expect(await openChatPage(page.asPage())).toEqual({ ok: false, kind: "risk", blocked: "拖动下方滑块" })
})

// 慢渲染与登录失效必须分开：过去"搜索框没来"被记成 cookie 失效，
// 用户看到的失效里有一大批其实只是页面还没渲染完。
test("出现登录文案：判 login 而不是 not_ready", async () => {
  const page = new FakePage()
  page.shownTexts.push("扫码登录")
  expect(await openChatPage(page.asPage())).toEqual({ ok: false, kind: "login" })
  expect(page.reloadCalls).toBe(0)
})

test("搜索框始终没来（reload 也没用）：not_ready，且只在第一次失败后 reload", async () => {
  const page = new FakePage()
  expect(await openChatPage(page.asPage())).toEqual({ ok: false, kind: "not_ready" })
  expect(page.reloadCalls).toBe(1)
})

test("第一次没就绪、reload 后就绪：ok（慢渲染不当成登录失效）", async () => {
  const page = new FakePage()
  page.onReload = () => page.visible.add(SEL.searchInput[0])
  expect(await openChatPage(page.asPage())).toEqual({ ok: true })
  expect(page.reloadCalls).toBe(1)
})

/* ------------------------------------------------------------------ *
 * openFriendChat：搜索为主、列表兜底、打开确认
 * ------------------------------------------------------------------ */

/** 构造一个"能打开好友会话"的假页面：头部标题匹配 + 输入框在位 */
function openablePage(friendName: string, headerTitle = friendName): FakePage {
  const page = new FakePage()
  page.visible.add(SEL.searchInput[0])
  page.visible.add(SEL.chatHeaderTitle[0])
  page.texts.set(SEL.chatHeaderTitle[0], headerTitle)
  page.visible.add(SEL.messageInput[0])
  page.searchRows = [{ title: friendName, hasBtn: true }]
  return page
}

test("搜索框命中：点「发消息」并等头部标题确认才算打开", async () => {
  const page = openablePage("董笑磊")
  expect(await openFriendChat(page.asPage(), "董笑磊", 800)).toEqual({ ok: true })
  expect(page.fills.some((f) => f.value === "董笑磊")).toBe(true)
  expect(page.clicks.some((c) => c.sel === SEL.searchResultChatBtn[0])).toBe(true)
})

test("群聊：搜索结果是裸名、头部带人数后缀，仍算打开对", async () => {
  const page = openablePage("喝水", "喝水(13)")
  expect(await openFriendChat(page.asPage(), "喝水", 800)).toEqual({ ok: true })
})

test("搜索结果标题不精确：不打开（张三不点张三丰）", async () => {
  const page = openablePage("董笑磊")
  page.searchRows = [{ title: "董笑磊sz", hasBtn: true }]
  page.conversationItems = ["董笑磊sz\n早"]
  expect(await openFriendChat(page.asPage(), "董笑磊", 200)).toEqual({ ok: false, reason: "未找到好友会话" })
})

test("搜索没找到：回列表直点兜底，命中即打开", async () => {
  const page = openablePage("董笑磊")
  page.searchRows = [{ title: "无关的人" }]
  page.conversationItems = ["奥特曼🎊刁刁\n在吗", "董笑磊\n早上好"]
  expect(await openFriendChat(page.asPage(), "董笑磊", 800)).toEqual({ ok: true })
  // 走兜底前先把搜索框清空，否则列表还是过滤态
  expect(page.fills.some((f) => selHas(SEL.searchInput, f.sel) && f.value === "")).toBe(true)
  const listClick = page.clicks.find((c) => c.sel === SEL.conversationItem.join(", "))
  expect(listClick?.force).toBe(true)
})

test("搜索未命中、列表也没有：未找到好友会话", async () => {
  const page = openablePage("董笑磊")
  page.searchRows = []
  page.conversationItems = ["李四\n早"]
  expect(await openFriendChat(page.asPage(), "董笑磊", 200)).toEqual({ ok: false, reason: "未找到好友会话" })
})

// 回归（用户服务器实测的"未找到好友会话"里混着一批这类）：locator 解析得到、
// 点击也不抛错，但聊天面板根本没切过去。点击没抛错不算打开，必须头部确认。
test("点了但头部没确认：unconfirmed，两条路都没确认时报「会话打开未确认」", async () => {
  const page = openablePage("董笑磊")
  page.texts.set(SEL.chatHeaderTitle[0], "另一个人")
  page.conversationItems = ["董笑磊\n早"] // 列表里其实有，但点了也不确认
  expect(await openFriendChat(page.asPage(), "董笑磊", 200)).toEqual({ ok: false, reason: "会话打开未确认" })
})

// 回归（真机 run 18/20 复现过的一类）：点击被上层元素拦死。force 也拦就是 unconfirmed，
// 绝不能当成"打开成功了"。
test("点击被拦（force 也点不动）：unconfirmed，不误判成打开", async () => {
  const page = openablePage("董笑磊")
  page.searchRows = [{ title: "董笑磊", hasBtn: true, clickThrows: true }]
  expect(await openFriendChat(page.asPage(), "董笑磊", 200)).toEqual({ ok: false, reason: "会话打开未确认" })
})

/* ------------------------------------------------------------------ *
 * sendTextMessage：终态状态机
 * ------------------------------------------------------------------ */

const MESSAGE = "在忙吗"

/** 压扁确认时序，否则状态机回归每条要跑几十秒 */
const FAST: SendTimings = { confirmTimeoutMs: 1200, initialGraceMs: 200, stableMs: 60, draftVerifyMs: 400 }

/** 按第几次读气泡返回对应状态；用完了重复最后一个 */
function bubbleScript(kinds: Array<"missing" | "failure" | "pending" | "clean">): () => FakeEl[] {
  let n = 0
  return () => {
    n += 1
    const kind = kinds[Math.min(n - 1, kinds.length - 1)]!
    if (kind === "missing") return []
    const markers =
      kind === "failure"
        ? new Set(SEL.sendFailureCss)
        : kind === "pending"
          ? new Set(SEL.sendPendingCss)
          : new Set<string>()
    return [new FakeEl(MESSAGE, markers)]
  }
}

/** 发送用例的底版：输入框在位、草稿就是本条文案、有发送按钮 */
function sendPage(): FakePage {
  const page = new FakePage()
  page.visible.add(SEL.messageInput[0])
  page.visible.add(SEL.sendButton[0])
  page.draftValue = MESSAGE
  return page
}

test("干净气泡度过整个观察窗：sent，且优先点的是发送按钮不是回车", async () => {
  const page = sendPage()
  page.newBubble = bubbleScript(["clean"])
  expect(await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).toEqual({ ok: true })
  expect(page.clicks.some((c) => selHas(SEL.sendButton, c.sel))).toBe(true)
  expect(page.keyPresses).not.toContain("Enter")
})

// 参考项目 Issue #11 的同款教训：抖音先渲染气泡、后解析发送状态，
// 气泡出现≠发出去。老代码按完回车就 sent += 1，用户服务器上就是这么假成功的。
test("气泡上带失败标记：failed，不计数（重试接手）", async () => {
  const page = sendPage()
  page.newBubble = bubbleScript(["failure"])
  expect(await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).toEqual({
    ok: false,
    reason: `发送失败: ${MESSAGE}`,
  })
})

test("气泡文案里有「发送失败」字样：同样判 failed", async () => {
  const page = sendPage()
  page.newBubble = () => [new FakeEl(`${MESSAGE} 发送失败`)]
  expect(await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).toEqual({
    ok: false,
    reason: `发送失败: ${MESSAGE}`,
  })
})

test("spinner 转完圈后干净：sent", async () => {
  const page = sendPage()
  page.newBubble = bubbleScript(["pending", "pending", "clean", "clean"])
  expect(await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).toEqual({ ok: true })
})

// 关键回归：重试标记会晚于 spinner 一步挂上。只看"spinner 消失"就判成功，
// 抖音慢一步挂重试时就会把发失败的消息记成 success。
test("spinner 消失后又挂上重试标记：failed（稳定窗口拦得住）", async () => {
  const page = sendPage()
  page.newBubble = bubbleScript(["pending", "pending", "clean", "failure"])
  expect(await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).toEqual({
    ok: false,
    reason: `发送失败: ${MESSAGE}`,
  })
})

test("没有发送按钮：回车兜底仍算发送", async () => {
  const page = sendPage()
  page.visible.delete(SEL.sendButton[0])
  page.newBubble = bubbleScript(["clean"])
  expect(await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).toEqual({ ok: true })
  expect(page.keyPresses).toContain("Enter")
})

// 终态超时没等到定论的两种活法：
// 草稿已清 → 大概率发出去了，按已发送计数但留痕；
// 草稿还在 → 没出去，判 failed 让 retryPerFriend 重试接走。
test("确认超时且草稿已清：按已发送计数，但 reason 留痕", async () => {
  const page = sendPage()
  page.newBubble = () => []
  // 发送前草稿就是本条文案，触发发送后被清空
  page.draftFn = (p) => (p.triggered ? "" : MESSAGE)
  const r = await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)
  if (r.ok !== true) throw new Error(`预期成功，实际失败: ${r.reason}`)
  expect(r.uncertain).toContain("发送状态不确定")
})

test("确认超时且草稿仍在：判 failed 交重试（宁可重试也别静默丢弃）", async () => {
  const page = sendPage()
  page.newBubble = () => []
  page.draftValue = MESSAGE // 发送后草稿没被清空 = 没出去
  expect(await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).toEqual({
    ok: false,
    reason: `发送未确认: ${MESSAGE}`,
  })
})

test("文字没落进输入框：直接抛错，不硬发", async () => {
  const page = sendPage()
  page.insertWritesDraft = false
  page.draftValue = ""
  await expect(sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).rejects.toThrow("文字未能写入输入框")
})

// 回归（2026-10-04 真机 run#3，3 好友每个被发 3 遍）：确认链 evaluate 抛
// TypeError（NodeList 没有 filter），而 triggerSend 已经执行、消息已经出去。
// 老代码让异常直接往上抛 → handleFriend 记 failed → 重试再发一遍。
// 现在异常必须降级成 uncertain，由草稿裁定，不能再触发重发。
test("确认链抛异常且草稿已清：按已发送计数，不判失败（否则重试会重发）", async () => {
  const page = sendPage()
  page.newBubble = bubbleScript(["clean"])
  page.evaluateThrows = true
  page.draftFn = (p) => (p.triggered ? "" : MESSAGE)
  const r = await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)
  if (r.ok !== true) throw new Error(`预期按已发送计数，实际: ${JSON.stringify(r)}`)
  expect(r.uncertain).toContain("按已发送计数")
})

test("确认链抛异常但草稿仍在：判 failed（消息确实没出去，该重试）", async () => {
  const page = sendPage()
  page.newBubble = bubbleScript(["clean"])
  page.evaluateThrows = true
  page.draftValue = MESSAGE // 草稿还在 = 没发出去
  expect(await sendTextMessage(page.asPage(), MESSAGE, [200, 200], FAST)).toEqual({
    ok: false,
    reason: `发送未确认: ${MESSAGE}`,
  })
})

/* ------------------------------------------------------------------ *
 * 气泡状态读写（page.evaluate 里的真逻辑）
 * ------------------------------------------------------------------ */

test("锚点只打在含目标文案的既有气泡上", async () => {
  const page = new FakePage()
  const mine = new FakeEl("多喝热水")
  const other = new FakeEl("早上好呀")
  page.existingBubbles = [mine, other]
  await markSeenOutgoing(page.asPage(), "多喝热水")
  expect(other.hasAttribute(SEEN_ATTR)).toBe(false)
  expect(mine.hasAttribute(SEEN_ATTR)).toBe(true)
})

// 回归（2026-10-04 真机首跑，三个好友全 failed）：querySelectorAll 在浏览器里
// 返回的是 NodeList，没有 filter/map/some。直接 .filter 会在 evaluate 里抛
// TypeError，被 handleFriend 当成发送失败——而消息其实已经点发出去了，于是
// 重试 2 次，每人白白多发两遍。NodeList 语义 + 这条用例钉住它。
test("气泡查询结果按 NodeList 语义用：不许直接 filter/map/some", async () => {
  const page = new FakePage()
  page.existingBubbles = [new FakeEl(MESSAGE)]
  // 这两行在浏览器里必须能跑通：Array.from(NodeList) 后才有数组方法
  expect(await readBubbleState(page.asPage(), MESSAGE)).toBe("clean")
  await markSeenOutgoing(page.asPage(), MESSAGE)
  expect(page.existingBubbles[0]!.hasAttribute(SEEN_ATTR)).toBe(true)
  expect(await readBubbleState(page.asPage(), MESSAGE)).toBe("missing")
})

test("零宽字符与换行不影响气泡文案匹配", async () => {
  const page = new FakePage()
  // 长消息会被 DOM 自动换行、偶发零宽字符：两边归一后必须还能对上
  page.existingBubbles = [new FakeEl("多喝\u200b热\n水")]
  await markSeenOutgoing(page.asPage(), "多喝热水")
  expect(page.existingBubbles[0]!.hasAttribute(SEEN_ATTR)).toBe(true)

  const page2 = new FakePage()
  page2.existingBubbles = [new FakeEl("今天天气真好\n我们一起出去玩吧")]
  await markSeenOutgoing(page2.asPage(), "今天天气真好 我们一起出去玩吧")
  expect(page2.existingBubbles[0]!.hasAttribute(SEEN_ATTR)).toBe(true)
})

// 名字匹配是另一套归一：那里空格的有无算两个名字，不能跟着一起删空白
test("名字匹配保留空格、内容匹配删空白：两套归一互不干扰", async () => {
  expect(matchName("张 三", "张三")).toBe(false)
  const page = new FakePage()
  page.existingBubbles = [new FakeEl("张 三的消息")]
  await markSeenOutgoing(page.asPage(), "张三的消息")
  expect(page.existingBubbles[0]!.hasAttribute(SEEN_ATTR)).toBe(true)
})

test("气泡四态：missing / failure / pending / clean", async () => {
  const page = new FakePage()
  page.existingBubbles = [new FakeEl("别的消息")]
  expect(await readBubbleState(page.asPage(), MESSAGE)).toBe("missing")

  page.existingBubbles = [new FakeEl(MESSAGE, new Set(SEL.sendPendingCss))]
  expect(await readBubbleState(page.asPage(), MESSAGE)).toBe("pending")

  page.existingBubbles = [new FakeEl(MESSAGE, new Set(SEL.sendFailureCss))]
  expect(await readBubbleState(page.asPage(), MESSAGE)).toBe("failure")

  page.existingBubbles = [new FakeEl(MESSAGE)]
  expect(await readBubbleState(page.asPage(), MESSAGE)).toBe("clean")
})

// 锚点的意义：同一条文案之前发给过这人，旧气泡必须被排除，
// 否则确认链盯着旧气泡，永远"干净"——假成功。
test("打过锚点的旧气泡不算 fresh：同样文案第二次发仍能认出新气泡", async () => {
  const page = new FakePage()
  const old = new FakeEl(MESSAGE)
  page.existingBubbles = [old]
  await markSeenOutgoing(page.asPage(), MESSAGE)
  expect(await readBubbleState(page.asPage(), MESSAGE)).toBe("missing")

  page.triggered = true
  page.newBubble = () => [new FakeEl(MESSAGE)]
  expect(await readBubbleState(page.asPage(), MESSAGE)).toBe("clean")
})
