<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type Account, type Friend } from '../api'

const accounts = ref<Account[]>([])
const friends = ref<Friend[]>([])
const accountId = ref<number | null>(null)
const name = ref('')
const msg = ref('')

onMounted(async () => {
  accounts.value = (await api.listAccounts()).items
  if (accounts.value.length > 0) await select(accounts.value[0]!.id)
})

async function select(id: number) {
  accountId.value = id
  friends.value = (await api.listFriends(id)).items
}

async function add() {
  if (accountId.value === null || !name.value.trim()) return
  msg.value = ''
  try {
    await api.createFriend(accountId.value, name.value.trim())
    name.value = ''
    await select(accountId.value)
  } catch (err) {
    msg.value = err instanceof Error ? err.message : '添加失败'
  }
}

async function remove(f: Friend) {
  if (!confirm(`删除好友「${f.name}」？`)) return
  if (accountId.value === null) return
  await api.deleteFriend(accountId.value, f.id)
  await select(accountId.value)
}
</script>

<template>
  <section>
    <h2>好友</h2>
    <p class="hint">
      跑批时在「消息」会话列表按<strong>备注 / 昵称精确匹配</strong>点击进入；请填写抖音里显示的备注。
      未匹配到会滚动列表（「设置」里的最大滚动次数）后仍失败则记为「未找到会话」并跳过，不影响其他好友。
    </p>

    <div class="row picker">
      <label>账号：</label>
      <select :value="accountId ?? ''" @change="select(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.alias }}</option>
      </select>
      <input v-model="name" placeholder="好友备注（精确匹配）" @keyup.enter="add" />
      <button :disabled="!name.trim() || accountId === null" @click="add">添加</button>
    </div>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <table>
      <thead><tr><th>ID</th><th>备注</th><th></th></tr></thead>
      <tbody>
        <tr v-for="f in friends" :key="f.id">
          <td>{{ f.id }}</td>
          <td>{{ f.name }}</td>
          <td><button class="link danger" @click="remove(f)">删除</button></td>
        </tr>
        <tr v-if="friends.length === 0"><td colspan="3" class="muted">该账号还没有好友</td></tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
h2 { font-size: 1.1rem; margin: 0 0 .5rem; }
.hint { color: #666; font-size: .8rem; margin: 0 0 1rem; line-height: 1.6; }
.row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
select, input { padding: .5rem .65rem; border: 1px solid #d5d8dd; border-radius: 6px; font: inherit; }
input { flex: 1; min-width: 180px; }
button { padding: .5rem .9rem; border: 0; border-radius: 6px; background: #fe2c55; color: #fff; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; }
button.link { background: none; color: #d92c3c; padding: 0 .25rem; font-size: .8rem; }
.msg { font-size: .8rem; color: #d92c3c; margin: 0; }
table { width: 100%; border-collapse: collapse; font-size: .85rem; }
th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #eceef1; }
th { color: #888; font-weight: 500; }
.muted { color: #888; padding: 1rem .5rem !important; }
</style>
