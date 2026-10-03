import { randomBytes } from "node:crypto"

/** n 字节随机源的 base64url 截断 */
export function cryptoRandomStringAsync(n: number): Promise<string> {
  return Promise.resolve(randomBytes(n).toString("base64url").slice(0, n))
}
