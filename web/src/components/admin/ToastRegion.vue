<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-vue-next'
import { useToasts } from '@/composables/useToasts'

const MotionDiv = motion.div
const { toasts, removeToast, toastOffset } = useToasts()
</script>

<template>
  <div class="toast-region" aria-live="polite" aria-relevant="additions removals">
    <AnimatePresence mode="popLayout" :initial="false">
      <MotionDiv
        v-for="(item, index) in toasts"
        :key="item.id"
        role="status"
        aria-atomic="true"
        :class="['toast', `toast-${item.tone}`]"
        :style="{ '--toast-offset': `${toastOffset(index)}px` }"
        :initial="{ opacity: 0, x: 14, y: 5, scale: 0.98, filter: 'blur(4px)' }"
        :animate="{ opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }"
        :exit="{ opacity: 0, x: 10, scale: 0.98, filter: 'blur(2px)', transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } }"
        :transition="{ type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] }"
      >
        <CircleCheck v-if="item.tone === 'success'" :size="14" />
        <CircleAlert v-else-if="item.tone === 'warning'" :size="14" />
        <X v-else-if="item.tone === 'error'" :size="14" />
        <Info v-else :size="14" />
        <span>{{ item.message }}</span>
        <button :aria-label="`关闭通知：${item.message}`" @click="removeToast(item.id)">
          <X :size="12" />
        </button>
      </MotionDiv>
    </AnimatePresence>
  </div>
</template>
