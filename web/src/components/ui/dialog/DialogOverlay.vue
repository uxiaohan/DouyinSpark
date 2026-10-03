<script setup lang="ts">
import type { DialogOverlayProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogOverlay } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogOverlayProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <DialogOverlay
    data-slot="dialog-overlay"
    v-bind="delegatedProps"
    :class="cn('fixed inset-0 isolate z-50 bg-[#202633]/15 backdrop-blur-[8px] backdrop-saturate-[.88] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:animation-duration-[220ms] data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:animation-duration-[160ms] data-[state=closed]:ease-in', props.class)"
  >
    <slot />
  </DialogOverlay>
</template>
