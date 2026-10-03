import { Info, LayoutDashboard, MessageSquareText, ScrollText, Settings, UserRound, UsersRound } from 'lucide-vue-next'
import type { AppRouteName } from './routes'

export const navigationItems = [
  { name: 'dashboard' as AppRouteName, label: '指挥台', icon: LayoutDashboard, shortcut: 'G O' },
  { name: 'accounts' as AppRouteName, label: '账号管理', icon: UserRound, shortcut: 'G A' },
  { name: 'friends' as AppRouteName, label: '好友管理', icon: UsersRound, shortcut: 'G F' },
  { name: 'messages' as AppRouteName, label: '文案池', icon: MessageSquareText, shortcut: 'G M' },
  { name: 'logs' as AppRouteName, label: '运行日志', icon: ScrollText, shortcut: 'G L' },
  { name: 'settings' as AppRouteName, label: '运行设置', icon: Settings, shortcut: 'G S' },
  { name: 'about' as AppRouteName, label: '关于', icon: Info, shortcut: 'G B' },
]
