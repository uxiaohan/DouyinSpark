<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { api, type Run, type RunItem } from '../api'

const runs = ref<Run[]>([])
const items = ref<RunItem[]>([])
const openRunId = ref<number | null>(null)
const filter = ref('')

const rows = computed(() => {
  const base = openRunId.value === null ? [] : items.value
  if (!filter.value.trim()) return base
  return base.filter((i) => i.friend_name.includes(filter.value.trim()))
})

onMounted(async () => { runs.value = (await api.listRuns()).items })

async function open(id: number) {
  openRunId.value = id
  filter.value = ''
  items.value = (await api.listRunItems(id)).items
}

function pretty(raw: string | null): string {
  if (!raw) return ''
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
}
</script>

<template>
  <section>
    <h2>运行日志</h2>

    <table>
      <thead><tr><th>ID</th><th>触发</th><th>开始</th><th>结束</th><th>状态</th><th></th></tr></thead>
      <tbody>
        <tr v-for="r in runs" :key="r.id">
          <td>{{ r.id }}</td>
          <td>{{ r.trigger }}</td>
          <td>{{ new Date(r.started_at).toLocaleString() }}</td>
          <td>{{ r.finished_at ? new Date(r.finished_at).toLocaleString() : '—' }}</td>
          <td :class="'st-' + r.status">{{ r.status }}</td>
          <td><button class="link" @click="open(r.id)">明细</button></td>
        </tr>
        <tr v-if="runs.length === 0"><td colspan="6" class="muted">暂无记录</td></tr>
      </tbody>
    </table>

    <template v-if="openRunId !== null">
      <h3>跑批 #{{ openRunId }} 明细</h3>
      <div class="row">
        <input v-model="filter" placeholder="按好友备注过滤" />
      </div>
      <table>
        <thead><tr><th>好友</th><th>状态</th><th>条数</th><th>原因</th><th>时间</th></tr></thead>
        <tbody>
          <tr v-for="i in rows" :key="i.id">
            <td>{{ i.friend_name }}</td>
            <td :class="'st-' + i.status">{{ i.status }}</td>
            <td>{{ i.messages }}</td>
            <td class="muted">{{ i.reason ?? '' }}</td>
            <td class="muted">{{ new Date(i.created_at).toLocaleString() }}</td>
          </tr>
          <tr v-if="rows.length === 0"><td colspan="5" class="muted">没有匹配项</td></tr>
        </tbody>
      </table>

      <details class="raw">
        <summary>原始汇总 JSON</summary>
        <pre>{{ pretty(runs.find((r) => r.id === openRunId)?.summary_json ?? '') }}</pre>
      </details>
    </template>
  </section>
</template>

<style scoped>
h2 { font-size: 1.1rem; margin: 0 0 1rem; }
h3 { font-size: .9rem; margin: 1.5rem 0 .5rem; }
table { width: 100%; border-collapse: collapse; font-size: .85rem; }
th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #eceef1; }
th { color: #888; font-weight: 500; }
.muted { color: #888; padding: 1rem .5rem !important; }
.row { margin-bottom: .75rem; }
input { padding: .5rem .65rem; border: 1px solid #d5d8dd; border-radius: 6px; font: inherit; width: 260px; }
button { border: 0; border-radius: 6px; font: inherit; cursor: pointer; }
button.link { background: none; color: #2f6fdb; padding: 0 .25rem; font-size: .8rem; }
.st-success { color: #1f9d4e; }
.st-partial, .st-failed { color: #d97b06; }
.st-aborted { color: #d92c3c; }
.raw summary { font-size: .8rem; color: #666; cursor: pointer; margin-top: 1rem; }
.raw pre { background: #fff; border: 1px solid #e6e8ec; border-radius: 8px; padding: .75rem; overflow: auto; font-size: .75rem; }
</style>
