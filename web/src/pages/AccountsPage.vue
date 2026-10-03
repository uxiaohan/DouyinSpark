<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Pencil, Plus, Search, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { api, type Account } from '@/api'
import { useConfirm } from '@/composables/useConfirm'

const emit = defineEmits<{ toast: [message: string, tone?: 'success' | 'info' | 'warning' | 'error'] }>()
function toast(message: string, tone?: 'success' | 'info' | 'warning' | 'error') {
  emit('toast', message, tone)
}

const { confirm: confirmDialog } = useConfirm()

const accounts = ref<Account[]>([])
const search = ref('')
const dialogOpen = ref(false)
const editing = ref<Account | null>(null)
const saving = ref(false)

const form = ref({
  alias: '',
  cookie_json: '',
  proxy_server: '',
  proxy_username: '',
  proxy_password: '',
  enabled: true,
  daily_cap: '',
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return accounts.value
  return accounts.value.filter((a) => a.alias.toLowerCase().includes(q))
})

const enabledCount = computed(() => accounts.value.filter((a) => a.enabled).length)
const cookieReady = computed(() => accounts.value.filter((a) => a.hasCookie).length)

function formatTime(iso: string | null) {
  if (!iso) return '从未运行'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load() {
  try {
    const res = await api.listAccounts()
    accounts.value = res.items
  } catch (err) {
    toast(err instanceof Error ? err.message : '加载失败', 'error')
  }
}

function openCreate() {
  editing.value = null
  form.value = { alias: '', cookie_json: '', proxy_server: '', proxy_username: '', proxy_password: '', enabled: true, daily_cap: '' }
  dialogOpen.value = true
}

function openEdit(account: Account) {
  editing.value = account
  form.value = {
    alias: account.alias,
    cookie_json: '',
    proxy_server: account.proxy_server ?? '',
    proxy_username: '',
    proxy_password: '',
    enabled: account.enabled,
    daily_cap: account.daily_cap === null ? '' : String(account.daily_cap),
  }
  dialogOpen.value = true
}

async function save() {
  if (!form.value.alias.trim()) {
    toast('请填写账号别名', 'warning')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      const patch: Record<string, unknown> = {
        alias: form.value.alias.trim(),
        enabled: form.value.enabled,
        daily_cap: form.value.daily_cap.trim() === '' ? null : Number(form.value.daily_cap),
      }
      if (form.value.cookie_json.trim()) patch.cookie_json = form.value.cookie_json.trim()
      if (form.value.proxy_server.trim()) patch.proxy_server = form.value.proxy_server.trim()
      await api.updateAccount(editing.value.id, patch)
      toast('账号已更新', 'success')
    } else {
      if (!form.value.cookie_json.trim()) {
        toast('新账号需要粘贴 cookie JSON', 'warning')
        saving.value = false
        return
      }
      await api.createAccount({
        alias: form.value.alias.trim(),
        cookie_json: form.value.cookie_json.trim(),
        proxy_server: form.value.proxy_server.trim() || undefined,
        enabled: form.value.enabled,
        daily_cap: form.value.daily_cap.trim() === '' ? null : Number(form.value.daily_cap),
      })
      toast('账号已创建', 'success')
    }
    dialogOpen.value = false
    await load()
  } catch (err) {
    toast(err instanceof Error ? err.message : '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function remove(account: Account) {
  const ok = await confirmDialog({
    message: `确认删除账号「${account.alias}」？其好友与专属文案会一并删除。`,
    tone: 'warning',
  })
  if (!ok) return
  try {
    await api.deleteAccount(account.id)
    toast('账号已删除', 'success')
    await load()
  } catch (err) {
    toast(err instanceof Error ? err.message : '删除失败', 'error')
  }
}

onMounted(load)
</script>

<template>
  <section class="users-view" aria-label="账号管理">
    <div class="view-toolbar">
      <div class="search-wrap">
        <Search :size="14" />
        <Input v-model="search" placeholder="搜索账号别名" aria-label="搜索账号" />
      </div>
      <Button class="primary-action" @click="openCreate"><Plus />新增账号</Button>
    </div>

    <div class="member-summary">
      <div><span>账号总数</span><strong>{{ accounts.length }}</strong></div>
      <div><span>启用中</span><strong>{{ enabledCount }}</strong></div>
      <div><span>Cookie 就绪</span><strong>{{ cookieReady }}</strong></div>
      <div class="member-signal">
        <span>Cookie 就绪率</span>
        <strong>{{ accounts.length ? Math.round((cookieReady / accounts.length) * 100) : 0 }}%</strong>
        <i><b :style="{ width: accounts.length ? `${(cookieReady / accounts.length) * 100}%` : '0%' }" /></i>
      </div>
    </div>

    <div class="data-surface">
      <table>
        <thead>
          <tr>
            <th>账号</th>
            <th>登录态</th>
            <th>代理</th>
            <th>每日上限</th>
            <th>状态</th>
            <th>最近运行</th>
            <th><span class="sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="account in filtered" :key="account.id">
            <td>
              <div class="user-cell">
                <span class="avatar">{{ account.alias.slice(0, 1) }}</span>
                <div><strong>{{ account.alias }}</strong><small>ID {{ account.id }}</small></div>
              </div>
            </td>
            <td><span class="status-badge"><i :class="account.hasCookie ? 'is-success' : 'is-warning'" />{{ account.hasCookie ? '已配置' : '缺失' }}</span></td>
            <td>{{ account.proxy_server ?? '本机直连' }}</td>
            <td>{{ account.daily_cap ?? '默认' }}</td>
            <td><span class="status-badge"><i :class="account.enabled ? 'is-info' : 'is-neutral'" />{{ account.enabled ? '启用' : '停用' }}</span></td>
            <td>{{ formatTime(account.last_run_at) }}</td>
            <td>
              <div class="row-actions">
                <Button variant="ghost" size="icon-sm" :aria-label="`编辑 ${account.alias}`" @click="openEdit(account)"><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" :aria-label="`删除 ${account.alias}`" @click="remove(account)"><Trash2 /></Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="filtered.length === 0" class="empty-state">
        <strong>没有匹配的账号</strong>
        <span>点击「新增账号」粘贴抖音 cookie 开始</span>
      </div>
    </div>

    <div class="table-footer">
      <span>共 {{ filtered.length }} 个账号</span>
      <div><span>别名或 Cookie 变更后建议在下次调度窗口关注运行日志</span></div>
    </div>
  </section>

  <Dialog :open="dialogOpen" @update:open="dialogOpen = $event">
    <DialogContent class="showcase-dialog" :show-close-button="true">
      <DialogHeader>
        <DialogTitle>{{ editing ? '编辑账号' : '新增账号' }}</DialogTitle>
        <DialogDescription>{{ editing ? '留空的字段保持不变。' : '粘贴从浏览器复制的抖音 cookie JSON。' }}</DialogDescription>
      </DialogHeader>
      <div class="dialog-form">
        <label for="account-alias">别名</label>
        <Input id="account-alias" v-model="form.alias" placeholder="例如：我的" />
        <label for="account-cookie">Cookie JSON{{ editing ? '（留空则不更新）' : '' }}</label>
        <Textarea id="account-cookie" v-model="form.cookie_json" placeholder='[{"name":"sessionid","value":"...","domain":".douyin.com"}]' />
        <label for="account-proxy">代理服务器（可选）</label>
        <Input id="account-proxy" v-model="form.proxy_server" placeholder="http://127.0.0.1:7890" />
        <label for="account-cap">每日上限（留空为默认）</label>
        <Input id="account-cap" v-model="form.daily_cap" placeholder="例如：50" />
        <label class="remember-row"><input v-model="form.enabled" type="checkbox"><span>启用该账号</span></label>
      </div>
      <DialogFooter class="showcase-dialog-footer">
        <Button variant="outline" @click="dialogOpen = false">取消</Button>
        <Button class="primary-action" :disabled="saving" @click="save">{{ saving ? '保存中' : '保存' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
