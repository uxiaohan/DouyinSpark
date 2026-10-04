/**
 * 幂等初始化：写入默认设置、全局文案池、1 个示例账号与 3 个示例好友（不含任何真实 cookie）。
 *
 * 全新库只有 db.ts 里的 CREATE TABLE，没有任何数据。启动入口（web-server.ts）不会自动灌数据，
 * 而 `bun run seed` 是开发流程里的手工步骤——docker 部署的用户没有 bun 环境，够不着这条命令，
 * 结果是新环境文案池永远空的。所以由 web-server 启动时调用本函数兜底。
 */
import { DEFAULT_MESSAGES } from "./default-messages"
import { DEFAULT_SETTINGS, saveSettings } from "./config"
import { log } from "./logger"
import {
  createAccount,
  createFriend,
  createMessage,
  getSetting,
  listAccounts,
  listMessages,
} from "./repo"

interface SeedResult {
  settings: boolean
  messages: number
  sampleAccount: boolean
}

/** 三项各自由"库里已有对应数据就不动"保护，可反复调用；返回本次实际写入的内容 */
export function seedDefaults(): SeedResult {
  const settings = getSetting("timezone") === null
  if (settings) saveSettings(DEFAULT_SETTINGS)

  let messages = 0
  if (listMessages(null).length === 0) {
    for (const text of DEFAULT_MESSAGES) createMessage(null, text)
    messages = DEFAULT_MESSAGES.length
  }

  const sampleAccount = listAccounts().length === 0
  if (sampleAccount) {
    const id = createAccount({ alias: "示例账号（请粘贴 cookie）", cookie_json: null })
    for (const name of ["好友A", "好友B", "好友C"]) createFriend(id, name)
  }

  return { settings, messages, sampleAccount }
}

// 直接 `bun run src/seed.ts` 时自执行，保留原手工入口
if (import.meta.main) {
  const { settings, messages, sampleAccount } = seedDefaults()
  if (settings) log.info("seed: 写入默认设置")
  if (messages > 0) log.info("seed: 写入全局文案池", { count: messages })
  if (sampleAccount) log.info("seed: 写入示例账号与好友")
  log.info("seed: 完成")
}
