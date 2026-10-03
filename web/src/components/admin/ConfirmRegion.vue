<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useConfirm } from '@/composables/useConfirm'

const { pending, displayed, settleConfirm } = useConfirm()
</script>

<template>
  <Dialog :open="pending !== null" @update:open="(v: boolean) => { if (!v) settleConfirm(false) }">
    <DialogContent class="showcase-dialog" :show-close-button="true">
      <DialogHeader>
        <DialogTitle>{{ displayed?.options.title }}</DialogTitle>
        <DialogDescription>该操作不可撤销，请谨慎确认。</DialogDescription>
      </DialogHeader>
      <div class="dialog-callout" :class="{ warning: displayed?.options.tone === 'warning' }">
        <CircleAlert :size="16" />
        <div><strong>{{ displayed?.options.message }}</strong></div>
      </div>
      <DialogFooter class="showcase-dialog-footer">
        <Button variant="outline" @click="settleConfirm(false)">{{ displayed?.options.cancelText }}</Button>
        <Button class="primary-action" @click="settleConfirm(true)">{{ displayed?.options.confirmText }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
