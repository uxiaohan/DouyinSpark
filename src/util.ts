export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
