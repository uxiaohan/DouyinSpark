import type { RouteRecordRaw } from 'vue-router'

export type AppRouteName = 'login' | 'dashboard' | 'accounts' | 'friends' | 'messages' | 'settings' | 'logs'

export type PageMeta = {
  title: string
  description: string
  requiresAuth: boolean
}

export const routeMeta: Record<AppRouteName, PageMeta> = {
  login: { title: '登录', description: '输入控制台口令后继续。', requiresAuth: false },
  dashboard: { title: '指挥台', description: '跑批状态、调度窗口与最近运行记录。', requiresAuth: true },
  accounts: { title: '账号管理', description: '管理抖音账号、登录态与代理配置。', requiresAuth: true },
  friends: { title: '好友管理', description: '维护每个账号需要续火花的联系人。', requiresAuth: true },
  messages: { title: '文案池', description: '维护全局文案与账号专属文案。', requiresAuth: true },
  settings: { title: '运行设置', description: '调度窗口、发送节奏与通知策略。', requiresAuth: true },
  logs: { title: '运行日志', description: '追踪每次跑批的执行明细与失败原因。', requiresAuth: true },
}

const loginPage = () => import('@/pages/LoginPage.vue')
const adminLayout = () => import('@/layouts/AdminLayout.vue')
const dashboardPage = () => import('@/pages/DashboardPage.vue')
const accountsPage = () => import('@/pages/AccountsPage.vue')
const friendsPage = () => import('@/pages/FriendsPage.vue')
const messagesPage = () => import('@/pages/MessagesPage.vue')
const settingsPage = () => import('@/pages/SettingsPage.vue')
const logsPage = () => import('@/pages/LogsPage.vue')

export const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: loginPage, meta: routeMeta.login },
  {
    path: '/',
    component: adminLayout,
    children: [
      { path: '', name: 'dashboard', component: dashboardPage, meta: routeMeta.dashboard },
      { path: 'accounts', name: 'accounts', component: accountsPage, meta: routeMeta.accounts },
      { path: 'friends', name: 'friends', component: friendsPage, meta: routeMeta.friends },
      { path: 'messages', name: 'messages', component: messagesPage, meta: routeMeta.messages },
      { path: 'settings', name: 'settings', component: settingsPage, meta: routeMeta.settings },
      { path: 'logs', name: 'logs', component: logsPage, meta: routeMeta.logs },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]
