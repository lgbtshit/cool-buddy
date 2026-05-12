<script setup lang="ts">
import {
  Activity,
  Bot,
  Database,
  Gauge,
  Send,
  ServerCog,
  ShieldAlert,
  Sparkles
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue';
import MetricsDetailModal from '../metrics-detail-modal/MetricsDetailModal.vue';
import { useSshConsoleStore } from '../../stores/ssh-console';
import type { AgentRiskLevel } from '../../types/ssh-console';

const store = useSshConsoleStore();
const {
  agentMessages,
  agentRuntime,
  agentSettingsLoading,
  hasAgentProviderConfigured,
  isConnected,
  metricsLoading,
  pendingAgentApproval,
  systemMetrics
} = storeToRefs(store);
const { locale, t } = useAppCopy();
const metricsDetailOpen = ref(false);
const confirmStep = ref(1);

function formatMemoryGb(valueMb: number): string {
  const valueGb = valueMb / 1024;
  return valueGb >= 10 ? valueGb.toFixed(1) : valueGb.toFixed(2);
}

onMounted(() => {
  void store.loadAgentSettings();
});

const visibleAgentMessages = computed(() =>
  agentMessages.value.filter(
    (message) => message.role !== 'assistant' || message.content.trim().length > 0
  )
);

const thinkingMessage = computed(() =>
  agentMessages.value.findLast(
    (message) => message.role === 'assistant' && message.content.trim().length === 0
  )
);

const hasAgentMessages = computed(() => visibleAgentMessages.value.length > 0);
const showAgentThinking = computed(() =>
  Boolean(agentRuntime.value.running && thinkingMessage.value)
);

const agentStatusLabel = computed(() => {
  if (agentRuntime.value.running) {
    return 'Running';
  }

  if (pendingAgentApproval.value) {
    return pendingAgentApproval.value.riskLevel.toUpperCase();
  }

  return 'Ready';
});

function formatAgentTime(value: string): string {
  return new Intl.DateTimeFormat(locale.value, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function getAgentMessageClass(role: string) {
  if (role === 'user') return 'agent-bubble-user';
  if (role === 'assistant') return 'agent-bubble-assistant';
  return 'agent-bubble-system';
}

function getApprovalClass(riskLevel: AgentRiskLevel) {
  if (riskLevel === 'p0' || riskLevel === 'p1') return 'danger';
  if (riskLevel === 'p2') return 'info';
  return 'success';
}

async function sendAgentPrompt() {
  await store.runHarmlessAgentPrompt();
}

function handleAgentComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
    return;
  }

  event.preventDefault();
  void sendAgentPrompt();
}

async function approvePendingAction() {
  if (!pendingAgentApproval.value) {
    return;
  }

  if (pendingAgentApproval.value.confirmCount === 2 && confirmStep.value === 1) {
    confirmStep.value = 2;
    return;
  }

  await store.resolveHarmlessAgentApproval({
    approvalId: pendingAgentApproval.value.id,
    approve: true
  });
  confirmStep.value = 1;
}

async function rejectPendingAction() {
  if (!pendingAgentApproval.value) {
    return;
  }

  await store.resolveHarmlessAgentApproval({
    approvalId: pendingAgentApproval.value.id,
    approve: false
  });
  confirmStep.value = 1;
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

    <template v-if="hasAgentProviderConfigured">
      <section class="agent-card">
        <div class="agent-header">
          <div class="agent-identity">
            <div class="agent-avatar">
              <Bot :size="15" />
            </div>
            <div class="agent-heading">
              <span class="agent-eyebrow">{{ t('aiAgent') }}</span>
              <strong>小酷</strong>
            </div>
          </div>
          <div class="agent-status">
            <span class="agent-status-dot"></span>
            <span>{{ agentStatusLabel }}</span>
          </div>
        </div>

        <div v-if="hasAgentMessages || showAgentThinking" class="agent-thread">
          <article
            v-for="message in visibleAgentMessages"
            :key="message.id"
            class="agent-bubble"
            :class="getAgentMessageClass(message.role)"
          >
            <span class="agent-bubble-label">
              {{ message.role }} - {{ formatAgentTime(message.createdAt) }}
            </span>
            <p>{{ message.content }}</p>
          </article>

          <article v-if="showAgentThinking" class="agent-bubble agent-bubble-thinking">
            <span class="agent-bubble-label">assistant - now</span>
            <div class="thinking-row" aria-live="polite" aria-label="Agent is thinking">
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
            </div>
          </article>
        </div>

        <EmptyStatePanel
          v-else
          :compact="true"
          :description="
            agentRuntime.running
              ? 'Agent is preparing the first tool pass.'
              : 'Ask for a diagnosis, metrics summary, service check, log read, or remote file operation.'
          "
          :icon="Bot"
          title="Agent is ready"
        />
      </section>

      <section class="agent-actions">
        <div class="chip-row">
          <button @click="store.setAiInput(t('agentQuickHostHealthPrompt'))">
            {{ t('agentQuickHostHealth') }}
          </button>
          <button @click="store.setAiInput(t('agentQuickRunningAppsPrompt'))">
            {{ t('agentQuickRunningApps') }}
          </button>
          <button @click="store.setAiInput(t('agentQuickCheckLogsPrompt'))">
            {{ t('agentQuickCheckLogs') }}
          </button>
        </div>

        <div class="prompt-box agent-composer">
          <textarea
            :value="store.aiInput"
            :placeholder="t('askAi')"
            :disabled="agentRuntime.running"
            rows="2"
            @input="store.setAiInput(($event.target as HTMLTextAreaElement).value)"
            @keydown="handleAgentComposerKeydown"
          ></textarea>
          <button class="send-btn" :disabled="agentRuntime.running" @click="void sendAgentPrompt()">
            <Send :size="16" />
          </button>
        </div>
      </section>
    </template>

    <section v-else class="agent-empty-card">
      <EmptyStatePanel
        :compact="false"
        :description="agentSettingsLoading ? t('loadingSessions') : t('agentEmptyDescription')"
        :icon="Sparkles"
        :title="t('agentEmptyTitle')"
      >
        <template #actions>
          <button class="primary-btn agent-empty-cta" @click="void store.openAgentSettingsModal()">
            {{ t('openTerminalSettings') }}
          </button>
        </template>
      </EmptyStatePanel>
    </section>

    <div v-if="pendingAgentApproval" class="modal-scrim">
      <section
        class="session-modal approval-modal"
        :class="getApprovalClass(pendingAgentApproval.riskLevel)"
      >
        <div class="modal-header">
          <div>
            <h2>{{ pendingAgentApproval.riskLevel.toUpperCase() }} Confirmation</h2>
            <p>{{ pendingAgentApproval.summary }}</p>
          </div>
          <div class="approval-badge">
            <ShieldAlert :size="14" />
            <span>{{ pendingAgentApproval.toolName }}</span>
          </div>
        </div>

        <div class="approval-body">
          <p>{{ pendingAgentApproval.details }}</p>
          <code v-if="pendingAgentApproval.command">{{ pendingAgentApproval.command }}</code>
          <p
            v-if="pendingAgentApproval.confirmCount === 2 && confirmStep === 1"
            class="approval-note"
          >
            This is a P0 action. The first click arms execution, and the second click sends it.
          </p>
          <p
            v-if="pendingAgentApproval.confirmCount === 2 && confirmStep === 2"
            class="approval-note"
          >
            Final confirmation. This action will run immediately after you confirm again.
          </p>
        </div>

        <div class="modal-actions approval-actions">
          <button class="ghost-btn" @click="void rejectPendingAction()">Reject</button>
          <button class="primary-btn" @click="void approvePendingAction()">
            {{
              pendingAgentApproval.confirmCount === 2 && confirmStep === 1
                ? 'Arm Execution'
                : 'Confirm Execution'
            }}
          </button>
        </div>
      </section>
    </div>
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
.agent-actions,
.agent-empty-card {
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
  min-width: 0;
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
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
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
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
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

.agent-bubble-thinking {
  align-self: flex-start;
  border-color: rgba(99, 247, 255, 0.16);
  background:
    linear-gradient(180deg, rgba(0, 220, 229, 0.08), rgba(0, 220, 229, 0.03)),
    rgba(12, 18, 22, 0.92);
}

.agent-bubble-label {
  display: block;
  margin-bottom: 8px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.thinking-row {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 18px;
}

.thinking-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(99, 247, 255, 0.9);
  box-shadow: 0 0 12px rgba(99, 247, 255, 0.22);
  animation: agent-thinking-pulse 1.2s ease-in-out infinite;

  &:nth-child(2) {
    animation-delay: 0.15s;
  }

  &:nth-child(3) {
    animation-delay: 0.3s;
  }
}

@keyframes agent-thinking-pulse {
  0%,
  80%,
  100% {
    transform: translateY(0) scale(0.88);
    opacity: 0.34;
  }

  40% {
    transform: translateY(-1px) scale(1);
    opacity: 1;
  }
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

.agent-empty-card {
  display: flex;
  min-height: 0;
  align-items: stretch;

  :deep(.empty-state-panel) {
    width: 100%;
    min-height: 100%;
    justify-content: flex-start;
    padding: 18px 16px;
    border-style: solid;
    border-color: rgba(99, 247, 255, 0.12);
    border-radius: 8px;
    background:
      linear-gradient(180deg, rgba(18, 28, 30, 0.32), rgba(14, 14, 17, 0.2)),
      rgba(255, 255, 255, 0.01);
  }

  :deep(.empty-state-copy strong) {
    font-size: 14px;
  }

  :deep(.empty-state-actions) {
    margin-top: 4px;
  }
}

.agent-empty-cta {
  min-width: 148px;
  min-height: 38px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 13px;
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

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.approval-modal {
  width: min(560px, calc(100vw - 40px));

  &.danger {
    border-color: rgba(255, 118, 118, 0.34);
  }

  &.info {
    border-color: rgba(99, 180, 255, 0.28);
  }

  &.success {
    border-color: rgba(105, 246, 185, 0.24);
  }
}

.approval-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  color: rgba(228, 225, 230, 0.82);
  font-size: 11px;
}

.approval-body {
  display: grid;
  gap: 12px;

  p {
    color: rgba(228, 225, 230, 0.84);
    font-size: 13px;
    line-height: 1.65;
  }

  code {
    display: block;
    padding: 12px 13px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    background: rgba(10, 11, 14, 0.82);
    color: #f3f6f7;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.approval-note {
  color: rgba(255, 206, 122, 0.88);
}

.approval-actions {
  margin-top: 18px;
}
</style>
