import { log } from "./logger"
import type { AccountResult, FriendResult, ItemStatus, RuntimeSettings, RunSummary } from "./types"

const PUSH_URL = "https://api2.pushdeer.com/message/push"
const FOLD_AT = 20

const ICON: Record<ItemStatus, string> = { success: "✅", failed: "❌", skipped: "⏭️" }

function friendLine(f: FriendResult): string {
  const reason = f.reason ? `（${f.reason}）` : f.messages > 0 ? ` ×${f.messages}` : ""
  return `${ICON[f.status]} ${f.name}${reason}`
}

function foldBlock(lines: string[], status: ItemStatus): string[] {
  const list = lines.filter((l) => l.startsWith(ICON[status]))
  if (list.length <= FOLD_AT) return list
  return [list[0] as string, `…等共 ${list.length} 人`]
}

function accountBlock(a: AccountResult): string[] {
  const lines = a.friends.map(friendLine)
  if (a.cookieExpired) return [`⏭️ ${a.alias}（cookie 失效）`, ...lines]
  if (a.aborted) return [`⚠️ ${a.alias}（已中止）`, ...lines]
  if (a.reason) return [`${ICON.skipped} ${a.alias}（${a.reason}）`, ...lines]
  return [`**${a.alias}**`, ...foldBlock(lines, "success"), ...foldBlock(lines, "failed"), ...foldBlock(lines, "skipped")]
}

export function buildSummaryMarkdown(s: RunSummary): string {
  const out: string[] = [
    `# 续火花跑批 ${s.status}`,
    `触发：${s.trigger} · 开始：${s.startedAt.replace("T", " ").slice(0, 19)} · 结束：${s.finishedAt.replace("T", " ").slice(0, 19)}`,
    "",
    ...s.accounts.flatMap(accountBlock),
    "",
    `合计：成功 ${s.totals.success} · 失败 ${s.totals.failed} · 跳过 ${s.totals.skipped}`,
  ]
  return out.join("\n")
}

/** 失败只告警不抛：通知绝不能反过来影响跑批本身 */
export async function sendPushDeer(key: string, text: string, desp: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ pushkey: key, text, desp, type: "markdown" })
    const res = await fetch(PUSH_URL, { method: "POST", body })
    const json = (await res.json()) as { code?: number }
    if (json.code !== 0) {
      log.warn("pushdeer 返回非 0", { code: json.code })
      return false
    }
    return true
  } catch (err) {
    log.warn("pushdeer 推送失败", { err: String(err) })
    return false
  }
}

export async function notifyRun(settings: RuntimeSettings, summary: RunSummary): Promise<void> {
  if (summary.status === "aborted") {
    if (!(settings.pushdeerKey && settings.notifyOnAbort)) return
  } else if (!(settings.pushdeerKey && settings.notifyOnRun)) return
  const ok = await sendPushDeer(settings.pushdeerKey as string, `续火花跑批 ${summary.status}`, buildSummaryMarkdown(summary))
  log.info("notify: 推送完成", { ok, status: summary.status })
}
