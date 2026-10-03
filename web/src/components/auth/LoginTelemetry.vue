<script setup lang="ts">
import { motion } from 'motion-v'
import { Check } from 'lucide-vue-next'

const MotionDiv = motion.div
</script>

<template>
  <section class="identity-field" aria-label="安全身份入口">
    <div class="identity-grid" aria-hidden="true" />
    <div class="identity-heading">
      <span>安全身份入口</span>
      <h1>验证身份，<br>继续你的工作。</h1>
      <p>账号、设备与会话在进入工作区前完成校验。</p>
    </div>

    <MotionDiv class="identity-portal" aria-hidden="true" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }">
      <svg viewBox="0 0 720 520" fill="none">
        <g class="portal-guides">
          <path d="M42 70 484 162" />
          <path d="M42 450 484 358" />
          <path d="M148 92 508 174" />
          <path d="M148 428 508 346" />
          <path d="M264 116 530 188" />
          <path d="M264 404 530 332" />
        </g>
        <g class="portal-frames">
          <path d="M452 406V114h220v292" />
          <path d="M486 382V148h152v234" />
          <path d="M520 354V176h84v178" />
        </g>
        <path class="portal-route" d="M54 468C192 458 308 432 392 398c66-27 116-58 170-112" />
        <circle class="portal-endpoint" cx="562" cy="286" r="4" />
      </svg>
    </MotionDiv>

    <div class="identity-assurance" aria-hidden="true">
      <span><Check :size="14" />身份可信</span>
      <span><Check :size="14" />设备受控</span>
      <span><Check :size="14" />会话加密</span>
    </div>
  </section>
</template>
