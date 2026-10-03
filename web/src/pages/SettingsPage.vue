<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Save, Zap } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimePicker } from '@/components/ui/time-picker'
import { api, type Settings } from '@/api'

const emit = defineEmits<{ toast: [message: string, tone?: 'success' | 'info' | 'warning' | 'error'] }>()
function toast(message: string, tone?: 'success' | 'info' | 'warning' | 'error') {
  emit('toast', message, tone)
}

const loaded = ref(false)
const saving = ref(false)

const form = reactive({
  timezone: 'Asia/Shanghai',
  startTime: '20:06',
  endTime: '20:10',
  perMin: 1,
  perMax: 3,
  messageGapMin: 60000,
  messageGapMax: 180000,
  friendGapMin: 30000,
  friendGapMax: 90000,
  accountGapMin: 60000,
  accountGapMax: 180000,
  typingCpsMin: 5,
  typingCpsMax: 12,
  maxScrollAttempts: 3,
  shuffleFriends: true,
  dedupeMessagesPerFriend: true,
  dryRun: false,
  dailyCapPerAccount: 100,
  retryPerFriend: 1,
  consecutiveFailAbort: 3,
  pushdeerKey: '',
  notifyOnRun: true,
  notifyOnAbort: true,
})

const pad = (n: number) => String(n).padStart(2, '0')

/** "HH:MM" → 时/分；TimePicker 只产出零填充值，split 后的兜底仅供防御 */
function parseClock(v: string): { hour: number; minute: number } {
  const [h, m] = v.split(':').map(Number)
  return { hour: h || 0, minute: m || 0 }
}

function toSettings(): Settings {
  const start = parseClock(form.startTime)
  const end = parseClock(form.endTime)
  return {
    timezone: form.timezone,
    schedule: { startHour: start.hour, startMinute: start.minute, endHour: end.hour, endMinute: end.minute },
    perFriendMessages: [form.perMin, form.perMax],
    dedupeMessagesPerFriend: form.dedupeMessagesPerFriend,
    shuffleFriends: form.shuffleFriends,
    gapBetweenMessagesMs: [form.messageGapMin, form.messageGapMax],
    gapBetweenFriendsMs: [form.friendGapMin, form.friendGapMax],
    gapBetweenAccountsMs: [form.accountGapMin, form.accountGapMax],
    typingCps: [form.typingCpsMin, form.typingCpsMax],
    maxScrollAttempts: form.maxScrollAttempts,
    dryRun: form.dryRun,
    pushdeerKey: form.pushdeerKey.trim() === '' ? null : form.pushdeerKey.trim(),
    notifyOnRun: form.notifyOnRun,
    notifyOnAbort: form.notifyOnAbort,
    limits: { dailyCapPerAccount: form.dailyCapPerAccount, retryPerFriend: form.retryPerFriend, consecutiveFailAbort: form.consecutiveFailAbort },
  }
}

function fromSettings(s: Settings) {
  form.timezone = s.timezone
  form.startTime = `${pad(s.schedule.startHour)}:${pad(s.schedule.startMinute)}`
  form.endTime = `${pad(s.schedule.endHour)}:${pad(s.schedule.endMinute)}`
  form.perMin = s.perFriendMessages[0]
  form.perMax = s.perFriendMessages[1]
  form.messageGapMin = s.gapBetweenMessagesMs[0]
  form.messageGapMax = s.gapBetweenMessagesMs[1]
  form.friendGapMin = s.gapBetweenFriendsMs[0]
  form.friendGapMax = s.gapBetweenFriendsMs[1]
  form.accountGapMin = s.gapBetweenAccountsMs[0]
  form.accountGapMax = s.gapBetweenAccountsMs[1]
  form.typingCpsMin = s.typingCps[0]
  form.typingCpsMax = s.typingCps[1]
  form.maxScrollAttempts = s.maxScrollAttempts
  form.shuffleFriends = s.shuffleFriends
  form.dedupeMessagesPerFriend = s.dedupeMessagesPerFriend
  form.dryRun = s.dryRun
  form.dailyCapPerAccount = s.limits.dailyCapPerAccount
  form.retryPerFriend = s.limits.retryPerFriend
  form.consecutiveFailAbort = s.limits.consecutiveFailAbort
  form.pushdeerKey = s.pushdeerKey ?? ''
  form.notifyOnRun = s.notifyOnRun
  form.notifyOnAbort = s.notifyOnAbort
}

async function load() {
  try {
    fromSettings(await api.getSettings())
    loaded.value = true
  } catch (err) {
    toast(err instanceof Error ? err.message : '加载失败', 'error')
  }
}

// 结束不早于开始的硬约束：跨零点区间曾被 computeNextRunAt 当成 24 小时窗口，
// 用户实测误存 0:16–0:13 后下次运行跳到当晚 21:36——不是想要的语义，禁止保存。
// 零填充 "HH:MM" 字典序即时间序；TimePicker 与 fromSettings 都保证零填充。
const scheduleError = computed(() => {
  if (!/^\d{2}:\d{2}$/.test(form.startTime) || !/^\d{2}:\d{2}$/.test(form.endTime)) return '请选择开始与结束时间'
  if (form.endTime < form.startTime) return '结束时间不能早于开始时间（不支持跨零点窗口）'
  return ''
})

async function save() {
  if (scheduleError.value) {
    toast(scheduleError.value, 'error')
    return
  }
  saving.value = true
  try {
    // 保存即重排：后端已按新区间重新取点，直接把新时间提示给用户
    const { nextRunAt } = await api.putSettings(toSettings())
    const when = nextRunAt ? `，下次运行 ${formatClock(nextRunAt)}` : ''
    toast(`设置已保存${when}`, 'success')
  } catch (err) {
    toast(err instanceof Error ? err.message : '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function formatClock(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function testNotify() {
  try {
    await api.testNotify()
    toast('测试通知已发送', 'success')
  } catch (err) {
    toast(err instanceof Error ? err.message : '通知测试失败', 'error')
  }
}

onMounted(load)
</script>

<template>
  <div v-if="loaded" class="components-view">
    <section class="component-section">
      <div class="component-section-head">
        <div><h2>调度窗口</h2><p>每天在此时段内触发跑批；结束时间不早于开始时间（相等即每天到点跑），时区影响调度与日志展示。</p></div>
      </div>
      <div class="component-body component-form-grid">
        <label class="component-field">开始时间
          <TimePicker v-model="form.startTime" aria-label="选择开始时间" />
        </label>
        <label class="component-field">结束时间
          <TimePicker v-model="form.endTime" aria-label="选择结束时间" />
          <small v-if="scheduleError" class="field-error">{{ scheduleError }}</small>
        </label>
        <label class="component-field">时区
          <input v-model="form.timezone" class="console-number" type="text" placeholder="Asia/Shanghai" />
        </label>
      </div>
    </section>

    <section class="component-section">
      <div class="component-section-head">
        <div><h2>发送节奏</h2><p>控制每条消息、每个好友、每个账号之间的间隔，模拟真人操作。</p></div>
      </div>
      <div class="component-body component-form-grid">
        <label class="component-field">每好友最少消息
          <input v-model.number="form.perMin" class="console-number" type="number" min="1" />
        </label>
        <label class="component-field">每好友最多消息
          <input v-model.number="form.perMax" class="console-number" type="number" min="1" />
        </label>
        <label class="component-field">消息间隔下限（毫秒）
          <input v-model.number="form.messageGapMin" class="console-number" type="number" min="0" step="1000" />
        </label>
        <label class="component-field">消息间隔上限（毫秒）
          <input v-model.number="form.messageGapMax" class="console-number" type="number" min="0" step="1000" />
        </label>
        <label class="component-field">好友间隔下限（毫秒）
          <input v-model.number="form.friendGapMin" class="console-number" type="number" min="0" step="1000" />
        </label>
        <label class="component-field">好友间隔上限（毫秒）
          <input v-model.number="form.friendGapMax" class="console-number" type="number" min="0" step="1000" />
        </label>
        <label class="component-field">账号间隔下限（毫秒）
          <input v-model.number="form.accountGapMin" class="console-number" type="number" min="0" step="1000" />
        </label>
        <label class="component-field">账号间隔上限（毫秒）
          <input v-model.number="form.accountGapMax" class="console-number" type="number" min="0" step="1000" />
        </label>
        <label class="component-field">打字速度下限（字符/秒）
          <input v-model.number="form.typingCpsMin" class="console-number" type="number" min="1" />
        </label>
        <label class="component-field">打字速度上限（字符/秒）
          <input v-model.number="form.typingCpsMax" class="console-number" type="number" min="1" />
        </label>
      </div>
    </section>

    <section class="component-section">
      <div class="component-section-head">
        <div><h2>挑选策略与限额</h2><p>专属优先、同好友去重、每日上限与失败中止阈值。</p></div>
      </div>
      <div class="component-body">
        <div class="component-control-row">
          <span>好友乱序（shuffleFriends）</span>
          <label class="console-switch"><input v-model="form.shuffleFriends" type="checkbox" /><i /></label>
        </div>
        <div class="component-control-row">
          <span>同一好友内不重复文案（dedupeMessagesPerFriend）</span>
          <label class="console-switch"><input v-model="form.dedupeMessagesPerFriend" type="checkbox" /><i /></label>
        </div>
        <div class="component-control-row">
          <span>dry-run（只演练不真发）</span>
          <label class="console-switch"><input v-model="form.dryRun" type="checkbox" /><i /></label>
        </div>
        <div class="component-form-grid">
          <label class="component-field">单账号每日上限
            <input v-model.number="form.dailyCapPerAccount" class="console-number" type="number" min="1" />
          </label>
          <label class="component-field">单好友重试次数
            <input v-model.number="form.retryPerFriend" class="console-number" type="number" min="0" />
          </label>
          <label class="component-field">连续失败中止阈值
            <input v-model.number="form.consecutiveFailAbort" class="console-number" type="number" min="1" />
          </label>
          <label class="component-field">会话列表最大滚动尝试
            <input v-model.number="form.maxScrollAttempts" class="console-number" type="number" min="1" />
          </label>
        </div>
      </div>
    </section>

    <section class="component-section">
      <div class="component-section-head">
        <div><h2>通知</h2><p>跑批开始/中止时通过 PushDeer 推送到手机。</p></div>
        <Button variant="outline" size="sm" @click="testNotify"><Zap />测试通知</Button>
      </div>
      <div class="component-body">
        <div class="component-control-row">
          <span>跑批开始通知（notifyOnRun）</span>
          <label class="console-switch"><input v-model="form.notifyOnRun" type="checkbox" /><i /></label>
        </div>
        <div class="component-control-row">
          <span>异常中止通知（notifyOnAbort）</span>
          <label class="console-switch"><input v-model="form.notifyOnAbort" type="checkbox" /><i /></label>
        </div>
        <label class="component-field">PushDeer Key
          <Input v-model="form.pushdeerKey" placeholder="留空则不发送通知" />
          <small>在 PushDeer App 内获取，仅保存在本地数据库。</small>
        </label>
      </div>
    </section>

    <div class="feedback-status">
      <span><i />设置修改后对下一次跑批生效</span>
      <Button class="primary-action" :disabled="saving || scheduleError !== ''" @click="save"><Save />{{ saving ? '保存中' : '保存设置' }}</Button>
    </div>
  </div>
</template>
