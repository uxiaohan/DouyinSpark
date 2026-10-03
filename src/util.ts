export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 空白归一：`\s+` 折叠成单个普通空格并去掉首尾。JS 的 `\s` 含不换行空格
 * U+00A0、全角空格 U+3000 等。两处用它，各管一边：
 * - 写好友时（repo.createFriend）：库里只存人打得出来的形态，控制台显示干净；
 * - 匹配时（douyin.matchName）：兜住页面渲染出来的形态——实测抖音会话列表里
 *   昵称中间的空白是 U+00A0（字符码 160），而人输入的是普通空格（码 32），
 *   不归一就每个好友都匹配不上。
 */
export function foldSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

/** 闭区间 [min, max] 内随机整数 */
export function randInt(min: number, max: number): number {
  if (max < min) [min, max] = [max, min]
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** [min, max] 毫秒区间内随机时长 */
export function randMs(range: [number, number]): number {
  return randInt(range[0], range[1])
}

export function pick<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pick: empty array")
  return arr[randInt(0, arr.length - 1)] as T
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

/** 取最多 n 条；dedupe=true 时先去重 */
export function sampleN<T>(arr: readonly T[], n: number, dedupe: boolean): T[] {
  const base = dedupe ? [...new Set(arr)] : [...arr]
  return shuffle(base).slice(0, Math.max(0, n))
}
