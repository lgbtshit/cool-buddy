<script setup lang="ts">
import { SquareTerminal } from 'lucide-vue-next'
import { ref } from 'vue'

defineProps<{
  connectionLabel: string
  rows: number
  cols: number
  sessionName: string
  title: string
}>()

const terminalHostEl = ref<HTMLElement | null>(null)

defineExpose({
  terminalHostEl
})
</script>

<template>
  <div class="panel-shell terminal-shell">
    <div class="panel-topbar">
      <div class="panel-title">
        <SquareTerminal :size="14" />
        <span>{{ title }} - {{ sessionName }} - {{ cols }}x{{ rows }}</span>
      </div>
      <span class="muted">{{ connectionLabel }}</span>
    </div>
    <div class="terminal-frame">
      <div ref="terminalHostEl" class="terminal-host"></div>
    </div>
  </div>
</template>
