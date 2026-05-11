<script setup lang="ts">
import { Activity, Bot, Database, Gauge, Send, ServerCog } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useAppCopy } from '../../composables/use-app-copy'
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue'
import MetricsDetailModal from '../metrics-detail-modal/MetricsDetailModal.vue'
import { useSshConsoleStore } from '../../stores/ssh-console'

const store = useSshConsoleStore()
const { isConnected, metricsLoading, systemMetrics } = storeToRefs(store)
const { t } = useAppCopy()
const metricsDetailOpen = ref(false)
</script>

<template>
  <aside class="inspector-rail">
    <section class="metrics-card">
      <div class="metrics-header">
        <h2>{{ t('resourceVitals') }}</h2>
        <button
          class="mini-icon-btn"
          :disabled="!isConnected || metricsLoading"
          @click="void store.loadSystemMetrics()"
        >
          <Gauge :size="14" />
        </button>
      </div>

      <div v-if="metricsLoading" class="empty-state compact">{{ t('loadingRemoteFiles') }}</div>

      <div v-else-if="systemMetrics" class="metric-grid">
        <div class="metric-summary-card">
          <div class="metric-summary-head">
            <div class="metric-inline">
              <ServerCog :size="16" />
              <span class="metric-device-name">{{
                systemMetrics.hostname ?? t('deviceSummaryFallback')
              }}</span>
            </div>
            <button class="mini-text-btn" @click="metricsDetailOpen = true">
              {{ t('viewDetails') }}
            </button>
          </div>
        </div>

        <div class="metric-box">
          <span>{{ t('cpuUsage') }}</span>
          <strong>{{ systemMetrics.cpuPercent }}%</strong>
        </div>
        <div class="metric-box">
          <span>{{ t('memory') }}</span>
          <strong>{{ systemMetrics.memoryUsedMb }}/{{ systemMetrics.memoryTotalMb }}MB</strong>
        </div>

        <div class="metric-wide">
          <div class="metric-inline">
            <Database :size="16" />
            <span>{{ t('dockerInstances') }}</span>
          </div>
          <strong>
            {{
              systemMetrics.dockerRunning === null
                ? t('unavailable')
                : `${systemMetrics.dockerRunning} ${t('running')}`
            }}
          </strong>
        </div>
      </div>

      <EmptyStatePanel
        v-else
        :compact="true"
        :description="t('emptyMetricsHint')"
        :icon="Activity"
        :title="t('emptyMetricsTitle')"
      />
    </section>

    <MetricsDetailModal
      :metrics="systemMetrics"
      :open="metricsDetailOpen"
      @close="metricsDetailOpen = false"
    />

    <section class="agent-card">
      <div class="agent-header">
        <div class="agent-avatar">
          <Bot :size="15" />
        </div>
        <span>{{ t('aiAgent') }}</span>
      </div>

      <div class="agent-timeline">
        <div class="timeline-node active"></div>
        <div class="timeline-node"></div>
        <div class="timeline-node"></div>

        <div class="timeline-item task">
          <p class="timeline-title">{{ t('aiTaskTitle') }}</p>
          <p>{{ t('aiTaskBody') }}</p>
        </div>

        <div class="timeline-item">
          <span class="timeline-label">{{ t('executedAt') }} 16:46:10</span>
          <code>systemctl status node-api.service</code>
          <p class="timeline-result">{{ t('aiResult') }}</p>
        </div>

        <div class="timeline-item">
          <span class="timeline-label">{{ t('nextRecommendation') }}</span>
          <p>{{ t('aiRecommendation') }}</p>
        </div>
      </div>
    </section>

    <section class="agent-actions">
      <div class="chip-row">
        <button>{{ t('restartService') }}</button>
        <button>{{ t('checkLogs') }}</button>
        <button>{{ t('auditPermissions') }}</button>
      </div>

      <div class="prompt-box">
        <textarea
          :value="store.aiInput"
          :placeholder="t('askAi')"
          rows="2"
          @input="store.setAiInput(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <button class="send-btn">
          <Send :size="16" />
        </button>
      </div>
    </section>
  </aside>
</template>
