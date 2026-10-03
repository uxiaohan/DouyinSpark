<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { motion } from 'motion-v'
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import LoginTelemetry from '@/components/auth/LoginTelemetry.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ClickSpark from '@/components/effects/ClickSpark.vue'
import { api } from '@/api'
import { login, setupPassword } from '@/lib/session'
import { useToasts } from '@/composables/useToasts'

const MotionDiv = motion.div
const route = useRoute()
const router = useRouter()
const { showToast } = useToasts()

/** setup = 首次进入的设置引导；login = 已初始化后的常规登录 */
type Mode = 'loading' | 'setup' | 'login'
const mode = ref<Mode>('loading')
const form = reactive({ password: '', confirm: '' })
const state = ref<'idle' | 'loading'>('idle')

const isSetup = computed(() => mode.value === 'setup')
const submitLabel = computed(() => {
  if (state.value === 'loading') return isSetup.value ? '正在设置' : '正在验证'
  if (mode.value === 'loading') return '检测中'
  return isSetup.value ? '设置并进入' : '进入控制台'
})

const redirect = () => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

// 无口令哈希 → 初始化引导；有 → 登录表单。探针失败按登录渲染：
// 登录接口保留着"首次输入即初始化"的兜底，不会把人挡在门外。
onMounted(async () => {
  try {
    const { initialized } = await api.bootstrap()
    mode.value = initialized ? 'login' : 'setup'
  } catch {
    mode.value = 'login'
  }
})

async function handleSubmit() {
  if (!form.password) {
    showToast(isSetup.value ? '请设置管理口令。' : '请输入控制台口令。', 'warning')
    return
  }
  if (isSetup.value) {
    if (form.password.length < 6) {
      showToast('口令至少 6 位。', 'warning')
      return
    }
    if (form.password !== form.confirm) {
      showToast('两次输入的口令不一致。', 'warning')
      return
    }
  }

  state.value = 'loading'
  const result = isSetup.value ? await setupPassword(form.password, form.confirm) : await login(form.password)
  state.value = 'idle'
  if (!result.ok) {
    showToast(result.error, 'error')
    return
  }
  showToast(isSetup.value ? '口令已设置，欢迎进入控制台' : '登录成功，欢迎回来', 'success')
  form.password = ''
  form.confirm = ''
  await router.replace(redirect())
}
</script>

<template>
  <AuthLayout>
    <template #visual>
      <LoginTelemetry />
    </template>

    <MotionDiv class="login-access" :initial="{ opacity: 0, y: 6 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }">
      <div class="login-copy"><h2>{{ isSetup ? '初始化控制台' : '登录续火花控制台' }}</h2><p>{{ isSetup ? '首次进入，先设置一个管理口令。' : '验证本地口令后继续管理运行。' }}</p></div>
      <form class="login-form" @submit.prevent="handleSubmit">
        <div class="field-label"><label for="password">{{ isSetup ? '管理口令' : '控制台口令' }}</label></div>
        <Input id="password" v-model="form.password" type="password" :autocomplete="isSetup ? 'new-password' : 'current-password'" placeholder="输入口令" class="control-input" />
        <template v-if="isSetup">
          <div class="field-label"><label for="confirm">确认口令</label></div>
          <Input id="confirm" v-model="form.confirm" type="password" autocomplete="new-password" placeholder="再输入一次" class="control-input" />
        </template>
        <ClickSpark class="login-submit-effect" :spark-count="5" :spark-size="5" :spark-radius="12" :duration="260">
          <Button type="submit" size="lg" class="primary-action w-full" :disabled="state === 'loading' || mode === 'loading'">
            <span v-if="state === 'loading'" class="spinner" />{{ submitLabel }}<ArrowRight v-if="state === 'idle' && mode !== 'loading'" data-icon="inline-end" />
          </Button>
        </ClickSpark>
      </form>
      <div v-if="isSetup" class="setup-guide">
        <p class="setup-guide-title"><ShieldCheck :size="14" />设置规则</p>
        <ul>
          <li>至少 6 位，只以 bcrypt 哈希存在本机数据库</li>
          <li>忘记口令无法找回，需删除 data/app.db 重新初始化</li>
          <li>设置成功后自动进入，会话 24 小时内有效</li>
        </ul>
      </div>
      <p v-else class="demo-credentials"><KeyRound :size="14" /><span>本地单口令控制台</span><i>·</i><span>输错 5 次锁定 1 分钟</span></p>
    </MotionDiv>
  </AuthLayout>
</template>
