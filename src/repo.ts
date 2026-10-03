import { db, nowISO } from "./db"
import { foldSpace } from "./util"
import type {
  AccountRow,
  Bool,
  FriendRow,
  ItemStatus,
  MessageRow,
  RunItemRow,
  RunRow,
  RunStatus,
  SessionRow,
} from "./types"

export type AccountInput = {
  alias: string
  cookie_json?: string | null
  proxy_server?: string | null
  proxy_username?: string | null
  proxy_password?: string | null
  enabled?: Bool
  daily_cap?: number | null
}

export type RunItemInput = {
  run_id: number
  account_id: number | null
  friend_id: number | null
  friend_name: string
  status: ItemStatus
  messages: number
  reason: string | null
}

type Patchable = Record<string, string | number | null>

const ACCOUNT_FIELDS = [
  "alias",
  "cookie_json",
  "proxy_server",
  "proxy_username",
  "proxy_password",
  "enabled",
  "daily_cap",
] as const

function setMany(table: string, fields: readonly string[], id: number, patch: Patchable): void {
  const keys = fields.filter((f) => f in patch)
  if (keys.length === 0) return
  const set = keys.map((f) => `${f} = ?`).join(", ")
  db.query(`UPDATE ${table} SET ${set} WHERE id = ?`).run(...keys.map((f) => patch[f] as string | number | null), id)
}

export function getSetting(k: string): string | null {
  const row = db.query("SELECT v FROM settings WHERE k = ?").get(k) as { v: string } | null
  return row?.v ?? null
}

export function setSetting(k: string, v: unknown): void {
  db.query(
    "INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
  ).run(k, JSON.stringify(v))
}

export function listAccounts(onlyEnabled = false): AccountRow[] {
  const sql = onlyEnabled
    ? "SELECT * FROM accounts WHERE enabled = 1 ORDER BY id"
    : "SELECT * FROM accounts ORDER BY id"
  return db.query(sql).all() as AccountRow[]
}

export function getAccount(id: number): AccountRow | undefined {
  return db.query("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined
}

export function createAccount(input: AccountInput): number {
  const r = db
    .query(
      `INSERT INTO accounts (alias, cookie_json, proxy_server, proxy_username, proxy_password, enabled, daily_cap, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.alias,
      input.cookie_json ?? null,
      input.proxy_server ?? null,
      input.proxy_username ?? null,
      input.proxy_password ?? null,
      input.enabled ?? 1,
      input.daily_cap ?? null,
      nowISO(),
    )
  return Number(r.lastInsertRowid)
}

export function updateAccount(id: number, patch: Partial<Patchable>): void {
  setMany("accounts", ACCOUNT_FIELDS, id, patch as Patchable)
}

export function deleteAccount(id: number): void {
  db.query("DELETE FROM accounts WHERE id = ?").run(id)
}

export function touchAccountRun(id: number): void {
  db.query("UPDATE accounts SET last_run_at = ? WHERE id = ?").run(nowISO(), id)
}

export function listFriends(accountId?: number): FriendRow[] {
  const sql =
    accountId === undefined
      ? "SELECT * FROM friends ORDER BY id"
      : "SELECT * FROM friends WHERE account_id = ? ORDER BY id"
  const stmt = db.query(sql)
  return (accountId === undefined ? stmt.all() : stmt.all(accountId)) as FriendRow[]
}

export function createFriend(accountId: number, name: string): number {
  return Number(
    db
      .query("INSERT INTO friends (account_id, name, created_at) VALUES (?, ?, ?)")
      .run(accountId, foldSpace(name), nowISO()).lastInsertRowid,
  )
}

export function updateFriend(id: number, patch: { name?: string }): void {
  if (patch.name === undefined) return
  db.query("UPDATE friends SET name = ? WHERE id = ?").run(foldSpace(patch.name), id)
}

export function deleteFriend(id: number): void {
  db.query("DELETE FROM friends WHERE id = ?").run(id)
}

/** accountId: undefined → 全部；null → 仅全局文案；数字 → 该账号文案 */
export function listMessages(accountId?: number | null): MessageRow[] {
  if (accountId === undefined) return db.query("SELECT * FROM messages ORDER BY id").all() as MessageRow[]
  if (accountId === null)
    return db.query("SELECT * FROM messages WHERE account_id IS NULL ORDER BY id").all() as MessageRow[]
  return db.query("SELECT * FROM messages WHERE account_id = ? ORDER BY id").all(accountId) as MessageRow[]
}

export function createMessage(accountId: number | null, text: string): number {
  return Number(
    db
      .query("INSERT INTO messages (account_id, text, created_at) VALUES (?, ?, ?)")
      .run(accountId, text, nowISO()).lastInsertRowid,
  )
}

export function deleteMessage(id: number): void {
  db.query("DELETE FROM messages WHERE id = ?").run(id)
}

export function createRun(trigger: string): number {
  return Number(
    db
      .query("INSERT INTO runs (trigger, started_at, status) VALUES (?, ?, 'running')")
      .run(trigger, nowISO()).lastInsertRowid,
  )
}

export function finishRun(id: number, status: RunStatus, summary: unknown): void {
  db.query("UPDATE runs SET finished_at = ?, status = ?, summary_json = ? WHERE id = ?").run(
    nowISO(),
    status,
    JSON.stringify(summary),
    id,
  )
}

export function addRunItem(item: RunItemInput): void {
  db
    .query(
      `INSERT INTO run_items (run_id, account_id, friend_id, friend_name, status, messages, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.run_id,
      item.account_id,
      item.friend_id,
      item.friend_name,
      item.status,
      item.messages,
      item.reason,
      nowISO(),
    )
}

export function listRuns(limit = 20): RunRow[] {
  return db.query("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit) as RunRow[]
}

export function listRunItems(runId: number): RunItemRow[] {
  return db.query("SELECT * FROM run_items WHERE run_id = ? ORDER BY id").all(runId) as RunItemRow[]
}

/** 今日（本地时间 0 点起）该账号发送成功的好友数 */
export function countTodaySuccess(accountId: number): number {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const row = db
    .query(
      "SELECT COUNT(*) AS n FROM run_items WHERE account_id = ? AND status = 'success' AND created_at >= ?",
    )
    .get(accountId, start.toISOString()) as { n: number } | null
  return row?.n ?? 0
}

export function saveSession(token: string, expiresAt: string): void {
  db
    .query(
      "INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET expires_at = excluded.expires_at",
    )
    .run(token, nowISO(), expiresAt)
}

export function getSession(token: string): SessionRow | undefined {
  return db.query("SELECT * FROM sessions WHERE token = ?").get(token) as SessionRow | undefined
}

export function deleteSession(token: string): void {
  db.query("DELETE FROM sessions WHERE token = ?").run(token)
}
