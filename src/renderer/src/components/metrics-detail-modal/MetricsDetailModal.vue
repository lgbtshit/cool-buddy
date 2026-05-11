<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useAppCopy } from '../../composables/use-app-copy'
import type { SystemMetrics } from '../../types/ssh-console'

defineProps<{
  open: boolean
  metrics: SystemMetrics | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useAppCopy()

function formatMemoryGb(valueMb: number): string {
  const valueGb = valueMb / 1024
  return valueGb >= 10 ? valueGb.toFixed(1) : valueGb.toFixed(2)
}
</script>

<template>
  <div v-if="open && metrics" class="modal-scrim">
    <section class="session-modal metrics-detail-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('metricsDetails') }}</h2>
          <p>{{ metrics.hostname ?? t('deviceSummaryFallback') }}</p>
        </div>
        <button class="icon-btn" @click="emit('close')">
          <X :size="16" />
        </button>
      </div>

      <div class="metrics-detail-grid">
        <div class="metrics-detail-row">
          <span>{{ t('hostname') }}</span>
          <strong>{{ metrics.hostname ?? t('unavailable') }}</strong>
        </div>
        <div class="metrics-detail-row">
          <span>{{ t('operatingSystem') }}</span>
          <strong>{{ metrics.osName ?? t('unavailable') }}</strong>
        </div>
        <div class="metrics-detail-row">
          <span>{{ t('kernelVersion') }}</span>
          <strong>{{ metrics.kernelVersion ?? t('unavailable') }}</strong>
        </div>
        <div class="metrics-detail-row">
          <span>{{ t('architecture') }}</span>
          <strong>{{ metrics.architecture ?? t('unavailable') }}</strong>
        </div>
        <div class="metrics-detail-row">
          <span>{{ t('uptime') }}</span>
          <strong>{{ metrics.uptime ?? t('unavailable') }}</strong>
        </div>
        <div class="metrics-detail-row">
          <span>{{ t('cpuUsage') }}</span>
          <strong>{{ metrics.cpuPercent }}%</strong>
        </div>
        <div class="metrics-detail-row">
          <span>{{ t('memory') }}</span>
          <strong
            >{{ formatMemoryGb(metrics.memoryUsedMb) }}/{{
              formatMemoryGb(metrics.memoryTotalMb)
            }}GB</strong
          >
        </div>
        <div class="metrics-detail-row">
          <span>{{ t('dockerInstances') }}</span>
          <strong>
            {{
              metrics.dockerRunning === null
                ? t('unavailable')
                : `${metrics.dockerRunning} ${t('running')}`
            }}
          </strong>
        </div>
      </div>

      <div class="modal-actions">
        <button class="ghost-btn" @click="emit('close')">{{ t('cancel') }}</button>
      </div>
    </section>
  </div>
</template>
