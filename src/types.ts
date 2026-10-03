/** 布尔以 0|1 存库 */
export type Bool = 0 | 1
export type RunStatus = "success" | "partial" | "aborted"
export type ItemStatus = "success" | "failed" | "skipped"
export type SendKey = "Enter" | "Click" | "Auto"

export type AccountRow = {
  id: number
  alias: string
  cookie_json: string | null
  proxy_server: string | null
  proxy_username: string | null
  proxy_password: string | null
  enabled: Bool
  daily_cap: number | null
  last_run_at: string | null
  created_at: string
}

export type FriendRow = {
  id: number
  account_id: number
  name: string
  created_at: string
}

export type MessageRow = {
  id: number
  account_id: number | null
  text: string
  created_at: string
}

export type RunRow = {
  id: number
  trigger: string
  started_at: string
  finished_at: string | null
  status: RunStatus | "running"
  summary_json: string | null
}

export type RunItemRow = {
  id: number
  run_id: number
  account_id: number | null
  friend_id: number | null
  friend_name: string
  status: ItemStatus
  messages: number
  reason: string | null
  created_at: string
}

export type SessionRow = {
  token: string
  created_at: string
  expires_at: string
}

export type ProxySetting = {
  server: string
  username: string | null
  password: string | null
}

export type RuntimeSettings = {
  timezone: string
  schedule: { startHour: number; startMinute: number; endHour: number; endMinute: number }
  perFriendMessages: [number, number]
  dedupeMessagesPerFriend: boolean
  shuffleFriends: boolean
  gapBetweenMessagesMs: [number, number]
  gapBetweenFriendsMs: [number, number]
  gapBetweenAccountsMs: [number, number]
  typingCps: [number, number]
  sendKey: SendKey
  maxScrollAttempts: number
  dryRun: boolean
  pushdeerKey: string | null
  notifyOnRun: boolean
  notifyOnAbort: boolean
  limits: { dailyCapPerAccount: number; retryPerFriend: number; consecutiveFailAbort: number }
}

export type AccountRuntime = {
  account: AccountRow
  friends: FriendRow[]
  /** 账号专属文案 + 全局文案池 */
  messages: string[]
}

export type RunConfig = {
  settings: RuntimeSettings
  accounts: AccountRuntime[]
}

export type FriendResult = {
  friendId: number
  name: string
  status: ItemStatus
  messages: number
  reason: string | null
}

export type AccountResult = {
  accountId: number
  alias: string
  cookieExpired: boolean
  aborted: boolean
  reason: string | null
  friends: FriendResult[]
}

export type RunSummary = {
  runId: number
  trigger: string
  startedAt: string
  finishedAt: string
  status: RunStatus
  totals: { success: number; failed: number; skipped: number }
  accounts: AccountResult[]
}
