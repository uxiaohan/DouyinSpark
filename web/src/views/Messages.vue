<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type Account, type Message } from '../api'

const accounts = ref<Account[]>([])
const messages = ref<Message[]>([])
/** 'global' | number（账号 ID） */
const scope = ref<'global' | number>('global')
const text = ref('')
const msg = ref('')

onMounted(load)

async function load() {
  accounts.value = (await api.listAccounts()).items
  messages.value = scope.value === 'global'
    ? (await api.listMessages()).items.filter((m) => m.account_id === null)
    : (await api.listMessages(scope.value)).items
}

async function changeScope(v: string) {
  scope.value = v === 'global' ? 'global' : Number(v)
  await load()
}

async function add() {
  if (!text.value.trim()) return
  msg.value = ''
  try {
    await api.createMessage(text.value.trim(), scope.value === 'global' ? null : scope.value)
    text.value = ''
    await load()
  } catch (err) {
    msg.value = err instanceof Error ? err.message : '添加失败'
  }
}

async function remove(m: Message) {
  await api.deleteMessage(m.id)
  await load()
}
</script>

<template>
  <section>
    <h2>文案</h2>
    <p class="hint">只发文字私信，支持 Unicode emoji；暂不支持抖音原生表情。</p>

    <div class="row picker">
      <label>范围：</label>
      <select :value="String(scope)" @change="changeScope(($event.target as HTMLSelectElement).value)">
        <option value="global">全局文案池（所有账号可用）</option>
        <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.alias }}（专属）</option>
      </select>
    </div>

    <form class="row" @submit.prevent="add">
      <input v-model="text" placeholder="输入一条文案" />
      <button :disabled="!text.trim()" type="submit">添加</button>
    </form>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <table>
      <thead><tr><th>ID</th><th>文案</th><th></th></tr></thead>
      <tbody>
        <tr v-for="m in messages" :key="m.id">
          <td>{{ m.id }}</td>
          <td>{{ m.text }}</td>
          <td><button class="link danger" @click="remove(m)">删除</button></td>
        </tr>
        <tr v-if="messages.length === 0"><td colspan="3" class="muted">暂无文案</td></tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
h2 { font-size: 1.1rem; margin: 0 0 .5rem; }
.hint { color: #666; font-size: .8rem; margin: 0 0 1rem; }
.row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
select, input { padding: .5rem .65rem; border: 1px solid #d5d8dd; border-radius: 6px; font: inherit; }
input { flex: 1; min-width: 200px; }
button { padding: .5rem .9rem; border: 0; border-radius: 6px; background: #fe2c55; color: #fff; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; }
button.link { background: none; color: #d92c3c; padding: 0 .25rem; font-size: .8rem; }
.msg { font-size: .8rem; color: #d92c3c; margin: 0; }
table { width: 100%; border-collapse: collapse; font-size: .85rem; }
th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #eceef1; }
th { color: #888; font-weight: 500; }
.muted { color: #888; padding: 1rem .5rem !important; }
</style>
