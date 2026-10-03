<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, Search, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { api, type Account, type Message } from '@/api'
import { useConfirm } from '@/composables/useConfirm'

const emit = defineEmits<{ toast: [message: string, tone?: 'success' | 'info' | 'warning' | 'error'] }>()
function toast(message: string, tone?: 'success' | 'info' | 'warning' | 'error') {
  emit('toast', message, tone)
}

const { confirm: confirmDialog } = useConfirm()

const accounts = ref<Account[]>([])
/** scope: 'global' 或账号 id 字符串 */
const scope = ref('global')
const messages = ref<Message[]>([])
const search = ref('')
const dialogOpen = ref(false)
const draft = ref('')
const saving = ref(false)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return messages.value
  return messages.value.filter((m) => m.text.toLowerCase().includes(q))
})

const globalCount = computed(() => messages.value.filter((m) => m.account_id === null).length)
const exclusiveCount = computed(() => messages.value.filter((m) => m.account_id !== null).length)

function scopeAccountId(): number | null {
  return scope.value === 'global' ? null : Number(scope.value)
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load() {
  try {
    const [accountRes, globalRes] = await Promise.all([api.listAccounts(), api.listMessages()])
    accounts.value = accountRes.items
    messages.value = globalRes.items
    if (scope.value !== 'global') {
      const res = await api.listMessages(Number(scope.value))
      messages.value = res.items
    }
  } catch (err) {
    toast(err instanceof Error ? err.message : '加载失败', 'error')
  }
}

async function switchScope(next: string) {
  scope.value = next
  search.value = ''
  const id = scopeAccountId()
  try {
    const res = id === null ? await api.listMessages() : await api.listMessages(id)
    messages.value = res.items
  } catch (err) {
    toast(err instanceof Error ? err.message : '加载失败', 'error')
  }
}

function openCreate() {
  draft.value = ''
  dialogOpen.value = true
}

async function add() {
  const text = draft.value.trim()
  if (!text) {
    toast('请输入文案内容', 'warning')
    return
  }
  saving.value = true
  try {
    await api.createMessage(text, scopeAccountId())
    dialogOpen.value = false
    toast('文案已加入池', 'success')
    await switchScope(scope.value)
  } catch (err) {
    toast(err instanceof Error ? err.message : '添加失败', 'error')
  } finally {
    saving.value = false
  }
}

async function remove(message: Message) {
  const ok = await confirmDialog({
    message: `确认删除文案「${message.text.slice(0, 20)}…」？删除后将从发送池移除。`,
    tone: 'warning',
  })
  if (!ok) return
  try {
    await api.deleteMessage(message.id)
    toast('文案已删除', 'success')
    await switchScope(scope.value)
  } catch (err) {
    toast(err instanceof Error ? err.message : '删除失败', 'error')
  }
}

onMounted(load)
</script>

<template>
  <section class="users-view" aria-label="文案池">
    <div class="view-toolbar">
      <div class="search-wrap">
        <Search :size="14" />
        <Input v-model="search" placeholder="搜索文案内容" aria-label="搜索文案" />
      </div>
      <Button class="primary-action" @click="openCreate"><Plus />新增文案</Button>
    </div>

    <div class="member-summary">
      <div><span>全局文案</span><strong>{{ globalCount }}</strong></div>
      <div><span>专属文案</span><strong>{{ exclusiveCount }}</strong></div>
      <div><span>当前范围</span><strong>{{ scope === 'global' ? '全局池' : '专属池' }}</strong></div>
      <div class="member-signal">
        <span>挑选规则</span>
        <strong>有专属只发专属，轮空本池重抽</strong>
        <i><b style="width: 100%" /></i>
      </div>
    </div>

    <div class="console-tabs">
      <Tabs :model-value="scope" @update:model-value="switchScope(String($event))">
        <TabsList>
          <TabsTrigger value="global">全局池</TabsTrigger>
          <TabsTrigger v-for="account in accounts" :key="account.id" :value="String(account.id)">
            {{ account.alias }}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <div class="data-surface">
      <table>
        <thead>
          <tr>
            <th>文案</th>
            <th>范围</th>
            <th>加入时间</th>
            <th><span class="sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="message in filtered" :key="message.id">
            <td class="message-cell">{{ message.text }}</td>
            <td>
              <span class="status-badge">
                <i :class="message.account_id === null ? 'is-info' : 'is-warning'" />
                {{ message.account_id === null ? '全局' : '专属' }}
              </span>
            </td>
            <td>{{ formatTime(message.created_at) }}</td>
            <td>
              <div class="row-actions">
                <Button variant="ghost" size="icon-sm" :aria-label="`删除文案 ${message.id}`" @click="remove(message)"><Trash2 /></Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="filtered.length === 0" class="empty-state">
        <strong>这个池还是空的</strong>
        <span>点击「新增文案」把续火花文案加入发送池</span>
      </div>
    </div>

    <div class="table-footer">
      <span>共 {{ filtered.length }} 条文案</span>
      <div><span>专属账号有专属文案时，全局文案不参与发送</span></div>
    </div>
  </section>

  <Dialog :open="dialogOpen" @update:open="dialogOpen = $event">
    <DialogContent class="showcase-dialog" :show-close-button="true">
      <DialogHeader>
        <DialogTitle>新增文案</DialogTitle>
        <DialogDescription>文案将加入当前选中的发送池，跑批时按挑选策略抽取。</DialogDescription>
      </DialogHeader>
      <div class="dialog-form">
        <label for="message-text">文案内容</label>
        <Textarea id="message-text" v-model="draft" placeholder="例如：今天也要记得想我" />
      </div>
      <DialogFooter class="showcase-dialog-footer">
        <Button variant="outline" @click="dialogOpen = false">取消</Button>
        <Button class="primary-action" :disabled="saving" @click="add">{{ saving ? '添加中' : '加入池' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
