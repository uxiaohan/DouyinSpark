<script setup lang="ts">
import { ChevronRight, Command as CommandIcon, LogOut } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { navigationItems } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { SessionUser } from '@/lib/session'

defineProps<{ open: boolean; user: SessionUser }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; logout: [] }>()

const route = useRoute()
const router = useRouter()

function navigate(name: string) {
  router.push({ name })
  emit('update:open', false)
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="left" class="mobile-sheet" :show-close-button="true">
      <SheetHeader>
        <SheetTitle class="flex items-center gap-2"><span class="brand-symbol"><CommandIcon :size="14" /></span>续火花</SheetTitle>
        <SheetDescription>DouyinSpark 控制台</SheetDescription>
      </SheetHeader>
      <nav class="mobile-nav" aria-label="移动端主导航">
        <button v-for="item in navigationItems" :key="item.name" :class="{ active: route.name === item.name }" @click="navigate(item.name)">
          <component :is="item.icon" :size="16" />{{ item.label }}<ChevronRight :size="14" />
        </button>
      </nav>
      <div class="mobile-account">
        <span class="avatar">{{ user.name.slice(0, 1) }}</span>
        <div><strong>{{ user.name }}</strong><small>{{ user.role }}</small></div>
        <Button variant="ghost" size="icon-sm" aria-label="退出登录" @click="emit('logout')"><LogOut /></Button>
      </div>
    </SheetContent>
  </Sheet>
</template>
