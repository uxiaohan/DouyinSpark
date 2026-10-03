import { test, expect } from "bun:test"
import type { Page } from "playwright"
import { ensureLoggedIn, findConversationIndex, matchName } from "./douyin"

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
