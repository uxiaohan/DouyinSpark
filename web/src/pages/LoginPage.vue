<script setup lang="ts">
import { reactive, ref } from 'vue'
import { motion } from 'motion-v'
import { ArrowRight, CircleAlert, KeyRound } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import LoginTelemetry from '@/components/auth/LoginTelemetry.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ClickSpark from '@/components/effects/ClickSpark.vue'
import { login } from '@/lib/session'
import { useToasts } from '@/composables/useToasts'

const MotionDiv = motion.div
const route = useRoute()
const router = useRouter()
const { showToast } = useToasts()
const form = reactive({ password: '' })
const state = ref<'idle' | 'loading'>('idle')
const error = ref('')

const redirect = () => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

async function handleLogin() {
  error.value = ''
  if (!form.password) {
    error.value = '请输入控制台口令。'
    return
  }

  state.value = 'loading'
  const result = await login(form.password)
  state.value = 'idle'
  if (!result.ok) {
    error.value = result.error
    return
  }
  showToast('登录成功，欢迎回来', 'success')
  form.password = ''
  await router.replace(redirect())
}
</script>

<template>
  <AuthLayout>
    <template #visual>
      <LoginTelemetry />
    </template>

    <MotionDiv class="login-access" :initial="{ opacity: 0, y: 6 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }">
      <div class="login-copy"><h2>登录续火花控制台</h2><p>验证本地口令后继续管理跑批。</p></div>
      <form class="login-form" @submit.prevent="handleLogin">
        <div class="field-label"><label for="password">控制台口令</label></div>
        <Input id="password" v-model="form.password" type="password" autocomplete="current-password" placeholder="输入口令" class="control-input" />
        <p v-if="error" role="alert" class="form-error"><CircleAlert :size="14" />{{ error }}</p>
        <ClickSpark class="login-submit-effect" :spark-count="5" :spark-size="5" :spark-radius="12" :duration="260">
          <Button type="submit" size="lg" class="primary-action w-full" :disabled="state === 'loading'">
            <span v-if="state === 'loading'" class="spinner" />{{ state === 'loading' ? '正在验证' : '进入控制台' }}<ArrowRight v-if="state !== 'loading'" data-icon="inline-end" />
          </Button>
        </ClickSpark>
      </form>
      <p class="demo-credentials"><KeyRound :size="14" /><span>首次访问</span><span>输入的口令将初始化控制台</span></p>
    </MotionDiv>
  </AuthLayout>
</template>
