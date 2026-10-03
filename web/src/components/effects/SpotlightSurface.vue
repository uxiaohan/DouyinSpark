<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{ as?: string }>(), { as: 'div' })
const position = ref({ '--spot-x': '50%', '--spot-y': '50%' })

function track(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  position.value = {
    '--spot-x': `${event.clientX - rect.left}px`,
    '--spot-y': `${event.clientY - rect.top}px`,
  }
}
</script>

<template>
  <component :is="as" data-effect="spotlight" class="spotlight-surface" :style="position" @pointermove="track">
    <slot />
  </component>
</template>
