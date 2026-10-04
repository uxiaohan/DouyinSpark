import type { RouterHistory } from 'vue-router'
import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated, probeSession } from '@/lib/session'
import { routes } from './routes'

function createAppRouter(
  history?: RouterHistory,
) {
  const router = createRouter({
    // history 模式：URL 不带 #。深链接（如 /settings）依赖 SPA fallback——
    // 后端 web-server.ts 对 /* 兜底返回 index.html，dev 由 vite 兜底
    history: history ?? (typeof window === 'undefined' ? createMemoryHistory() : createWebHistory()),
    routes,
  })

  router.beforeEach(async (to) => {
    if (!isAuthenticated()) await probeSession()
    const authed = isAuthenticated()
    if (to.meta.requiresAuth && !authed) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.name === 'login' && authed) return { name: 'dashboard' }
  })

  return router
}

export const router = createAppRouter()
