import { randomBytes } from "node:crypto"

/** n 字节随机源的 base64url 截断（同步值，不需要包成 Promise） */
export function cryptoRandomString(n: number): string {
  return randomBytes(n).toString("base64url").slice(0, n)
}
