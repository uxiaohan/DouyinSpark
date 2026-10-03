<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, Search, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { api, type Account, type Friend } from '@/api'
import { useConfirm } from '@/composables/useConfirm'

const emit = defineEmits<{ toast: [message: string, tone?: 'success' | 'info' | 'warning' | 'error'] }>()
function toast(message: string, tone?: 'success' | 'info' | 'warning' | 'error') {
  emit('toast', message, tone)
}

const { confirm: confirmDialog } = useConfirm()

const accounts = ref<Account[]>([])
const activeId = ref<number | null>(null)
const friends = ref<Friend[]>([])
const search = ref('')
const dialogOpen = ref(false)
const newName = ref('')
const saving = ref(false)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return friends.value
  return friends.value.filter((f) => f.name.toLowerCase().includes(q))
})

const activeAccount = computed(() => accounts.value.find((a) => a.id === activeId.value) ?? null)

function formatTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function loadAccounts() {
  try {
    const res = await api.listAccounts()
    accounts.value = res.items
    if (res.items.length > 0 && activeId.value === null) {
      activeId.value = res.items[0]!.id
    }
    if (activeId.value !== null) await loadFriends(activeId.value)
  } catch (err) {
    toast(err instanceof Error ? err.message : '加载失败', 'error')
  }
}

async function loadFriends(accountId: number) {
  try {
    const res = await api.listFriends(accountId)
    friends.value = res.items
  } catch (err) {
    toast(err instanceof Error ? err.message : '加载好友失败', 'error')
  }
}

async function switchAccount(id: number) {
  activeId.value = id
  search.value = ''
  await loadFriends(id)
}

function openCreate() {
  if (activeId.value === null) {
    toast('请先在账号页添加账号', 'warning')
    return
  }
  newName.value = ''
  dialogOpen.value = true
}

async function add() {
  const name = newName.value.trim()
  if (!name || activeId.value === null) return
  saving.value = true
  try {
    await api.createFriend(activeId.value, name)
    dialogOpen.value = false
    toast(`已添加好友「${name}」`, 'success')
    await loadFriends(activeId.value)
  } catch (err) {
    toast(err instanceof Error ? err.message : '添加失败', 'error')
  } finally {
    saving.value = false
  }
}

async function remove(friend: Friend) {
  if (activeId.value === null) return
  const ok = await confirmDialog({
    message: `确认删除好友「${friend.name}」？删除后运行将不再向其续火花。`,
    tone: 'warning',
  })
  if (!ok) return
  try {
    await api.deleteFriend(activeId.value, friend.id)
    toast('好友已删除', 'success')
    await loadFriends(activeId.value)
  } catch (err) {
    toast(err instanceof Error ? err.message : '删除失败', 'error')
  }
}

onMounted(loadAccounts)
</script>

<template>
  <section class="users-view" aria-label="好友管理">
    <div class="view-toolbar">
      <div class="search-wrap">
        <Search :size="14" />
        <Input v-model="search" placeholder="搜索好友昵称" aria-label="搜索好友" />
      </div>
      <Button class="primary-action" @click="openCreate"><Plus />添加好友</Button>
    </div>

    <div class="member-summary">
      <div><span>当前账号</span><strong>{{ activeAccount?.alias ?? '未选择' }}</strong></div>
      <div><span>好友总数</span><strong>{{ friends.length }}</strong></div>
      <div><span>匹配结果</span><strong>{{ filtered.length }}</strong></div>
      <div class="member-signal">
        <span>账号覆盖</span>
        <strong>{{ accounts.length }} 个账号</strong>
        <i><b :style="{ width: accounts.length ? '100%' : '0%' }" /></i>
      </div>
    </div>

    <div class="console-tabs">
      <Tabs :model-value="String(activeId ?? '')" @update:model-value="switchAccount(Number($event))">
        <TabsList>
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
            <th>好友</th>
            <th>添加时间</th>
            <th><span class="sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="friend in filtered" :key="friend.id">
            <td>
              <div class="user-cell">
                <span class="avatar">{{ friend.name.slice(0, 1) }}</span>
                <div><strong>{{ friend.name }}</strong><small>ID {{ friend.id }}</small></div>
              </div>
            </td>
            <td>{{ formatTime(friend.created_at) }}</td>
            <td>
              <div class="row-actions">
                <Button variant="ghost" size="icon-sm" :aria-label="`删除 ${friend.name}`" @click="remove(friend)"><Trash2 /></Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="filtered.length === 0" class="empty-state">
        <strong>该账号还没有好友</strong>
        <span>点击「添加好友」填写抖音好友昵称</span>
      </div>
    </div>

    <div class="table-footer">
      <span>共 {{ filtered.length }} 个好友</span>
      <div><span>好友昵称需与抖音会话列表显示一致</span></div>
    </div>
  </section>

  <Dialog :open="dialogOpen" @update:open="dialogOpen = $event">
    <DialogContent class="showcase-dialog" :show-close-button="true">
      <DialogHeader>
        <DialogTitle>添加好友</DialogTitle>
        <DialogDescription>昵称需与抖音会话列表中的显示一致。</DialogDescription>
      </DialogHeader>
      <div class="dialog-form">
        <label for="friend-name">好友昵称</label>
        <Input id="friend-name" v-model="newName" placeholder="例如：小明 阿花" @keyup.enter="add" />
      </div>
      <DialogFooter class="showcase-dialog-footer">
        <Button variant="outline" @click="dialogOpen = false">取消</Button>
        <Button class="primary-action" :disabled="saving" @click="add">{{ saving ? '添加中' : '添加' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
