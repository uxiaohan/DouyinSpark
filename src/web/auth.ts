import { getSetting, setSetting } from "../repo"
import { cryptoRandomString } from "./crypto"

/** 会话 24 小时有效 */
const TTL_MS = 24 * 3600 * 1000

/** settings 表里的键名；存取哈希只走这一对函数，避免 JSON 编码串外泄 */
const PASSWORD_KEY = "admin_password_hash"

/**
 * 口令哈希用 bcrypt（Bun.password 内置，无第三方依赖）。
 * 本机 Bun 1.4.2 实测：默认算法是 argon2id，hash/verify 都能用，但显式写死
 * 算法可以避免 Bun 将来改默认值导致新旧哈希不一致；verify 会按哈希前缀
 * 自动判别，所以历史上已写入的 argon2id 哈希仍能正常校验。
 */
function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt" })
}

/** verify 抛异常时一律视为校验失败：认证失败不能变成 500 */
export function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (!hash) return Promise.resolve(false)
  return Bun.password.verify(password, hash).catch(() => false)
}

/**
 * settings.v 存的是 JSON 字符串，getSetting 原样返回（带引号）。
 * 这里统一解包：空串/非法 JSON/非字符串都算"未设置"，
 * 未设置时首次登录把提交的口令写成新哈希。
 */
export function readPasswordHash(): string | null {
  const raw = getSetting(PASSWORD_KEY)
  if (raw === null) return null
  try {
    const v = JSON.parse(raw) as unknown
    return typeof v === "string" && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export async function writePasswordHash(password: string): Promise<void> {
  setSetting(PASSWORD_KEY, await hashPassword(password))
}

export async function issueSession(): Promise<{ token: string; expiresAt: string }> {
  const token = cryptoRandomString(32)
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  return { token, expiresAt }
}
