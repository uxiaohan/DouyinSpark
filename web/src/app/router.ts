import type { RouterHistory } from 'vue-router'
import { createMemoryHistory, createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { isAuthenticated, probeSession } from '@/lib/session'
import { routes } from './routes'

export function createAppRouter(
  history?: RouterHistory,
) {
  const router = createRouter({
    // 控制台由后端静态托管 dist，hash 路由对 SPA fallback 最稳
    history: history ?? (typeof window === 'undefined' ? createMemoryHistory() : createWebHashHistory()),
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
