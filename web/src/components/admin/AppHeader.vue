<script setup lang="ts">
import { Bell, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { router } from '@/app/router'

defineProps<{
  title: string
  collapsed: boolean
  userInitial: string
}>()

defineEmits<{
  toggleSidebar: []
  openMobile: []
}>()
</script>

<template>
  <header class="topbar">
    <div class="topbar-start">
      <Button variant="ghost" size="icon" class="mobile-only" aria-label="打开导航" @click="$emit('openMobile')">
        <Menu />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="desktop-only"
        :aria-label="collapsed ? '展开导航' : '收起导航'"
        @click="$emit('toggleSidebar')"
      >
        <PanelLeftOpen v-if="collapsed" />
        <PanelLeftClose v-else />
      </Button>
      <span class="topbar-rule" />
      <div class="breadcrumb"><span>续火花</span><i>/</i><strong>{{ title }}</strong></div>
    </div>
    <div class="topbar-end">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="notification-button" aria-label="通知" @click="router.push({ name: 'logs' })">
            <Bell /><i />
          </Button>
        </TooltipTrigger>
        <TooltipContent>查看运行日志</TooltipContent>
      </Tooltip>
      <span class="topbar-rule" />
      <span class="avatar small">{{ userInitial }}</span>
    </div>
  </header>
</template>
