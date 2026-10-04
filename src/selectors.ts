/**
 * 抖音选择器集中在此，DOM 漂移时用 `bun run calibrate` 观察真实结构后回填。
 *
 * 2026-10-04 起改用专用聊天页 https://www.douyin.com/chat 的方案（校准探针 +
 * 真实运行验证）：
 *   - 专用聊天页里会话列表和聊天面板左右并排，**没有盖在列表上的弹层**——
 *     首页「消息」入口那套 overlay 会把会话项点击拦死（run 18/20 真机复现），
 *     整类问题在 /chat 结构上不存在；
 *   - 好友优先走搜索框找人（ SearchPanel 结果行），会话列表直点只作兜底；
 *   - 输入框/发送按钮/本人气泡均已在 /chat 用真实账号校准过。
 * 已登录态校准记录（2026-10-04，真实 cookie，只读探针）：
 *   - 搜索框 input[placeholder="搜索"] ×1；
 *   - 会话项 [data-e2e="conversation-item"] ×14（css-module 类名每次构建会变，只作兜底）；
 *   - 搜索结果行 SearchPanelitembox，标题 SearchPanelitemtitle，按钮 SearchPanelitemchat_btn；
 *   - 聊天头部 RightPanelHeadertitle（群聊带头像那行是「名字(N)」再跟一行数字）；
 *   - 输入框 [data-e2e="msg-input"] [contenteditable="true"]，placeholder「发送消息」；
 *   - 发送按钮 messageMsgInputpublishBtn ×1（首页 overlay 下判定"没有发送按钮"是误判）；
 *   - 消息列表 messageMessageListlist，本人气泡带 messageMessageBoxisFromMe，
 *     内容节点 [data-e2e="msg-item-content"]。
 */
export const SEL = {
  /** 抖音专用聊天页（SPA，domcontentloaded 后搜索框异步挂载） */
  chatUrl: "https://www.douyin.com/chat",

  /** 左上角好友搜索框 */
  searchInput: [
    'input[placeholder="搜索"]',
    'input[placeholder*="搜索"]',
  ],

  /** 搜索结果行（内部含标题与「发消息」按钮） */
  searchResultBox: [
    '[class*="SearchPanelitembox"]',
  ],
  searchResultTitle: [
    '[class*="SearchPanelitemtitle"]',
  ],
  searchResultChatBtn: [
    '[class*="SearchPanelitemchat_btn"]',
  ],

  /** 右侧聊天面板头部标题（确认打开的是哪个会话） */
  chatHeaderTitle: [
    '[class*="RightPanelHeadertitle"]',
  ],

  /** 会话列表中的单条会话（兜底路径用） */
  conversationItem: [
    "[data-e2e='conversation-item']",
    "[class*='conversationConversationItem']",
  ],

  /** 消息输入框：必须限定在消息输入容器里，否则会命中搜索框 */
  messageInput: [
    "[data-e2e='msg-input'] [contenteditable='true']",
    "[contenteditable='true'][data-placeholder*='发送消息']",
    "[contenteditable='true']",
    "textarea[class*='input']",
  ],

  /** 发送按钮：/chat 页面实测存在；找不到才回退回车 */
  sendButton: [
    '[class*="messageMsgInputpublishBtn"]',
    ".e2e-send-msg-bt",
    'button[aria-label*="发送"]',
    '[role="button"][aria-label*="发送"]',
  ],

  /**
   * 最新一条本人发出的气泡（发送确认用）。
   * 抖音先渲染气泡、后解析发送状态（参考项目 Issue #11：气泡出现≠成功），
   * 所以确认链要盯这条气泡上的失败/等待标记。
   */
  outgoingBubble:
    '[class*="messageMessageList"] [class*="messageMessageBoxmessageBox"]:has([class*="messageMessageBoxisFromMe"])',

  /** 发送失败标记（红色重试 ! 那一套），只看这条气泡上的，不看全页 */
  sendFailureCss: [
    '[class*="ContentSideSendStatusretry"]',
    '[class*="SendStatusretry"]',
    '[class*="sendFailed"]',
    '[class*="SendFailed"]',
    '[aria-label*="重试"]',
    '[title*="重试"]',
  ],
  sendFailureText: ["发送失败", "重新发送"],

  /** 发送中的转圈标记，同样只认这条气泡上的 */
  sendPendingCss: [
    ".semi-spin",
    '[class*="im-saas-message-spin"]',
    '[data-icon="spin"]',
  ],

  /** /chat 上出现即说明登录态失效的文案 */
  loginRequiredText: ["扫码登录", "验证码登录", "登录后"],

  /**
   * 验证码 / 风控墙文案，命中即判定被拦。
   * 两个约束：
   * 1. 不能用登录页与聊天内容里都可能出现的整句——裸「验证码」会误伤短信登录页，
   *    也会误伤好友发来的验证码；
   * 2. 不能收「请稍后再试」这类日常客套：检测扫的是整页 body 文本，含聊天记录，
   *    命中会把好友记成 failed 并可能连续失败中止整批，代价远大于漏判
   *    （漏判只会在发送时报错，同样有重试兜底）。
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
