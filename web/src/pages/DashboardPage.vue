<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, CalendarClock } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import NumberTicker from '@/components/effects/NumberTicker.vue'
import SpotlightSurface from '@/components/effects/SpotlightSurface.vue'
import { api } from '@/api'
import type { Account, Friend, Run, RunItem, Settings } from '@/api'

// emit 由 layout 的 <component :is @toast> 注入
const emit = defineEmits<{ toast: [message: string, tone?: 'success' | 'info' | 'warning' | 'error'] }>()

const router = useRouter()
const accounts = ref<Account[]>([])
const friends = ref<Friend[]>([])
const runs = ref<Run[]>([])
const settings = ref<Settings | null>(null)
const nextRunAt = ref<string | null>(null)

const enabledAccounts = computed(() => accounts.value.filter((a) => a.enabled).length)
const messageCount = ref(0)
const lastRun = computed(() => runs.value[0] ?? null)

const metrics = computed(() => [
  { label: '启用账号', value: String(enabledAccounts.value), note: `共 ${accounts.value.length} 个账号` },
  { label: '续火花好友', value: String(friends.value.length), note: '覆盖全部启用账号' },
  { label: '文案池', value: String(messageCount.value), note: '全局 + 专属文案' },
  { label: '最近运行', value: lastRun.value ? runStatusLabel(lastRun.value.status) : '无记录', note: lastRun.value ? formatTime(lastRun.value.started_at) : '尚未执行' },
])

function runStatusLabel(status: string) {
  if (status === 'success') return '成功'
  if (status === 'partial') return '部分失败'
  if (status === 'failed') return '失败'
  if (status === 'running') return '进行中'
  if (status === 'aborted') return '已中止'
  return status
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function scheduleText() {
  if (!settings.value) return '读取中'
  const { startHour, startMinute, endHour, endMinute } = settings.value.schedule
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(startHour)}:${pad(startMinute)} - ${pad(endHour)}:${pad(endMinute)}（${settings.value.timezone}）`
}

async function load() {
  try {
    const [accountRes, runRes, settingRes, msgRes, nextRes] = await Promise.all([
      api.listAccounts(),
      api.listRuns(),
      api.getSettings(),
      api.listMessages(),
      api.nextRun(),
    ])
    accounts.value = accountRes.items
    runs.value = runRes.items
    settings.value = settingRes
    messageCount.value = msgRes.items.length
    nextRunAt.value = nextRes.nextRunAt

    const friendLists = await Promise.all(
      accountRes.items.filter((a) => a.enabled).map((a) => api.listFriends(a.id)),
    )
    friends.value = friendLists.flatMap((r) => r.items)
  } catch (err) {
    toast(err instanceof Error ? err.message : '数据加载失败', 'error')
  }
}

// layout 通过 @toast 注入 showToast，包一层统一调用
function toast(message: string, tone?: 'success' | 'info' | 'warning' | 'error') {
  emit('toast', message, tone)
}

const recentItems = ref<Map<number, RunItem[]>>(new Map())

onMounted(async () => {
  await load()
  for (const run of runs.value.slice(0, 6)) {
    try {
      const res = await api.listRunItems(run.id)
      recentItems.value.set(run.id, res.items)
    } catch {
      recentItems.value.set(run.id, [])
    }
  }
})
</script>

<template>
  <section class="overview" aria-label="运行概览">
    <div class="metric-tape">
      <SpotlightSurface v-for="(metric, index) in metrics" :key="metric.label" as="article" class="metric-cell">
        <div class="metric-top"><span>{{ metric.label }}</span></div>
        <strong><NumberTicker :value="metric.value" :delay="index * 55" /></strong>
        <div class="metric-bottom">
          <span>{{ metric.note }}</span>
        </div>
        <div class="micro-bars" aria-hidden="true">
          <i v-for="bar in 8" :key="bar" :style="{ height: `${30 + ((bar * 37 + index * 23) % 70)}%` }" />
        </div>
      </SpotlightSurface>
    </div>

    <div class="control-deck">
      <div class="signal-board">
        <div class="signal-head">
          <div class="signal-title">
            <h2>运行操作</h2>
          </div>
        </div>
        <div class="signal-summary">
          <div>
            <strong>{{ scheduleText() }}</strong>
            <span><CalendarClock :size="12" />每日调度窗口</span>
          </div>
          <div>
            <span>下次运行</span>
            <strong>{{ nextRunAt ? formatTime(nextRunAt) : '未调度' }}</strong>
          </div>
        </div>
        <div class="channel-strip">
          <div>
            <span><i class="channel-dot strong" />每个好友发送</span>
            <strong>{{ settings ? `${settings.perFriendMessages[0]} - ${settings.perFriendMessages[1]} 条` : '-' }}</strong>
            <small>随机区间</small>
          </div>
          <div>
            <span><i class="channel-dot" />好友乱序</span>
            <strong>{{ settings?.shuffleFriends ? '开启' : '关闭' }}</strong>
            <small>shuffleFriends</small>
          </div>
          <div>
            <span><i class="channel-dot" />同好友去重</span>
            <strong>{{ settings?.dedupeMessagesPerFriend ? '开启' : '关闭' }}</strong>
            <small>dedupeMessagesPerFriend</small>
          </div>
        </div>
      </div>

      <aside class="live-stream">
        <div class="stream-head">
          <div><h2>最近运行</h2><p aria-live="polite"><i class="stream-state-dot" />{{ lastRun ? `上次：${formatTime(lastRun.started_at)}` : '暂无运行记录' }}</p></div>
        </div>
        <div class="stream-list">
          <div v-for="run in runs.slice(0, 6)" :key="run.id" class="stream-event">
            <time>{{ formatTime(run.started_at) }}</time>
            <i :class="run.status === 'success' ? 'strong' : run.status === 'failed' ? 'warning' : ''" />
            <div>
              <strong>{{ runStatusLabel(run.status) }} · {{ run.trigger }}</strong>
              <span>{{ recentItems.get(run.id)?.length ?? 0 }} 个好友明细</span>
            </div>
          </div>
        </div>
        <Button variant="ghost" class="stream-action" @click="router.push({ name: 'logs' })">查看全部日志<ArrowRight data-icon="inline-end" /></Button>
      </aside>
    </div>

    <section class="queue-panel">
      <div class="queue-head"><div><h2>最近运行</h2><p>按开始时间倒序</p></div><Button variant="outline" size="sm" @click="router.push({ name: 'logs' })">查看全部</Button></div>
      <div class="queue-table" role="table" aria-label="最近运行">
        <div v-for="run in runs.slice(0, 6)" :key="run.id" class="queue-row" role="row">
          <span class="queue-status"><i /></span>
          <strong>{{ formatTime(run.started_at) }}</strong>
          <span>{{ run.trigger }}</span>
          <time>{{ run.finished_at ? formatTime(run.finished_at) : '进行中' }}</time>
          <small :class="`priority-${run.status === 'success' ? '中' : '高'}`">{{ runStatusLabel(run.status) }}</small>
          <div class="queue-progress"><i :style="{ width: run.status === 'success' ? '100%' : run.status === 'running' ? '50%' : '70%' }" /></div>
          <Button variant="ghost" size="icon-sm" aria-label="查看明细" @click="router.push({ name: 'logs' })"><ArrowRight /></Button>
        </div>
        <div v-if="runs.length === 0" class="empty-state">
          <strong>还没有运行记录</strong>
          <span>到达每日调度窗口后自动运行</span>
        </div>
      </div>
    </section>
  </section>
</template>
