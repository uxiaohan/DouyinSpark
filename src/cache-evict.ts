import { lstatSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { log } from "./logger"

/**
 * 运行结束后把"读进页缓存的大文件"驱逐掉。
 *
 * 背景：chromium 一跑就把自己（/ms-playwright 下几百 MB 的二进制与 .so）和 bun
 * 可执行文件映射进内存，这些文件页全计在容器 cgroup 的 file 内存里——`docker stats`
 * 看着像"越用越胖"，其实都是干净页（磁盘上有相同副本，内核压力下第一个被丢）。
 * 小机器上想让容器占用在运行间隙保持常驻水位，只能主动扔。
 *
 * 手段是 posix_fadvise(DONTNEED) 的现成实现 `vmtouch -e`：只清这些文件自己的页，
 * 不碰其他进程的缓存。没装 vmtouch 的环境（本地 Windows/macOS 开发）自动跳过；
 * 驱逐失败只 warn——它是卫生措施，不是运行的一部分，绝不能影响运行结果。
 *
 * 驱逐掉的页下次运行照常冷读回来。"运行期间有缓存"是执行二进制的物理必然，
 * 这里只保证"跑完即清"。
 *
 * 安全性：目标里包含父进程自己正在运行的 process.execPath（bun 本体），但
 * fadvise(DONTNEED) 只扔页缓存中的干净文件页，不动进程的映射与状态——被抽走
 * 的代码页下次访问按需重新读回（微秒级 page fault），是内核对可执行文件的常规
 * 回收路径。实际效果是父进程热页立刻 fault 回来、只清掉冷尾；真正的大头是子进程
 * 死后无人映射的 /ms-playwright，清得干净且持久。
 */

/** 浏览器目录：容器镜像约定 /ms-playwright；本地由 playwright 默认位置或环境变量决定 */
const BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/ms-playwright"

/** 驱逐目标：bun 本体 + 浏览器目录（只收存在的；bun 本体一定在，放着兜底） */
export function evictionTargets(browsersPath: string = BROWSERS_PATH): string[] {
  const targets = [process.execPath]
  try {
    if (statSync(browsersPath).isDirectory()) targets.push(browsersPath)
  } catch {
    // 本地开发机没有 /ms-playwright：只驱逐 bun 本体（通常也没装 vmtouch，直接空转）
  }
  return targets
}

/** 递归列出目录下所有常规文件；读不了的目录跳过，符号链接不跟（防环，也不重复统计） */
export function walkFiles(root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const path = join(dir, name)
      let st
      try {
        st = lstatSync(path)
      } catch {
        continue
      }
      if (st.isDirectory()) stack.push(path)
      else if (st.isFile()) out.push(path)
    }
  }
  return out
}

/** 每个 vmtouch 调用的文件数上限：路径 ~50 字节，几百个一批远低于 argv 上限 */
const BATCH = 400

/** 目录展开成文件列表；目标不存在或不是目录/文件时静默忽略 */
function collectFiles(target: string): string[] {
  try {
    const st = statSync(target)
    return st.isDirectory() ? walkFiles(target) : [target]
  } catch {
    return []
  }
}

export async function evictRuntimeCache(): Promise<void> {
  const vmtouch = Bun.which("vmtouch")
  if (!vmtouch) return
  const files = evictionTargets().flatMap(collectFiles)
  if (files.length === 0) return
  try {
    for (let i = 0; i < files.length; i += BATCH) {
      const proc = Bun.spawn([vmtouch, "-e", ...files.slice(i, i + BATCH)], {
        stdout: "ignore",
        stderr: "ignore",
      })
      const code = await proc.exited
      if (code !== 0) log.warn("页缓存驱逐返回非 0", { code })
    }
  } catch (err: unknown) {
    log.warn("页缓存驱逐失败", { err: String(err) })
  }
}
