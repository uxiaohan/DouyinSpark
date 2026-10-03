<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type Account } from '../api'

const accounts = ref<Account[]>([])
const busy = ref(false)
const msg = ref('')

const form = ref({ alias: '', cookie_json: '', proxy_server: '', proxy_username: '', proxy_password: '', daily_cap: '' })
const editing = ref<number | null>(null)

onMounted(load)
async function load() { accounts.value = (await api.listAccounts()).items }

async function save() {
  busy.value = true
  msg.value = ''
  try {
    const payload: Record<string, unknown> = {
      alias: form.value.alias,
      proxy_server: form.value.proxy_server || null,
      proxy_username: form.value.proxy_username || null,
      proxy_password: form.value.proxy_password || null,
    }
    if (form.value.cookie_json) payload.cookie_json = form.value.cookie_json
    if (form.value.daily_cap) payload.daily_cap = Number(form.value.daily_cap)
    if (editing.value === null) await api.createAccount(payload as never)
    else await api.updateAccount(editing.value, payload)
    form.value = { alias: '', cookie_json: '', proxy_server: '', proxy_username: '', proxy_password: '', daily_cap: '' }
    editing.value = null
    await load()
    msg.value = '已保存'
  } catch (err) {
    msg.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    busy.value = false
  }
}

function edit(a: Account) {
  editing.value = a.id
  form.value = { alias: a.alias, cookie_json: '', proxy_server: a.proxy_server ?? '', proxy_username: '', proxy_password: '', daily_cap: a.daily_cap?.toString() ?? '' }
}

async function toggle(a: Account) {
  await api.updateAccount(a.id, { enabled: !a.enabled })
  await load()
}

async function remove(a: Account) {
  if (!confirm(`删除账号「${a.alias}」及其好友与文案？`)) return
  await api.deleteAccount(a.id)
  await load()
}
</script>

<template>
  <section>
    <h2>账号</h2>
    <p class="hint">cookie 只粘贴、不回显（Cookie-Editor 导出的 JSON 数组，域名须含 douyin）；代理支持 socks5:// / http:// / https://。</p>

    <form class="card" @submit.prevent="save">
      <div class="row">
        <input v-model="form.alias" placeholder="别名（必填）" required />
        <input v-model="form.daily_cap" type="number" min="0" placeholder="日上限（留空用全局）" />
      </div>
      <textarea v-model="form.cookie_json" rows="3" :placeholder="editing === null ? '粘贴 Cookie JSON（写入后不可回显）' : '留空表示不修改 cookie'" />
      <div class="row">
        <input v-model="form.proxy_server" placeholder="代理地址，如 socks5://127.0.0.1:1080" />
        <input v-model="form.proxy_username" placeholder="代理用户名（可空）" />
        <input v-model="form.proxy_password" type="password" placeholder="代理密码（可空）" />
      </div>
      <div class="row">
        <button :disabled="busy || !form.alias" type="submit">{{ editing === null ? '新增账号' : '保存修改' }}</button>
        <button v-if="editing !== null" class="ghost" type="button" @click="editing = null; form = { alias: '', cookie_json: '', proxy_server: '', proxy_username: '', proxy_password: '', daily_cap: '' }">取消</button>
      </div>
      <p v-if="msg" class="msg">{{ msg }}</p>
    </form>

    <table>
      <thead><tr><th>ID</th><th>别名</th><th>cookie</th><th>代理</th><th>日上限</th><th>上次运行</th><th>启用</th><th></th></tr></thead>
      <tbody>
        <tr v-for="a in accounts" :key="a.id">
          <td>{{ a.id }}</td>
          <td>{{ a.alias }}</td>
          <td>{{ a.hasCookie ? '已配置' : '未配置' }}</td>
          <td class="muted">{{ a.proxy_server ?? '—' }}{{ a.proxy_username ? '（已设账号）' : '' }}</td>
          <td>{{ a.daily_cap ?? '全局' }}</td>
          <td class="muted">{{ a.last_run_at ? new Date(a.last_run_at).toLocaleString() : '—' }}</td>
          <td><input type="checkbox" :checked="a.enabled" @change="toggle(a)" /></td>
          <td class="row actions">
            <button class="link" @click="edit(a)">编辑</button>
            <button class="link danger" @click="remove(a)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
h2 { font-size: 1.1rem; margin: 0 0 .5rem; }
.hint { color: #666; font-size: .8rem; margin: 0 0 1rem; }
.card { background: #fff; border: 1px solid #e6e8ec; border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
.row { display: flex; gap: .5rem; flex-wrap: wrap; }
input, textarea { padding: .5rem .65rem; border: 1px solid #d5d8dd; border-radius: 6px; font: inherit; flex: 1; min-width: 140px; }
textarea { font-family: ui-monospace, monospace; font-size: .75rem; resize: vertical; }
button { padding: .45rem .9rem; border: 0; border-radius: 6px; background: #fe2c55; color: #fff; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; }
button.ghost { background: #eef0f3; color: #333; }
button.link { background: none; color: #2f6fdb; padding: 0 .25rem; font-size: .8rem; }
button.link.danger { color: #d92c3c; }
.actions { gap: .35rem; }
.msg { font-size: .8rem; color: #1f9d4e; margin: 0; }
table { width: 100%; border-collapse: collapse; font-size: .85rem; margin-top: 1rem; }
th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #eceef1; }
th { color: #888; font-weight: 500; }
.muted { color: #888; }
</style>
