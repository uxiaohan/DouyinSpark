import { ref } from 'vue'

type ToastTone = 'success' | 'info' | 'warning' | 'error'
type ToastItem = { id: number; message: string; tone: ToastTone }

function createToastStore(lifetime = 3200) {
  const toasts = ref<ToastItem[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 0

  function removeToast(id: number) {
    toasts.value = toasts.value.filter((item) => item.id !== id)
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }

  function showToast(message: string, tone: ToastTone = 'info') {
    if (toasts.value.length >= 4) removeToast(toasts.value[0].id)
    const id = ++nextId
    toasts.value.push({ id, message, tone })
    timers.set(id, setTimeout(() => removeToast(id), lifetime))
  }

  function toastOffset(index: number) {
    return (toasts.value.length - 1 - index) * -50 || 0
  }

  function dispose() {
    timers.forEach(clearTimeout)
    timers.clear()
    toasts.value = []
  }

  return { toasts, showToast, removeToast, toastOffset, dispose }
}

const toastStore = createToastStore()

export function useToasts() {
  return toastStore
}
