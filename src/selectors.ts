/**
 * 抖音选择器集中在此，DOM 漂移时用 `bun run calibrate` 观察真实结构后回填。
 * 每个字段给出多个候选，按顺序取第一个可见项；全部失败即降级为 failed/skipped。
 */
export const SEL = {
  homeUrl: "https://www.douyin.com/",

  /** 顶部「消息」入口，按文案匹配 */
  messageEntryText: ["消息", "私信"],

  /** 未登录时可见的登录文案 */
  loginText: ["立即登录", "登录"],

  /** 会话列表容器 */
  conversationList: [
    "[data-e2e='message-list']",
    "[class*='message-list']",
    "[class*='conversation-list']",
    "div[class*='chat']",
  ],

  /** 会话列表中的单条会话 */
  conversationItem: [
    "[data-e2e='message-item']",
    "[class*='message-item']",
    "[class*='conversation-item']",
    "[class*='chat-item']",
  ],

  /** 消息输入框 */
  messageInput: [
    "[data-e2e='message-input']",
    "[contenteditable='true']",
    "textarea[class*='input']",
    "div[class*='editor']",
  ],

  /** 发送按钮 */
  sendButton: [
    "[data-e2e='message-send']",
    "button:has-text('发送')",
    "[class*='send']:not([class*='sender'])",
  ],

  /**
   * 验证码 / 风控墙文案，命中即判定被拦。
   * 必须用登录页与聊天内容都不会出现的整句——裸「验证码」会误伤短信登录页，
   * 也会误伤好友发来的验证码。
   */
  captchaText: [
    "请完成验证",
    "安全验证",
    "拖动下方滑块",
    "点击图中",
    "访问过于频繁",
    "操作太频繁",
    "请稍后再试",
  ],
} as const
