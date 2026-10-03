<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CircleAlert, CircleCheck, CircleX, Clock3, RefreshCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, type Run, type RunItem } from '@/api'

defineEmits<{ toast: [message: string, tone?: 'success' | 'info' | 'warning' | 'error'] }>()

const runs = ref<Run[]>([])
const statusFilter = ref('all')
const expanded = ref<Set<number>>(new Set())
const items = ref<Map<number, RunItem[]>>(new Map())
const loading = ref(false)

const filtered = computed(() => {
  if (statusFilter.value === 'all') return runs.value
  return runs.value.filter((r) => r.status === statusFilter.value)
})

const stats = computed(() => {
  const total = runs.value.length
  const success = runs.value.filter((r) => r.status === 'success').length
  const failed = runs.value.filter((r) => r.status === 'failed' || r.status === 'partial').length
  return { total, success, failed }
})

function runStatusLabel(status: string) {
  if (status === 'success') return '成功'
  if (status === 'partial') return '部分失败'
  if (status === 'failed') return '失败'
  if (status === 'running') return '进行中'
  return status
}

/** 好友明细状态：run_items.status 取值 success / failed / skipped */
function itemStatusLabel(status: string) {
  if (status === 'success') return '已发送'
  if (status === 'failed') return '发送失败'
  if (status === 'skipped') return '已跳过'
  return status
}

function triggerLabel(trigger: string) {
  if (trigger === 'manual') return '手动执行'
  if (trigger === 'schedule') return '定时调度'
  return trigger
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function load() {
  loading.value = true
  try {
    const res = await api.listRuns()
    runs.value = res.items
    items.value = new Map()
    expanded.value = new Set()
  } finally {
    loading.value = false
  }
}

async function toggle(run: Run) {
  if (expanded.value.has(run.id)) {
    expanded.value.delete(run.id)
    expanded.value = new Set(expanded.value)
    return
  }
  expanded.value.add(run.id)
  expanded.value = new Set(expanded.value)
  if (!items.value.has(run.id)) {
    try {
      const res = await api.listRunItems(run.id)
      items.value.set(run.id, res.items)
      items.value = new Map(items.value)
    } catch {
      items.value.set(run.id, [])
      items.value = new Map(items.value)
    }
  }
}

onMounted(load)
</script>

<template>
  <section class="activity-view" aria-label="运行日志">
    <div class="activity-main">
      <div class="view-toolbar">
        <Tabs :model-value="statusFilter" @update:model-value="statusFilter = String($event)">
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="success">成功</TabsTrigger>
            <TabsTrigger value="partial">部分失败</TabsTrigger>
            <TabsTrigger value="failed">失败</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" :disabled="loading" @click="load"><RefreshCw />刷新</Button>
      </div>

      <div class="timeline">
        <div v-for="run in filtered" :key="run.id" class="timeline-row" :class="{ 'is-expanded': expanded.has(run.id) }">
          <div class="timeline-axis">
            <span :style="run.status === 'success' ? 'background: var(--success)' : run.status === 'failed' ? 'background: var(--danger)' : ''" />
            <i />
          </div>
          <div>
            <strong>{{ runStatusLabel(run.status) }} · {{ triggerLabel(run.trigger) }}</strong>
            <p>{{ formatTime(run.started_at) }} 开始{{ run.finished_at ? `，${formatTime(run.finished_at)} 结束` : '，仍在进行' }}</p>
            <div v-if="expanded.has(run.id)" class="dialog-log">
              <div v-for="item in items.get(run.id) ?? []" :key="item.id" class="log-item" :class="`log-item--${item.status}`">
                <time>{{ formatTime(item.created_at) }}</time>
                <span class="log-item-icon">
                  <CircleCheck v-if="item.status === 'success'" :size="12" />
                  <CircleX v-else-if="item.status === 'failed'" :size="12" />
                  <CircleAlert v-else :size="12" />
                </span>
                <div class="log-item-copy">
                  <strong>{{ item.friend_name || '未知好友' }}</strong>
                  <small v-if="item.status === 'success'">已发送 {{ item.messages }} 条</small>
                  <small v-else-if="item.reason">{{ item.reason }}</small>
                  <small v-else>无原因明细</small>
                </div>
                <span class="log-item-badge">{{ itemStatusLabel(item.status) }}</span>
              </div>
              <div v-if="(items.get(run.id) ?? []).length === 0" class="empty-state">
                <strong>这次运行没有好友明细</strong>
              </div>
            </div>
          </div>
          <time>{{ formatTime(run.started_at) }}</time>
          <button :aria-label="expanded.has(run.id) ? '收起明细' : '展开明细'" @click="toggle(run)">
            <component :is="expanded.has(run.id) ? CircleX : Clock3" :size="14" />
          </button>
        </div>
        <div v-if="filtered.length === 0" class="empty-state">
          <strong>没有匹配的运行记录</strong>
          <span>调整筛选条件，或先执行一次跑批</span>
        </div>
      </div>
    </div>

    <aside class="security-console">
      <div class="security-visual">
        <span>累计跑批</span>
        <strong>{{ stats.total }}</strong>
        <small>成功 {{ stats.success }} · 失败 {{ stats.failed }}</small>
      </div>
      <dl>
        <div>
          <dt><Clock3 :size="14" />最近一次</dt>
          <dd>{{ runs[0] ? formatTime(runs[0].started_at) : '无' }}</dd>
        </div>
        <div>
          <dt><CircleCheck :size="14" />成功状态</dt>
          <dd>{{ runStatusLabel(runs[0]?.status ?? '无') }}</dd>
        </div>
        <div>
          <dt><CircleAlert :size="14" />触发方式</dt>
          <dd>{{ runs[0] ? triggerLabel(runs[0].trigger) : '无' }}</dd>
        </div>
      </dl>
      <Button variant="outline" class="w-full" @click="load"><RefreshCw />重新加载</Button>
    </aside>
  </section>
</template>
