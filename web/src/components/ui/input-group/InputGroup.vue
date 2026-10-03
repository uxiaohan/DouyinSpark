<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="input-group"
    role="group"
    :class="cn(
      'border-input dark:bg-input/30 has-[[data-slot=input-group-control]:focus-visible]:border-[#7189d8] has-[[data-slot=command-input]:focus-visible]:border-[#7189d8] has-[[data-slot][aria-invalid=true]]:border-destructive has-disabled:bg-input/50 dark:has-disabled:bg-input/80 h-8 rounded-lg border transition-[border-color,background-color] duration-180 ease-[cubic-bezier(0.16,1,0.3,1)] in-data-[slot=combobox-content]:focus-within:border-inherit has-disabled:opacity-50 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5 group/input-group relative flex w-full min-w-0 items-center outline-none has-[>textarea]:h-auto',
      props.class,
    )"
  >
    <slot />
  </div>
</template>
