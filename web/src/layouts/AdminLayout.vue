<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/admin/AppHeader.vue'
import AppSidebar from '@/components/admin/AppSidebar.vue'
import MobileNavigation from '@/components/admin/MobileNavigation.vue'
import { api } from '@/api'
import { logout, sessionUser } from '@/lib/session'
import { useToasts } from '@/composables/useToasts'

const MotionDiv = motion.div
const route = useRoute()
const router = useRouter()
const { showToast } = useToasts()
const user = sessionUser()
const sidebarCollapsed = ref(false)
const mobileNavOpen = ref(false)
const title = computed(() => String(route.meta.title ?? '续火花'))
const description = computed(() => String(route.meta.description ?? ''))

async function handleLogout() {
  await logout()
  showToast('已退出控制台')
  router.replace({ name: 'login' })
}

// 侧栏「实时同步」位改为真实的下次运行时间
onMounted(async () => {
  try {
    const { nextRunAt } = await api.nextRun()
    if (nextRunAt) {
      const d = new Date(nextRunAt)
      nextRunLabel.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } else {
      nextRunLabel.value = '未调度'
    }
  } catch {
    nextRunLabel.value = '未调度'
  }
})
const nextRunLabel = ref('读取中')
</script>

<template>
  <div class="app-shell">
    <AppSidebar :collapsed="sidebarCollapsed" :user="user" :next-run-label="nextRunLabel" @logout="handleLogout" />
    <div :class="['app-main', { 'sidebar-compact': sidebarCollapsed }]">
      <AppHeader
        :title="title"
        :collapsed="sidebarCollapsed"
        :user-initial="user.name.slice(0, 1)"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
        @open-mobile="mobileNavOpen = true"
      />
      <main class="main-scroll">
        <div class="workspace">
          <div class="page-heading">
            <div><h1>{{ title }}</h1><p>{{ description }}</p></div>
          </div>
          <RouterView v-slot="{ Component }">
            <AnimatePresence mode="wait" :initial="false">
              <MotionDiv
                :key="String(route.name)"
                class="view-stage"
                :initial="{ opacity: 0, y: 4 }"
                :animate="{ opacity: 1, y: 0 }"
                :exit="{ opacity: 0, y: -2 }"
                :transition="{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }"
              >
                <component :is="Component" @toast="showToast" />
              </MotionDiv>
            </AnimatePresence>
          </RouterView>
        </div>
      </main>
    </div>
    <MobileNavigation v-model:open="mobileNavOpen" :user="user" @logout="handleLogout" />
  </div>
</template>
