<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Textarea
    data-slot="input-group-control"
    :class="cn(
      'rounded-none border-0 bg-transparent focus-visible:bg-transparent py-2 shadow-none ring-0 disabled:bg-transparent dark:bg-transparent dark:disabled:bg-transparent flex-1 resize-none',
      props.class,
    )"
  />
</template>
