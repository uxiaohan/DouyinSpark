<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { api, type Run, type RunItem } from '../api'
import { store } from '../store'

const nextRunAt = ref<string | null>(null)
const nextRunLoaded = ref(false)
const runs = ref<Run[]>([])
const items = ref<RunItem[]>([])
const openRunId = ref<number | null>(null)
const busy = ref(false)
const msg = ref('')

const last = computed(() => runs.value[0] ?? null)

// null 是"调度没在跑"（--web-only 或进程刚起还没排上），空串是还没加载完，两者要分开
const nextRunLabel = computed(() => {
  if (!nextRunLoaded.value) return '—'
  return nextRunAt.value ? new Date(nextRunAt.value).toLocaleString() : '调度未运行'
})

function summary(run: Run) {
  if (!run.summary_json) return null
  try { return JSON.parse(run.summary_json) as { status: string; totals: { success: number; failed: number; skipped: number }; accounts: unknown[] } } catch { return null }
}

onMounted(load)

async function load() {
  nextRunAt.value = (await api.nextRun()).nextRunAt
  nextRunLoaded.value = true
  runs.value = (await api.listRuns()).items
}

async function runNow() {
  busy.value = true
  msg.value = ''
  try {
    await api.runNow()
    store.running = true
  } catch (err) {
    msg.value = err instanceof Error ? err.message : '触发失败'
  } finally {
    busy.value = false
  }
}

async function stop() {
  await api.stop()
  msg.value = '已请求停止'
}

async function toggleItems(id: number) {
  openRunId.value = openRunId.value === id ? null : id
  items.value = openRunId.value === null ? [] : (await api.listRunItems(id)).items
}
</script>

<template>
  <section>
    <h2>仪表盘</h2>

    <div class="grid">
      <div class="card">
        <span class="label">下次运行</span>
        <strong>{{ nextRunLabel }}</strong>
        <div class="row">
          <button :disabled="busy" @click="runNow">立即执行</button>
          <button class="ghost" @click="stop">停止</button>
        </div>
        <p v-if="msg" class="msg">{{ msg }}</p>
      </div>

      <div class="card">
        <span class="label">上次跑批</span>
        <template v-if="last">
          <strong :class="'st-' + last.status">{{ last.status }}<small v-if="summary(last)">（成功 {{ summary(last)!.totals.success }} / 失败 {{ summary(last)!.totals.failed }} / 跳过 {{ summary(last)!.totals.skipped }}）</small></strong>
          <span class="muted">{{ new Date(last.started_at).toLocaleString() }} · 触发：{{ last.trigger }}</span>
        </template>
        <span v-else class="muted">还没有跑批记录</span>
      </div>
    </div>

    <h3>最近跑批</h3>
    <table>
      <thead><tr><th>ID</th><th>触发</th><th>开始</th><th>状态</th><th></th></tr></thead>
      <tbody>
        <tr v-for="r in runs" :key="r.id">
          <td>{{ r.id }}</td>
          <td>{{ r.trigger }}</td>
          <td>{{ new Date(r.started_at).toLocaleString() }}</td>
          <td :class="'st-' + r.status">{{ r.status }}</td>
          <td><button class="link" @click="toggleItems(r.id)">{{ openRunId === r.id ? '收起' : '明细' }}</button></td>
        </tr>
      </tbody>
    </table>

    <table v-if="openRunId !== null">
      <thead><tr><th>好友</th><th>状态</th><th>条数</th><th>原因</th></tr></thead>
      <tbody>
        <tr v-for="i in items" :key="i.id">
          <td>{{ i.friend_name }}</td>
          <td :class="'st-' + i.status">{{ i.status }}</td>
          <td>{{ i.messages }}</td>
          <td class="muted">{{ i.reason ?? '' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
h2 { font-size: 1.1rem; margin: 0 0 1rem; }
h3 { font-size: .95rem; margin: 1.5rem 0 .5rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
.card { background: #fff; border: 1px solid #e6e8ec; border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: .5rem; }
.label { font-size: .75rem; color: #888; }
.muted { color: #888; font-size: .8rem; }
.msg { font-size: .8rem; color: #259c4b; margin: 0; }
strong { font-size: 1.05rem; }
strong small { font-weight: normal; color: #666; font-size: .75rem; margin-left: .4rem; }
.row { display: flex; gap: .5rem; margin-top: .25rem; }
button { padding: .45rem .9rem; border: 0; border-radius: 6px; background: #fe2c55; color: #fff; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; }
button.ghost { background: #eef0f3; color: #333; }
button.link { background: none; color: #2f6fdb; padding: 0 .25rem; font-size: .8rem; }
table { width: 100%; border-collapse: collapse; font-size: .85rem; }
th, td { text-align: left; padding: .5rem .5rem; border-bottom: 1px solid #eceef1; }
th { color: #888; font-weight: 500; }
.st-success { color: #1f9d4e; }
.st-partial, .st-failed { color: #d97b06; }
.st-aborted { color: #d92c3c; }
</style>

