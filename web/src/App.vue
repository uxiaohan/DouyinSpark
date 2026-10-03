<script setup lang="ts">
import { MotionConfig } from 'motion-v'
import { RouterView } from 'vue-router'
import ConfirmRegion from '@/components/admin/ConfirmRegion.vue'
import ToastRegion from '@/components/admin/ToastRegion.vue'
import { TooltipProvider } from '@/components/ui/tooltip'
</script>

<template>
  <MotionConfig reduced-motion="user">
    <TooltipProvider :delay-duration="120">
      <RouterView />
      <ToastRegion />
      <ConfirmRegion />
    </TooltipProvider>
  </MotionConfig>
</template>
