<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatMetricValue, parseMetric } from '@/lib/metric'

const props = withDefaults(defineProps<{ value: string; delay?: number; duration?: number }>(), {
  delay: 0,
  duration: 620,
})

const display = ref(props.value)
let frame = 0
let timer = 0

function run() {
  window.cancelAnimationFrame(frame)
  window.clearTimeout(timer)
  const metric = parseMetric(props.value)

  // 没有数字的内容（如运行状态"进行中"）原样显示；否则 formatMetricValue 会拼出
  // "0进行中"这种怪物——仪表盘"最近运行"卡踩过这个坑。
  if (metric.prefix === '' && metric.suffix === props.value) {
    display.value = props.value
    return
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    display.value = props.value
    return
  }

  display.value = formatMetricValue(metric, 0)
  timer = window.setTimeout(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / props.duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      display.value = formatMetricValue(metric, metric.value * eased)
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
  }, props.delay)
}

onMounted(run)
watch(() => props.value, run)
onBeforeUnmount(() => {
  window.cancelAnimationFrame(frame)
  window.clearTimeout(timer)
})
</script>

<template>
  <span :aria-label="value">{{ display }}</span>
</template>
