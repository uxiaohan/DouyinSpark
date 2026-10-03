import { createApp } from 'vue'
import '@fontsource-variable/geist'
import App from './App.vue'
import { router } from './app/router'
import { probeSession } from './lib/session'
import './style.css'

// 先探针会话再挂载，避免守卫异步判定前的登录页闪烁
// （不用顶层 await：vite 默认 target 不含 esnext）
void (async () => {
  await probeSession()
  const app = createApp(App)
  app.use(router)
  await router.isReady()
  app.mount('#app')
})()
