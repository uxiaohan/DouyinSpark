<script setup lang="ts">
import { Bell, Cpu, Database, ExternalLink, Github, Layers, Server, ShieldCheck, Sparkles } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const REPO_URL = 'https://github.com/uxiaohan/DouyinSpark'

const stack = [
  { icon: Cpu, label: '运行时', value: 'Bun 1.4（不需要 Node）' },
  { icon: Layers, label: '浏览器引擎', value: 'Playwright + 本机 Chrome' },
  { icon: Server, label: '后端', value: 'Hono，API 与静态托管同一个进程' },
  { icon: Sparkles, label: '前端', value: 'Vue 3 + Vue Router' },
  { icon: Database, label: '数据库', value: 'SQLite（bun:sqlite），无外部数据库' },
  { icon: Github, label: '部署', value: 'Docker 多架构镜像，发布到 GHCR' },
]

const features = [
  '多账号独立运行：各用各的 cookie 登录，单个账号失效只跳过它自己',
  '每日调度窗口内随机取点执行，发送节奏带随机间隔，接近真人',
  '文案池分专属与全局：同账号下好友不重复文案，条数按区间随机',
  '安全阀齐全：每日上限、单好友重试、连续失败自动中止、实时风控检测',
  '失败可见：每个好友的明细与失败原因都写进运行日志',
  '优雅停机：收到停止信号在当前好友边界收尾，不留半条消息',
]

const privacy = [
  { icon: ShieldCheck, label: '账号 cookie', value: '只写入、不回显，仅存本地 data/app.db' },
  { icon: Database, label: '数据边界', value: '好友、文案、运行记录全部在本地 SQLite，不上传' },
  { icon: Bell, label: '唯一外联', value: '可选 PushDeer 通知，不配置则完全离线' },
]
</script>

<template>
  <div class="components-view">
    <section class="component-section">
      <div class="component-section-head">
        <div><h2>DouyinSpark 续火花</h2><p>本地自动化的抖音火花好友维护工具。</p></div>
        <Button as="a" :href="REPO_URL" target="_blank" rel="noopener" variant="outline" size="sm">
          <Github :size="14" />GitHub<ExternalLink :size="12" data-icon="inline-end" />
        </Button>
      </div>
      <div class="component-body">
        <p class="about-intro">
          每天在一个随机时间窗口内，用每个账号自己的 cookie 登录抖音网页版，给该账号的火花好友发送随机文案。
          运行引擎是 Bun + Playwright，控制台是 Hono + Vue3，全部数据只存在这台机器的 SQLite 里。
        </p>
        <p class="about-repo">源码与文档：<a :href="REPO_URL" target="_blank" rel="noopener">{{ REPO_URL }}</a></p>
      </div>
    </section>

    <section class="component-section">
      <div class="component-section-head">
        <div><h2>技术栈</h2><p>三个运行时依赖，无外部数据库。</p></div>
      </div>
      <div class="component-body">
        <div v-for="row in stack" :key="row.label" class="component-control-row">
          <span class="about-row-label"><component :is="row.icon" :size="14" />{{ row.label }}</span>
          <span class="about-row-value">{{ row.value }}</span>
        </div>
      </div>
    </section>

    <section class="component-section">
      <div class="component-section-head">
        <div><h2>它能做什么</h2><p>正式运行已具备的能力。</p></div>
      </div>
      <div class="component-body">
        <ul class="about-features">
          <li v-for="f in features" :key="f">{{ f }}</li>
        </ul>
      </div>
    </section>

    <section class="component-section">
      <div class="component-section-head">
        <div><h2>数据与隐私</h2><p>所有东西都只在这台机器上。</p></div>
      </div>
      <div class="component-body">
        <div v-for="row in privacy" :key="row.label" class="component-control-row">
          <span class="about-row-label"><component :is="row.icon" :size="14" />{{ row.label }}</span>
          <span class="about-row-value">{{ row.value }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
