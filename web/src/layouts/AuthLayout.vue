<script setup lang="ts">
import { Command as CommandIcon, LockKeyhole } from 'lucide-vue-next'
</script>

<template>
  <div class="login-screen">
    <header class="login-header">
      <div class="brand-lockup"><span class="brand-symbol"><CommandIcon :size="15" /></span><strong>续火花</strong><span>DouyinSpark</span></div>
      <div class="system-state"><LockKeyhole :size="14" />加密连接</div>
    </header>
    <main class="login-stage">
      <slot name="visual" />
      <slot />
    </main>
  </div>
</template>
