<script setup lang="ts">
import { motion } from 'motion-v'
import { ChevronDown, Command as CommandIcon, LogOut, Settings2 } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { navigationItems } from '@/app/navigation'
import { api } from '@/api'
import type { SessionUser } from '@/lib/session'
import { useToasts } from '@/composables/useToasts'

defineProps<{ collapsed: boolean; user: SessionUser; nextRunLabel: string }>()
const emit = defineEmits<{ logout: [] }>()

const MotionDiv = motion.div
const route = useRoute()
const router = useRouter()
const { showToast } = useToasts()

async function testNotify() {
  try {
    await api.testNotify()
    showToast('测试通知已发送', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '通知测试失败', 'error')
  }
}
</script>

<template>
  <aside :class="['sidebar', { 'is-collapsed': collapsed }]">
    <div class="sidebar-head">
      <span class="brand-symbol"><CommandIcon :size="15" /></span>
      <div class="sidebar-brand-copy" :aria-hidden="collapsed"><strong>续火花</strong><span>DouyinSpark</span></div>
    </div>
    <nav class="sidebar-nav" aria-label="主导航">
      <span class="nav-caption" :aria-hidden="collapsed">工作区</span>
      <Tooltip v-for="item in navigationItems" :key="item.name">
        <TooltipTrigger as-child>
          <button
            :class="['nav-button', { active: route.name === item.name }]"
            :aria-current="route.name === item.name ? 'page' : undefined"
            @click="router.push({ name: item.name })"
          >
            <MotionDiv
              v-if="route.name === item.name"
              class="nav-active"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1 }"
              :transition="{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }"
            />
            <component :is="item.icon" :size="16" />
            <span class="nav-label" :aria-hidden="collapsed">{{ item.label }}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent v-if="collapsed" side="right">{{ item.label }}</TooltipContent>
      </Tooltip>
      <div class="nav-divider" />
      <span class="nav-caption" :aria-hidden="collapsed">快捷操作</span>
      <button class="nav-button muted" @click="testNotify"><Settings2 :size="16" /><span class="nav-label" :aria-hidden="collapsed">测试通知</span></button>
    </nav>
    <div class="sidebar-live" :class="{ compact: collapsed }">
      <span class="live-pulse"><i /></span>
      <div class="sidebar-live-copy" :aria-hidden="collapsed"><strong>下次运行</strong><span>{{ nextRunLabel }}</span></div>
    </div>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" :class="['account-trigger', { compact: collapsed }]">
          <span class="avatar">{{ user.name.slice(0, 1) }}</span>
          <span class="account-copy" :aria-hidden="collapsed"><strong>{{ user.name }}</strong><small>{{ user.role }}</small></span>
          <ChevronDown class="account-chevron" :size="14" :aria-hidden="collapsed" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" class="w-52">
        <DropdownMenuLabel>{{ user.role }}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="router.push({ name: 'settings' })"><Settings2 />运行设置</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem class="text-red-600" @select="emit('logout')"><LogOut />退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </aside>
</template>
