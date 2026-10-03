import { reactive } from 'vue'

/** 全局运行态（不放进 main.ts，避免视图 → main 的循环依赖） */
export const store = reactive({ running: false, nextRunAt: '' })
