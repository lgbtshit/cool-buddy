<script setup lang="ts">
import { MonitorCog, Settings2 } from 'lucide-vue-next'

defineProps<{
  logLines: string[]
  logTitle: string
  autoPauseOff: string
  waitingEvents: string
}>()
</script>

<template>
  <div class="panel-shell logs-shell">
    <div class="panel-topbar">
      <div class="panel-title accent">
        <MonitorCog :size="14" />
        <span>{{ logTitle }} - tail -f /var/log/nginx/error.log</span>
      </div>
      <div class="log-meta">
        <span class="pause-pill">{{ autoPauseOff }}</span>
        <Settings2 :size="14" />
      </div>
    </div>

    <div class="log-body">
      <p v-for="line in logLines.slice(0, 2)" :key="line" class="log-muted">{{ line }}</p>
      <p class="log-highlight">{{ logLines[2] }}</p>
      <p class="log-waiting">
        <span>{{ waitingEvents }}</span>
        <span class="waiting-dot"></span>
      </p>
    </div>
  </div>
</template>
