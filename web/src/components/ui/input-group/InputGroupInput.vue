<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Input
    data-slot="input-group-control"
    :class="cn(
      'rounded-none border-0 bg-transparent focus-visible:bg-transparent shadow-none ring-0 disabled:bg-transparent dark:bg-transparent dark:disabled:bg-transparent flex-1',
      props.class,
    )"
  />
</template>
