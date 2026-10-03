/** /api 统一封装；带 HttpOnly cookie（同源由浏览器自动携带） */

export type Settings = {
  timezone: string
  schedule: { startHour: number; startMinute: number; endHour: number; endMinute: number }
  perFriendMessages: [number, number]
  dedupeMessagesPerFriend: boolean
  shuffleFriends: boolean
  gapBetweenMessagesMs: [number, number]
  gapBetweenFriendsMs: [number, number]
  gapBetweenAccountsMs: [number, number]
  typingCps: [number, number]
  maxScrollAttempts: number
  dryRun: boolean
  pushdeerKey: string | null
  notifyOnRun: boolean
  notifyOnAbort: boolean
  limits: { dailyCapPerAccount: number; retryPerFriend: number; consecutiveFailAbort: number }
}

export type Account = {
  id: number
  alias: string
  hasCookie: boolean
  proxy_server: string | null
  proxy_username: boolean
  enabled: boolean
  daily_cap: number | null
  last_run_at: string | null
  created_at: string
}

export type Friend = { id: number; account_id: number; name: string; created_at: string }
export type Message = { id: number; account_id: number | null; text: string; created_at: string }
export type Run = {
  id: number
  trigger: string
  started_at: string
  finished_at: string | null
  status: string
  summary_json: string | null
}
export type RunItem = {
  id: number
  run_id: number
  account_id: number | null
  friend_id: number | null
  friend_name: string
  status: string
  messages: number
  reason: string | null
  created_at: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  })
  if (res.status === 401) {
    // history 模式下 /login 是真实 URL：prod 由后端兜底 index.html，dev 由 vite 兜底，整页跳转即可
    // 登录页本身不跳——错误口令同样是 401，跳了就是刷新死循环
    if (location.pathname !== '/login') location.assign('/login')
    throw new Error('未登录')
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `请求失败 ${res.status}`)
  }
  return (await res.json()) as T
}

export const api = {
  bootstrap: () => req<{ initialized: boolean }>('/bootstrap'),
  login: (password: string) =>
    req<{ ok: true }>('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => req<{ ok: true }>('/logout', { method: 'POST' }),

  getSettings: () => req<Settings>('/settings'),
  // 保存后后端已按新区间重排，返回新登记的下次运行时间（未调度时为 null）
  putSettings: (s: Settings) => req<Settings & { nextRunAt: string | null }>('/settings', { method: 'PUT', body: JSON.stringify(s) }),

  listAccounts: () => req<{ items: Account[] }>('/accounts'),
  createAccount: (a: Partial<Account> & { alias: string; cookie_json?: string; proxy_server?: string; proxy_username?: string; proxy_password?: string }) =>
    req<{ id: number }>('/accounts', { method: 'POST', body: JSON.stringify(a) }),
  updateAccount: (id: number, a: Partial<Account> & Record<string, unknown>) =>
    req<{ ok: true }>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(a) }),
  deleteAccount: (id: number) => req<{ ok: true }>(`/accounts/${id}`, { method: 'DELETE' }),

  listFriends: (id: number) => req<{ items: Friend[] }>(`/accounts/${id}/friends`),
  createFriend: (id: number, name: string) =>
    req<{ id: number }>(`/accounts/${id}/friends`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteFriend: (id: number, fid: number) =>
    req<{ ok: true }>(`/accounts/${id}/friends/${fid}`, { method: 'DELETE' }),

  listMessages: (accountId?: number) =>
    req<{ items: Message[] }>(`/messages${accountId === undefined ? '' : `?accountId=${accountId}`}`),
  createMessage: (text: string, accountId?: number | null) =>
    req<{ id: number }>('/messages', { method: 'POST', body: JSON.stringify({ text, accountId }) }),
  deleteMessage: (id: number) => req<{ ok: true }>(`/messages/${id}`, { method: 'DELETE' }),

  listRuns: () => req<{ items: Run[] }>('/runs'),
  listRunItems: (id: number) => req<{ items: RunItem[] }>(`/runs/${id}/items`),
  nextRun: () => req<{ nextRunAt: string | null }>('/next-run'),
  testNotify: () => req<{ ok: boolean }>('/notify/test', { method: 'POST' }),
}
