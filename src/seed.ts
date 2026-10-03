/** bun run seed —— 写入默认设置、全局文案池、1 个示例账号与 3 个示例好友（不含任何真实 cookie） */
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

if (getSetting("timezone") === null) {
  saveSettings(DEFAULT_SETTINGS)
  log.info("seed: 写入默认设置")
}

if (listMessages(null).length === 0) {
  for (const text of DEFAULT_MESSAGES) createMessage(null, text)
  log.info("seed: 写入全局文案池", { count: DEFAULT_MESSAGES.length })
}

if (listAccounts().length === 0) {
  const id = createAccount({ alias: "示例账号（请粘贴 cookie）", cookie_json: null })
  for (const name of ["好友A", "好友B", "好友C"]) createFriend(id, name)
  log.info("seed: 写入示例账号与好友", { accountId: id })
}

log.info("seed: 完成")
