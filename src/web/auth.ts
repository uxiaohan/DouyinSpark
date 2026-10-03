import { cryptoRandomStringAsync } from "./crypto"

/** 会话 24 小时有效 */
const TTL_MS = 24 * 3600 * 1000

/**
 * argon2id 在本机所装 Bun 1.4.2 里未编译进去（verify 会抛 UnsupportedAlgorithm），
 * 因此用 Bun.password 的默认 bcrypt。算法是配置项，不散布在调用处。
 */
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password)
}

/** verify 抛异常时一律视为校验失败：认证失败不能变成 500 */
export function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (!hash) return Promise.resolve(false)
  return Bun.password.verify(password, hash).catch(() => false)
}

export async function issueSession(): Promise<{ token: string; expiresAt: string }> {
  const token = await cryptoRandomStringAsync(32)
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  return { token, expiresAt }
}
