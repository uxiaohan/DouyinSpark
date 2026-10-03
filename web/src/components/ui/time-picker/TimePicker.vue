<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown, Clock } from 'lucide-vue-next'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { cn } from '@/lib/utils'

// 自制时间选择器：原生 input[type=time] 的样式和站点设计语言不搭，按console-number
// 的视觉规范（白底、1px 边框、6px 圆角、32px 高）重做。值走 "HH:MM" 字符串，
// 与 SettingsPage 的调度窗口表单、后端 schedule 的时/分字段之间转换。
const props = defineProps<{
  modelValue?: string
  ariaLabel?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const pad = (n: number) => String(n).padStart(2, '0')
const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 60 }, (_, i) => i)

const open = ref(false)
const hourList = ref<HTMLDivElement | null>(null)
const minuteList = ref<HTMLDivElement | null>(null)

const picked = computed(() => {
  const m = /^(\d{2}):(\d{2})$/.exec(props.modelValue ?? '')
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null
})
const display = computed(() => (picked.value ? `${pad(picked.value.hour)}:${pad(picked.value.minute)}` : '选择时间'))

function select(hour: number, minute: number) {
  emit('update:modelValue', `${pad(hour)}:${pad(minute)}`)
}

// 打开时把选中项滚到可视区中部：分钟列 60 项，不滚动基本找不到当前值
watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  hourList.value?.querySelector('[data-selected]')?.scrollIntoView({ block: 'center' })
  minuteList.value?.querySelector('[data-selected]')?.scrollIntoView({ block: 'center' })
})

const itemCls = (selected: boolean) =>
  cn(
    'flex h-7 cursor-pointer items-center justify-center rounded-md text-[13px] tabular-nums transition-colors',
    selected ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground hover:bg-muted',
  )
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger
      :aria-label="ariaLabel ?? '选择时间'"
      :class="cn(
        'console-number flex w-full cursor-pointer items-center justify-between gap-2 text-left leading-none',
        !picked && 'text-text-muted',
      )"
    >
      <span class="flex items-center gap-1.5">
        <Clock class="size-3.5 shrink-0 opacity-60" />
        <span class="tabular-nums">{{ display }}</span>
      </span>
      <ChevronDown class="size-3.5 shrink-0 opacity-60" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="4"
        :class="cn(
          'bg-popover text-popover-foreground z-50 flex gap-1 rounded-lg p-1 shadow-md ring-1 ring-foreground/10 duration-100',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        )"
      >
        <div class="flex w-16 flex-col">
          <span class="py-1 text-center text-[11px] font-medium text-text-muted">时</span>
          <div ref="hourList" class="console-time-scroll flex flex-col gap-0.5 px-1">
            <button
              v-for="h in hours"
              :key="h"
              type="button"
              :data-selected="picked?.hour === h ? '' : undefined"
              :class="itemCls(picked?.hour === h)"
              @click="select(h, picked?.minute ?? 0)"
            >{{ pad(h) }}</button>
          </div>
        </div>
        <div class="flex w-16 flex-col">
          <span class="py-1 text-center text-[11px] font-medium text-text-muted">分</span>
          <div ref="minuteList" class="console-time-scroll flex flex-col gap-0.5 px-1">
            <button
              v-for="mm in minutes"
              :key="mm"
              type="button"
              :data-selected="picked?.minute === mm ? '' : undefined"
              :class="itemCls(picked?.minute === mm)"
              @click="select(picked?.hour ?? 0, mm)"
            >{{ pad(mm) }}</button>
          </div>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
