import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'
import App from './App.vue'
import Login from './views/Login.vue'
import Dashboard from './views/Dashboard.vue'
import Accounts from './views/Accounts.vue'
import Friends from './views/Friends.vue'
import Messages from './views/Messages.vue'
import Settings from './views/Settings.vue'
import Logs from './views/Logs.vue'
import './style.css'
import { api } from './api'
import { store } from './store'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', component: Login },
  { path: '/dashboard', component: Dashboard },
  { path: '/accounts', component: Accounts },
  { path: '/friends', component: Friends },
  { path: '/messages', component: Messages },
  { path: '/settings', component: Settings },
  { path: '/logs', component: Logs },
]

const router = createRouter({ history: createWebHashHistory(), routes })

// session cookie 是 HttpOnly，JS 读不到；用一个需要鉴权的探针请求判断登录态
router.beforeEach(async (to: RouteLocationNormalized) => {
  if (to.path === '/login') return true
  try {
    await api.getSettings()
    return true
  } catch (err) {
    return err instanceof Error && err.message === '未登录' ? '/login' : true
  }
})

createApp(App).use(router).mount('#app')

export { store }

