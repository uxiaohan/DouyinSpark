<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api, type Settings } from '../api'

const s = reactive<Settings>({
  timezone: 'Asia/Shanghai',
  schedule: { startHour: 8, startMinute: 0, endHour: 10, endMinute: 0 },
  perFriendMessages: [1, 3],
  dedupeMessagesPerFriend: true,
  shuffleFriends: true,
  gapBetweenMessagesMs: [1500, 4000],
  gapBetweenFriendsMs: [5000, 10000],
  gapBetweenAccountsMs: [30000, 90000],
  typingCps: [8, 16],
  maxScrollAttempts: 10,
  dryRun: true,
  pushdeerKey: '',
  notifyOnRun: true,
  notifyOnAbort: true,
  limits: { dailyCapPerAccount: 50, retryPerFriend: 2, consecutiveFailAbort: 5 },
})

const busy = ref(false)
const msg = ref('')

onMounted(async () => { Object.assign(s, await api.getSettings()) })

async function save() {
  busy.value = true
  msg.value = ''
  try {
    Object.assign(s, await api.putSettings({ ...s, pushdeerKey: s.pushdeerKey || null }))
    msg.value = '已保存'
  } catch (err) {
    msg.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    busy.value = false
  }
}

async function testNotify() {
  msg.value = ''
  try {
    const r = await api.testNotify()
    msg.value = r.ok ? '测试推送已发出' : '推送失败，请检查 key'
  } catch (err) {
    msg.value = err instanceof Error ? err.message : '测试失败'
  }
}
</script>

<template>
  <section>
    <h2>设置</h2>

    <div class="card">
      <h3>时间窗（本地时间 Asia/Shanghai）</h3>
      <div class="row">
        <label>开始 <input v-model.number="s.schedule.startHour" type="number" min="0" max="23" /> : <input v-model.number="s.schedule.startMinute" type="number" min="0" max="59" /></label>
        <label>结束 <input v-model.number="s.schedule.endHour" type="number" min="0" max="23" /> : <input v-model.number="s.schedule.endMinute" type="number" min="0" max="59" /></label>
      </div>
    </div>

    <div class="card">
      <h3>发送节奏</h3>
      <div class="row">
        <label>每好友条数 <input v-model.number="s.perFriendMessages[0]" type="number" min="1" /> ~ <input v-model.number="s.perFriendMessages[1]" type="number" min="1" /></label>
        <label>打字速度 cps <input v-model.number="s.typingCps[0]" type="number" min="1" /> ~ <input v-model.number="s.typingCps[1]" type="number" min="1" /></label>
        <label>发送方式 回车（抖音网页版不可切换）</label>
      </div>
      <div class="row">
        <label>消息间隔 ms <input v-model.number="s.gapBetweenMessagesMs[0]" type="number" min="0" /> ~ <input v-model.number="s.gapBetweenMessagesMs[1]" type="number" min="0" /></label>
        <label>好友间隔 ms <input v-model.number="s.gapBetweenFriendsMs[0]" type="number" min="0" /> ~ <input v-model.number="s.gapBetweenFriendsMs[1]" type="number" min="0" /></label>
        <label>切号间隔 ms <input v-model.number="s.gapBetweenAccountsMs[0]" type="number" min="0" /> ~ <input v-model.number="s.gapBetweenAccountsMs[1]" type="number" min="0" /></label>
      </div>
      <div class="row checks">
        <label><input v-model="s.dedupeMessagesPerFriend" type="checkbox" /> 同一好友内去重</label>
        <label><input v-model="s.shuffleFriends" type="checkbox" /> 随机好友顺序</label>
      </div>
    </div>

    <div class="card">
      <h3>反检测与上限</h3>
      <div class="row">
        <label>列表最大滚动次数 <input v-model.number="s.maxScrollAttempts" type="number" min="1" /></label>
        <label>每日上限 / 账号 <input v-model.number="s.limits.dailyCapPerAccount" type="number" min="0" /></label>
        <label>每好友重试 <input v-model.number="s.limits.retryPerFriend" type="number" min="0" /></label>
        <label>连续失败中止阈值 <input v-model.number="s.limits.consecutiveFailAbort" type="number" min="1" /></label>
      </div>
    </div>

    <div class="card">
      <h3>运行模式与通知</h3>
      <div class="row checks">
        <label><input v-model="s.dryRun" type="checkbox" /> 演练模式（只开会话不发消息）</label>
        <label><input v-model="s.notifyOnRun" type="checkbox" /> 每次跑批后推送</label>
        <label><input v-model="s.notifyOnAbort" type="checkbox" /> 中止时推送</label>
      </div>
      <div class="row">
        <input v-model="s.pushdeerKey" type="password" placeholder="PushDeer Key（配置后只写不回显）" />
        <button class="ghost" type="button" @click="testNotify">测试推送</button>
      </div>
    </div>

    <div class="row save">
      <button :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存设置' }}</button>
      <span v-if="msg" class="msg">{{ msg }}</span>
    </div>
  </section>
</template>

<style scoped>
h2 { font-size: 1.1rem; margin: 0 0 1rem; }
h3 { font-size: .9rem; margin: 0 0 .75rem; }
.card { background: #fff; border: 1px solid #e6e8ec; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: .75rem; }
.row { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
label { font-size: .8rem; color: #444; display: flex; align-items: center; gap: .35rem; }
input, select { padding: .35rem .5rem; border: 1px solid #d5d8dd; border-radius: 6px; font: inherit; width: 90px; }
input[type='checkbox'] { width: auto; }
input[type='password'] { width: 260px; }
.checks label { gap: .5rem; }
button { padding: .45rem .9rem; border: 0; border-radius: 6px; background: #fe2c55; color: #fff; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; }
button.ghost { background: #eef0f3; color: #333; }
.save { margin-top: .5rem; align-items: center; }
.msg { font-size: .8rem; color: #1f9d4e; }
</style>
