<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const password = ref('')
const error = ref('')
const busy = ref(false)
const router = useRouter()

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await api.login(password.value)
    router.push('/dashboard')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <form class="card" @submit.prevent="submit">
      <h1>DouyinSpark</h1>
      <p class="hint">续火花控制台 · 输入管理员口令</p>
      <input v-model="password" type="password" placeholder="口令" autocomplete="current-password" @keyup.enter="submit" />
      <button :disabled="busy || !password" type="submit">{{ busy ? '登录中…' : '登录' }}</button>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>
</template>

<style scoped>
.login { min-height: 100vh; display: grid; place-items: center; background: #f5f6f8; }
.card { background: #fff; padding: 2.5rem; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,.08); width: 320px; display: flex; flex-direction: column; gap: .75rem; }
h1 { font-size: 1.25rem; margin: 0; }
.hint { color: #666; font-size: .85rem; margin: 0; }
input { padding: .6rem .75rem; border: 1px solid #d5d8dd; border-radius: 6px; font: inherit; }
button { padding: .6rem; border: 0; border-radius: 6px; background: #fe2c55; color: #fff; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.error { color: #d92c3c; font-size: .8rem; margin: 0; }
</style>
