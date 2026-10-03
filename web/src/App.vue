<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from './api'
import { store } from './store'

const route = useRoute()
const menu = [
  ['/dashboard', '仪表盘'],
  ['/accounts', '账号'],
  ['/friends', '好友'],
  ['/messages', '文案'],
  ['/settings', '设置'],
  ['/logs', '日志'],
] as const

const clock = ref('')
setInterval(() => { clock.value = new Date().toLocaleTimeString() }, 1000)
const active = computed(() => route.path)

async function logout() {
  await api.logout()
  location.href = '/#/login'
}
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand">DouyinSpark</div>
      <nav>
        <a v-for="[path, label] in menu" :key="path" :class="{ on: active.startsWith(path) }" :href="'#' + path">{{ label }}</a>
      </nav>
      <div class="foot">
        <span class="badge" :class="store.running ? 'run' : 'idle'">{{ store.running ? '跑批中' : '空闲' }}</span>
        <button class="link" @click="logout">退出</button>
      </div>
    </aside>
    <main>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
aside { background: #1b1d21; color: #e8eaee; display: flex; flex-direction: column; padding: 1rem .75rem; gap: 1rem; }
.brand { font-weight: 600; padding: .5rem .5rem 0; }
nav { display: flex; flex-direction: column; gap: .15rem; }
nav a { color: #b8bdc7; text-decoration: none; padding: .5rem .6rem; border-radius: 6px; font-size: .9rem; }
nav a:hover { background: #26292f; color: #fff; }
nav a.on { background: #fe2c55; color: #fff; }
.foot { margin-top: auto; display: flex; flex-direction: column; gap: .5rem; padding: 0 .25rem; }
.badge { font-size: .7rem; padding: .2rem .5rem; border-radius: 999px; width: fit-content; }
.badge.idle { background: #2a2e34; color: #9aa1ad; }
.badge.run { background: #3b2a12; color: #f0b357; }
button.link { background: none; border: 0; color: #9aa1ad; font: inherit; font-size: .8rem; padding: 0; cursor: pointer; text-align: left; }
button.link:hover { color: #fff; }
main { background: #f5f6f8; padding: 1.5rem; overflow-x: auto; }
</style>


