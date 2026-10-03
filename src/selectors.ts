/**
 * 抖音选择器集中在此，DOM 漂移时用 `bun run calibrate` 观察真实结构后回填。
 * 已在本机用真实 cookie 校准过一轮（2026-10-03，已登录状态）：
 *   - 消息面板是弹层，点「消息」入口后 URL 不变，不能靠路由判断；
 *   - 稳定把手是 data-e2e 属性（im-entry / conversation-item / msg-input），
 *     css-module 混淆类名（conversationConversationItemwrapper 之类）每次构建都会变，只作兜底。
 */
export const SEL = {
  homeUrl: "https://www.douyin.com/",

  /** 左侧「消息」入口，点开 IM 弹层 */
  imEntry: [
    "[data-e2e='im-entry']",
  ],

  /** 顶部「消息」入口的文案兜底（按文本匹配） */
  messageEntryText: ["消息", "私信"],

  /** 未登录时可见的登录按钮/链接文案 */
  loginText: ["立即登录", "登录"],

  /** 会话列表中的单条会话（已校准：data-e2e=conversation-item） */
  conversationItem: [
    "[data-e2e='conversation-item']",
    "[class*='ConversationItem']",
    "[class*='conversation-item']",
    "[class*='chat-item']",
  ],

  /**
   * 聊天弹层：点开会话后盖住整个 IM 面板的那层（实测点击被它拦截）。
   * 该层在 DOM 里常驻，收起时只是 display:none，判断"是否开着"必须看计算样式。
   */
  chatLayer: ["[data-stack-layer='chat']"],

  /** 消息输入框：必须限定在消息输入容器里，否则会命中搜索框 */
  messageInput: [
    "[data-e2e='msg-input'] [contenteditable='true']",
    "[data-e2e='msg-input'] [data-slate-editor='true']",
    "[contenteditable='true']",
    "textarea[class*='input']",
    "div[class*='editor']",
  ],

  /**
   * 验证码 / 风控墙文案，命中即判定被拦。
   * 两个约束：
   * 1. 不能用登录页与聊天内容里都可能出现的整句——裸「验证码」会误伤短信登录页，
   *    也会误伤好友发来的验证码；
   * 2. 不能收「请稍后再试」这类日常客套：检测扫的是整页 body 文本，含聊天记录，
   *    命中会把好友记成 failed 并可能连续失败中止整批，代价远大于漏判
   *    （漏判只会在发送时报错，同样有重试兜底）。
   * 发送只用回车（抖音网页版不可切换），所以这里没有发送按钮选择器。
   */
  captchaText: [
    "请完成验证",
    "安全验证",
    "拖动下方滑块",
    "点击图中",
    "访问过于频繁",
    "操作太频繁",
  ],
} as const
