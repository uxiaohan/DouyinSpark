<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

type Burst = { id: number; x: number; y: number }
const props = withDefaults(defineProps<{
  sparkColor?: string
  sparkSize?: number
  sparkRadius?: number
  sparkCount?: number
  duration?: number
}>(), {
  sparkColor: '#72ddff',
  sparkSize: 8,
  sparkRadius: 18,
  sparkCount: 8,
  duration: 420,
})

const bursts = ref<Burst[]>([])
const timeouts: ReturnType<typeof setTimeout>[] = []
let nextId = 0

function spark(event: MouseEvent) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const id = nextId++
  bursts.value.push({ id, x: event.clientX - rect.left, y: event.clientY - rect.top })
  timeouts.push(setTimeout(() => {
    bursts.value = bursts.value.filter((burst) => burst.id !== id)
  }, props.duration))
}

onBeforeUnmount(() => timeouts.forEach(clearTimeout))
</script>

<template>
  <div class="click-spark" @click="spark">
    <span v-for="burst in bursts" :key="burst.id" class="spark-burst" :style="{ left: `${burst.x}px`, top: `${burst.y}px`, '--spark-duration': `${duration}ms`, '--spark-radius': `${sparkRadius}px`, '--spark-size': `${sparkSize}px`, '--spark-color': sparkColor }" aria-hidden="true">
      <i v-for="ray in sparkCount" :key="ray" :style="{ '--spark-angle': `${ray * 360 / sparkCount}deg` }" />
    </span>
    <slot />
  </div>
</template>
