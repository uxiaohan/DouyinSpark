import { ref } from 'vue'

/**
 * 全局确认弹窗：替代原生 confirm()，走模板的 Dialog 视觉体系。
 * 与 useToasts 同一模式——模块级单例 + App 内挂一个 Region。
 */

export type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: 'default' | 'warning'
}

type PendingConfirm = {
  options: Required<Omit<ConfirmOptions, 'tone'>> & { tone: 'default' | 'warning' }
  resolve: (ok: boolean) => void
}

const EXIT_MS = 240 // 与 DialogContent 退出动画时长对齐
const pending = ref<PendingConfirm | null>(null)
/** 比 pending 多活一个退出动画的内容快照：settle 后 pending 立即置空，
 * 若模板同步改渲染会瞬间丢失 tone → callout 回落默认绿色，退出途中闪绿 */
const displayed = ref<PendingConfirm | null>(null)
let exitTimer: ReturnType<typeof setTimeout> | null = null

/** 弹出确认框，返回用户选择：true = 确认，false = 取消/关闭 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (exitTimer !== null) {
      clearTimeout(exitTimer)
      exitTimer = null
    }
    const next: PendingConfirm = {
      options: {
        title: options.title ?? '确认操作',
        message: options.message,
        confirmText: options.confirmText ?? '确认',
        cancelText: options.cancelText ?? '取消',
        tone: options.tone ?? 'default',
      },
      resolve,
    }
    displayed.value = next
    pending.value = next
  })
}

export function settleConfirm(value: boolean) {
  const current = pending.value
  if (!current) return
  pending.value = null
  current.resolve(value)
  // 退出动画期间保留 displayed，播完再清，避免 class 提前回退导致闪绿
  if (exitTimer !== null) clearTimeout(exitTimer)
  exitTimer = setTimeout(() => {
    exitTimer = null
    displayed.value = null
  }, EXIT_MS)
}

export function useConfirm() {
  return { pending, displayed, confirm, settleConfirm }
}
