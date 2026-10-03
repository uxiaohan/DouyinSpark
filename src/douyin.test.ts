import { test, expect } from "bun:test"
import type { Page } from "playwright"
import { closeChatLayer, ensureLoggedIn, findConversationIndex, matchName } from "./douyin"

/** 最小 Page 假件：只实现 ensureLoggedIn 用到的 goto/url/getByRole */
function fakePage(opts: { url: string; roleNames: string[] }): Page {
  const re = /立即登录|登录/
  const locator = {
    first: () => ({
      waitFor: async ({ state }: { state: string }) => {
        if (state === "visible" && !opts.roleNames.some((n) => re.test(n))) throw new Error("not visible")
      },
    }),
  }
  return {
    goto: async () => {},
    url: () => opts.url,
    getByRole: () => locator,
  } as unknown as Page
}

test("已登录：首页无可见登录按钮即判定已登录", async () => {
  const page = fakePage({ url: "https://www.douyin.com/jingxuan", roleNames: ["开启读屏标签", "搜索"] })
  expect(await ensureLoggedIn(page)).toBe(true)
})

test("未登录：出现登录按钮即判定未登录", async () => {
  const page = fakePage({ url: "https://www.douyin.com/jingxuan", roleNames: ["开启读屏标签", "搜索", "登录"] })
  expect(await ensureLoggedIn(page)).toBe(false)
})

test("跳转到登录页 URL 时直接判定未登录", async () => {
  const page = fakePage({ url: "https://www.douyin.com/login?xxx", roleNames: [] })
  expect(await ensureLoggedIn(page)).toBe(false)
})

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

test("findConversationIndex 返回命中下标，未命中为 -1", () => {
  const texts = ["张一\n你好", "张三\n在吗", "李四\n晚点聊"]
  expect(findConversationIndex(texts, "张三")).toBe(1)
  expect(findConversationIndex(texts, "赵六")).toBe(-1)
  expect(findConversationIndex([], "张三")).toBe(-1)
})

// 回归：真实跑批时 allInnerTexts()（底层 $$eval）在虚拟列表重渲染下返回过 undefined，
// matchName 直接 .split 抛 TypeError，把好友记成 failed 并累计连续失败。
test("会话项文本为 undefined 时不抛，按不匹配处理", () => {
  expect(matchName(undefined, "张三")).toBe(false)
  expect(findConversationIndex([undefined, "张三\n在吗", undefined], "张三")).toBe(1)
  expect(findConversationIndex([undefined, undefined], "张三")).toBe(-1)
})

// 回归：抖音在昵称里渲染的是不换行空格 U+00A0（实测码 160），控制台粘贴进来的是
// 普通空格 U+0020（实测码 32）。不做空白归一的话 every friend 都匹配不上，
// 全部记成"未找到会话"——工具等于完全不能用。
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

/**
 * 最小 Page 假件：驱动 closeChatLayer 的决策分支。
 * 注意：假件的 evaluate 不真在页面里跑回调，所以"闭包自由变量在页面上下文
 * 不存在"这类问题（run 19 真机踩过：SEL is not defined）单元测试拦不住，
 * 只能靠真机跑批验证。这里覆盖的是 reload 兜底/失败不抛/空转三条路径。
 */
function fakeChatPage(opts: { chatVisible: boolean; reloadOk?: boolean }): { page: Page; stats: { reloads: number } } {
  let visible = opts.chatVisible
  const stats = { reloads: 0 }
  const page = {
    evaluate: async () => visible,
    reload: async () => {
      stats.reloads += 1
      if (opts.reloadOk === false) throw new Error("reload failed")
      visible = false
    },
  }
  return { page: page as unknown as Page, stats }
}

test("有聊天弹层：reload 页面重置，不抛", async () => {
  const { page, stats } = fakeChatPage({ chatVisible: true })
  await closeChatLayer(page)
  expect(stats.reloads).toBe(1)
})

test("reload 失败不抛：最坏退回旧行为，不拖垮整批", async () => {
  const { page, stats } = fakeChatPage({ chatVisible: true, reloadOk: false })
  await closeChatLayer(page)
  expect(stats.reloads).toBe(1)
})

test("没有聊天弹层：不 reload，无谓刷新只会拖慢并增加风控面", async () => {
  const { page, stats } = fakeChatPage({ chatVisible: false })
  await closeChatLayer(page)
  expect(stats.reloads).toBe(0)
})
