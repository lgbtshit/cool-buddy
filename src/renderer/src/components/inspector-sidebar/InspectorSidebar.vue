<script setup lang="ts">
import { Activity, Bot, Database, Gauge, Send, ServerCog } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue';
import MetricsDetailModal from '../metrics-detail-modal/MetricsDetailModal.vue';
import { useSshConsoleStore } from '../../stores/ssh-console';

const store = useSshConsoleStore();
const { isConnected, metricsLoading, systemMetrics } = storeToRefs(store);
const { t } = useAppCopy();
const metricsDetailOpen = ref(false);

function formatMemoryGb(valueMb: number): string {
  const valueGb = valueMb / 1024;
  return valueGb >= 10 ? valueGb.toFixed(1) : valueGb.toFixed(2);
}
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
          <strong>
            {{ formatMemoryGb(systemMetrics.memoryUsedMb) }}/{{
              formatMemoryGb(systemMetrics.memoryTotalMb)
            }}GB
          </strong>
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
        <div class="agent-identity">
          <div class="agent-avatar">
            <Bot :size="15" />
          </div>
          <div class="agent-heading">
            <span class="agent-eyebrow">{{ t('aiAgent') }}</span>
            <strong>{{ t('aiTaskTitle') }}</strong>
          </div>
        </div>
        <div class="agent-status">
          <span class="agent-status-dot"></span>
          <span>{{ t('connected') }}</span>
        </div>
      </div>

      <div class="agent-thread">
        <article class="agent-bubble agent-bubble-user">
          <span class="agent-bubble-label">{{ t('task') }}</span>
          <p class="timeline-title">{{ t('aiTaskTitle') }}</p>
          <p>{{ t('aiTaskBody') }}</p>
        </article>

        <article class="agent-bubble agent-bubble-system">
          <span class="agent-bubble-label">{{ t('executedAt') }} 16:46:10</span>
          <code>systemctl status node-api.service</code>
          <p class="timeline-result">{{ t('aiResult') }}</p>
        </article>

        <article class="agent-bubble agent-bubble-assistant">
          <span class="agent-bubble-label">{{ t('nextRecommendation') }}</span>
          <p>{{ t('aiRecommendation') }}</p>
        </article>
      </div>
    </section>

    <section class="agent-actions">
      <div class="chip-row">
        <button>{{ t('restartService') }}</button>
        <button>{{ t('checkLogs') }}</button>
        <button>{{ t('auditPermissions') }}</button>
      </div>

      <div class="prompt-box agent-composer">
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

<style scoped lang="scss">
.inspector-rail {
  display: grid;
  min-height: 0;
  gap: 10px;
  padding: 10px 10px 10px 0;
  border-left: 1px solid rgba(58, 73, 74, 0.35);
  background: rgba(27, 27, 30, 0.92);
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.metrics-card,
.agent-card,
.agent-actions {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  background: rgba(27, 27, 30, 0.7);
  backdrop-filter: blur(14px);
}

.metrics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;

  h2 {
    color: rgba(228, 225, 230, 0.92);
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
}

.metric-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metric-inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.metric-summary-card,
.metric-box,
.metric-wide {
  border: 1px solid rgba(58, 73, 74, 0.28);
  background: rgba(14, 14, 17, 0.8);
}

.metric-summary-card {
  display: flex;
  gap: 10px;
  flex-direction: column;
  grid-column: 1 / -1;
  padding: 12px;
}

.metric-summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  .metric-inline {
    min-width: 0;
    flex: 1;
  }
}

.metric-device-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-box {
  padding: 12px;

  span {
    display: block;
    color: rgba(185, 202, 202, 0.72);
    font-size: 12px;
  }

  strong {
    display: block;
    margin-top: 12px;
    color: var(--cyan-soft);
    font-size: 18px;
    font-weight: 700;
  }

  &:first-child strong {
    color: var(--green);
  }
}

.metric-wide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  grid-column: 1 / -1;
  padding: 12px;

  span {
    display: block;
    color: rgba(185, 202, 202, 0.72);
    font-size: 12px;
  }

  strong {
    color: var(--cyan-soft);
    font-size: 15px;
  }
}

.agent-card {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.agent-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.agent-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(168, 85, 247, 0.28);
  border-radius: 10px;
  background: linear-gradient(180deg, #6f00be 0%, #490080 100%);
  color: var(--violet);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.agent-heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;

  strong {
    overflow: hidden;
    color: rgba(228, 225, 230, 0.94);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.agent-eyebrow,
.agent-status,
.agent-bubble-label {
  color: rgba(185, 202, 202, 0.66);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}

.agent-eyebrow {
  color: rgba(185, 202, 202, 0.58);
}

.agent-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.agent-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #63f7ff;
  box-shadow: 0 0 10px rgba(99, 247, 255, 0.5);
}

.agent-thread {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding-right: 2px;
}

.agent-bubble {
  max-width: 100%;
  padding: 12px 13px;
  border: 1px solid rgba(58, 73, 74, 0.34);
  border-radius: 8px;
  color: rgba(228, 225, 230, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);

  p {
    color: rgba(228, 225, 230, 0.84);
    font-size: 12px;
    line-height: 1.6;
  }

  code {
    display: block;
    margin-bottom: 8px;
    padding: 10px 11px;
    border: 1px solid rgba(58, 73, 74, 0.28);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
    color: #4ff7c0;
    font-size: 11px;
    line-height: 1.55;
  }
}

.agent-bubble-user {
  align-self: flex-start;
  border-color: rgba(168, 85, 247, 0.28);
  background: rgba(111, 0, 190, 0.08);
}

.agent-bubble-system {
  align-self: stretch;
  background: rgba(18, 18, 22, 0.88);
}

.agent-bubble-assistant {
  align-self: flex-start;
  border-color: rgba(99, 247, 255, 0.22);
  background: rgba(0, 220, 229, 0.06);
}

.agent-bubble-label {
  display: block;
  margin-bottom: 8px;
}

.timeline-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
}

.timeline-result {
  color: rgba(228, 225, 230, 0.74);
}

.agent-actions {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  button {
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid rgba(58, 73, 74, 0.4);
    border-radius: 4px;
    background: rgba(53, 52, 56, 0.66);
    color: rgba(228, 225, 230, 0.82);
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;

    &:hover {
      border-color: rgba(99, 247, 255, 0.4);
      color: var(--cyan-soft);
    }
  }
}

.prompt-box {
  position: relative;

  textarea {
    width: 100%;
    min-height: 86px;
    padding: 12px 48px 14px 13px;
    border: 1px solid var(--field-border);
    border-radius: 8px;
    background: var(--field-bg);
    color: var(--text);
    resize: none;
    font-size: 12px;
    line-height: 1.6;

    &:focus-visible {
      border-color: var(--field-border-strong);
      background: var(--field-bg-elevated);
      box-shadow: var(--field-shadow-focus);
    }

    &:hover {
      border-color: rgba(99, 247, 255, 0.24);
    }
  }
}

.agent-composer {
  textarea {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  textarea::placeholder {
    color: rgba(185, 202, 202, 0.46);
  }
}

.send-btn {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--cyan);
  cursor: pointer;

  &:hover {
    background: rgba(99, 247, 255, 0.12);
  }
}
</style>
