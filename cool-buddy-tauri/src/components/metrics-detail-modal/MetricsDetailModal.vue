<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { useAppCopy } from '../../composables/use-app-copy';
import type { SystemMetrics } from '../../types/ssh-console';

defineProps<{
  open: boolean;
  metrics: SystemMetrics | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useAppCopy();

function formatMemoryGb(valueMb: number): string {
  const valueGb = valueMb / 1024;
  return valueGb >= 10 ? valueGb.toFixed(1) : valueGb.toFixed(2);
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

<style scoped lang="scss">
.metrics-detail-modal {
  width: min(520px, calc(100vw - 32px));
}

.metrics-detail-grid {
  display: grid;
  gap: 10px;
}

.metrics-detail-row {
  display: grid;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(58, 73, 74, 0.28);
  border-radius: 6px;
  background: rgba(14, 14, 17, 0.74);
  grid-template-columns: 92px minmax(0, 1fr);

  span {
    color: rgba(185, 202, 202, 0.72);
    font-size: 12px;
  }

  strong {
    min-width: 0;
    color: rgba(228, 225, 230, 0.94);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
    word-break: break-word;
  }
}
</style>
