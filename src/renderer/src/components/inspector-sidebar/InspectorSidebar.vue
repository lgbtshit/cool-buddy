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
import VueMarkdownStream from 'vue-markdown-stream';
import 'vue-markdown-stream/dist/index.css';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
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
const approvalSubmitting = ref(false);
const agentThreadRef = ref<HTMLElement | null>(null);

type ParsedAgentMessage = {
  body: string;
  think: string | null;
  thinkPreview: string;
};

type VisibleAgentMessage = (typeof agentMessages.value)[number] & {
  parsedContent: ParsedAgentMessage;
};

function formatMemoryGb(valueMb: number): string {
  const valueGb = valueMb / 1024;
  return valueGb >= 10 ? valueGb.toFixed(1) : valueGb.toFixed(2);
}

onMounted(() => {
  void store.loadAgentSettings();
  void scrollAgentThreadToBottom();
});

const thinkingMessage = computed(() =>
  agentMessages.value.findLast(
    (message) => message.role === 'assistant' && message.content.trim().length === 0
  )
);

function shouldRenderAgentMessage(message: VisibleAgentMessage): boolean {
  if (message.role === 'tool') {
    return false;
  }

  if (message.role === 'assistant') {
    return message.parsedContent.body.trim().length > 0;
  }

  return message.content.trim().length > 0;
}

const visibleAgentMessages = computed(() =>
  agentMessages.value
    .map(
      (message) =>
        ({
          ...message,
          parsedContent: parseAgentMessage(message.content)
        }) satisfies VisibleAgentMessage
    )
    .filter(shouldRenderAgentMessage)
);

const hasAgentMessages = computed(() => visibleAgentMessages.value.length > 0);
const showAgentThinking = computed(() =>
  Boolean(agentRuntime.value.phase === 'running' && thinkingMessage.value)
);
const showAgentCompression = computed(() => agentRuntime.value.phase === 'compressing');
const agentEmptyTitle = computed(() =>
  isConnected.value ? t('agentEmptyTitle') : t('agentDisconnectedTitle')
);
const agentEmptyDescription = computed(() => {
  if (agentSettingsLoading.value) {
    return t('loadingSessions');
  }

  return isConnected.value ? t('agentEmptyDescription') : t('agentDisconnectedDescription');
});
const agentThinkStyle = computed(() => ({
  '--agent-think-label': `"${t('agentThinkingLabel')}"`
}));

const agentStatusLabel = computed(() => {
  if (agentRuntime.value.phase === 'compressing') {
    return t('agentStatusCompressing');
  }

  if (agentRuntime.value.phase === 'awaiting-approval') {
    return t('agentStatusAwaitingApproval');
  }

  if (agentRuntime.value.phase === 'running') {
    return t('agentStatusRunning');
  }

  return t('agentStatusReady');
});

async function scrollAgentThreadToBottom() {
  await nextTick();
  const thread = agentThreadRef.value;

  if (!thread) {
    return;
  }

  thread.scrollTop = thread.scrollHeight;
}

function parseAgentMessage(content: string): ParsedAgentMessage {
  const match = content.match(/<think>([\s\S]*?)<\/think>/i);

  if (!match) {
    return {
      body: content,
      think: null,
      thinkPreview: ''
    };
  }

  const think = match[1].trim();
  const matchIndex = match.index ?? 0;
  const body =
    `${content.slice(0, matchIndex)}${content.slice(matchIndex + match[0].length)}`.trim();
  const thinkPreview = think.replace(/\s+/g, ' ').trim();

  return {
    body,
    think,
    thinkPreview
  };
}

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

function getAgentRoleLabel(role: string) {
  if (role === 'user') return t('agentRoleUser');
  if (role === 'assistant') return t('agentRoleAssistant');
  return t('agentRoleSystem');
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

  approvalSubmitting.value = true;

  try {
    await store.resolveHarmlessAgentApproval({
      approvalId: pendingAgentApproval.value.id,
      approve: true
    });
    confirmStep.value = 1;
  } finally {
    approvalSubmitting.value = false;
  }
}

async function rejectPendingAction() {
  if (!pendingAgentApproval.value) {
    return;
  }

  approvalSubmitting.value = true;

  try {
    await store.resolveHarmlessAgentApproval({
      approvalId: pendingAgentApproval.value.id,
      approve: false
    });
    confirmStep.value = 1;
  } finally {
    approvalSubmitting.value = false;
  }
}

watch(pendingAgentApproval, () => {
  confirmStep.value = 1;
  approvalSubmitting.value = false;
});

watch(
  () => ({
    thinking: showAgentThinking.value,
    messages: visibleAgentMessages.value.map(
      (message) => `${message.id}:${message.role}:${message.content}:${message.createdAt}`
    )
  }),
  () => {
    void scrollAgentThreadToBottom();
  },
  { flush: 'post' }
);
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
      <section class="agent-card" :style="agentThinkStyle">
        <div class="agent-header">
          <div class="agent-identity">
            <div class="agent-avatar">
              <Bot :size="15" />
            </div>
            <div class="agent-heading">
              <span class="agent-eyebrow">{{ t('aiAgent') }}</span>
              <strong>{{ t('agentName') }}</strong>
            </div>
          </div>
          <div class="agent-status">
            <span class="agent-status-dot"></span>
            <span>{{ agentStatusLabel }}</span>
          </div>
        </div>

        <div
          v-if="hasAgentMessages || showAgentThinking || showAgentCompression"
          ref="agentThreadRef"
          class="agent-thread"
        >
          <article
            v-for="message in visibleAgentMessages"
            :key="message.id"
            class="agent-bubble"
            :class="getAgentMessageClass(message.role)"
          >
            <span class="agent-bubble-label">
              {{ getAgentRoleLabel(message.role) }} - {{ formatAgentTime(message.createdAt) }}
            </span>
            <template v-if="message.parsedContent.think">
              <VueMarkdownStream
                v-if="message.parsedContent.body"
                class="agent-markdown"
                :content="message.parsedContent.body"
              />
            </template>
            <VueMarkdownStream v-else class="agent-markdown" :content="message.content" />
          </article>

          <article v-if="showAgentThinking" class="agent-bubble agent-bubble-thinking">
            <span class="agent-bubble-label">
              {{ t('agentRoleAssistant') }} - {{ t('agentThinkingNow') }}
            </span>
            <div class="thinking-row" aria-live="polite" :aria-label="t('agentThinkingAria')">
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
            </div>
          </article>

          <article v-if="showAgentCompression" class="agent-bubble agent-bubble-thinking">
            <span class="agent-bubble-label">
              {{ t('agentRoleSystem') }} - {{ t('agentCompressingNow') }}
            </span>
            <div class="thinking-row" aria-live="polite" :aria-label="t('agentCompressingAria')">
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
            agentRuntime.running ? t('agentPreparingDescription') : t('agentReadyDescription')
          "
          :icon="Bot"
          :title="t('agentReadyTitle')"
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
        :description="agentEmptyDescription"
        :icon="isConnected ? Sparkles : ServerCog"
        :title="agentEmptyTitle"
      >
        <template v-if="isConnected" #actions>
          <button class="primary-btn agent-empty-cta" @click="void store.openAgentSettingsModal()">
            {{ t('openTerminalSettings') }}
          </button>
        </template>
      </EmptyStatePanel>
    </section>

    <div v-if="pendingAgentApproval && !approvalSubmitting" class="modal-scrim">
      <section
        class="session-modal approval-modal"
        :class="getApprovalClass(pendingAgentApproval.riskLevel)"
      >
        <div class="modal-header">
          <div>
            <h2>
              {{ pendingAgentApproval.riskLevel.toUpperCase() }} {{ t('approvalConfirmation') }}
            </h2>
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
            {{ t('approvalP0ArmingNote') }}
          </p>
          <p
            v-if="pendingAgentApproval.confirmCount === 2 && confirmStep === 2"
            class="approval-note"
          >
            {{ t('approvalP0FinalNote') }}
          </p>
        </div>

        <div class="modal-actions approval-actions">
          <button class="ghost-btn" @click="void rejectPendingAction()">
            {{ t('approvalReject') }}
          </button>
          <button class="primary-btn" @click="void approvePendingAction()">
            {{
              pendingAgentApproval.confirmCount === 2 && confirmStep === 1
                ? t('approvalArmExecution')
                : t('approvalConfirmExecution')
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
  min-width: 0;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  gap: 10px;
  overflow: hidden;
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
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
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
  width: 100%;
  max-width: 100%;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding-right: 2px;
}

.agent-bubble {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  padding: 12px 13px;
  border: 1px solid rgba(58, 73, 74, 0.34);
  border-radius: 8px;
  color: rgba(228, 225, 230, 0.88);
  font-family: var(--font-ui);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.agent-markdown {
  min-width: 0;
  max-width: 100%;

  :deep(*) {
    min-width: 0;
    max-width: 100%;
  }

  :deep(.text-block) {
    display: grid;
    gap: 0;
  }

  &.markdown-body,
  :deep(.markdown-body) {
    color-scheme: dark;
    --fgColor-default: rgba(228, 225, 230, 0.84);
    --fgColor-muted: rgba(185, 202, 202, 0.72);
    --fgColor-accent: #63f7ff;
    --fgColor-success: #69f6b9;
    --fgColor-attention: #f3c969;
    --fgColor-danger: #ff7a90;
    --bgColor-default: transparent;
    --bgColor-muted: rgba(255, 255, 255, 0.04);
    --bgColor-neutral-muted: rgba(255, 255, 255, 0.06);
    --bgColor-attention-muted: rgba(243, 201, 105, 0.12);
    --borderColor-default: rgba(58, 73, 74, 0.42);
    --borderColor-muted: rgba(58, 73, 74, 0.34);
    --borderColor-neutral-muted: rgba(58, 73, 74, 0.3);
    --borderColor-accent-emphasis: rgba(99, 247, 255, 0.42);
    --borderColor-success-emphasis: rgba(105, 246, 185, 0.42);
    --borderColor-attention-emphasis: rgba(243, 201, 105, 0.42);
    --borderColor-danger-emphasis: rgba(255, 122, 144, 0.42);
    --color-prettylights-syntax-comment: rgba(185, 202, 202, 0.62);
    --color-prettylights-syntax-constant: #79c0ff;
    --color-prettylights-syntax-constant-other-reference-link: #a5d6ff;
    --color-prettylights-syntax-entity: #d2a8ff;
    --color-prettylights-syntax-storage-modifier-import: rgba(228, 225, 230, 0.84);
    --color-prettylights-syntax-entity-tag: #7ee787;
    --color-prettylights-syntax-keyword: #ff7b72;
    --color-prettylights-syntax-string: #a5d6ff;
    --color-prettylights-syntax-variable: #ffa657;
    --color-prettylights-syntax-string-regexp: #7ee787;
    --color-prettylights-syntax-markup-heading: #63f7ff;
    --color-prettylights-syntax-markup-bold: rgba(244, 247, 248, 0.94);
    --color-prettylights-syntax-markup-italic: rgba(228, 225, 230, 0.84);
    --color-prettylights-syntax-markup-inserted-text: #69f6b9;
    --color-prettylights-syntax-markup-inserted-bg: rgba(105, 246, 185, 0.12);
    --color-prettylights-syntax-markup-deleted-text: #ff9fb0;
    --color-prettylights-syntax-markup-deleted-bg: rgba(255, 122, 144, 0.12);
    --color-prettylights-syntax-markup-changed-text: #f3c969;
    --color-prettylights-syntax-markup-changed-bg: rgba(243, 201, 105, 0.12);
    width: 100%;
    max-width: 100%;
    color: rgba(228, 225, 230, 0.84);
    background: transparent;
    font-family: var(--font-ui);
    font-size: 13px;
    line-height: 1.72;
  }

  &.markdown-body table,
  :deep(.markdown-body table) {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
    background: rgba(12, 18, 22, 0.78);
  }

  &.markdown-body thead,
  &.markdown-body tbody,
  &.markdown-body tr,
  &.markdown-body th,
  &.markdown-body td,
  :deep(.markdown-body thead),
  :deep(.markdown-body tbody),
  :deep(.markdown-body tr),
  :deep(.markdown-body th),
  :deep(.markdown-body td) {
    background: transparent;
  }

  &.markdown-body thead tr,
  :deep(.markdown-body thead tr) {
    background: rgba(255, 255, 255, 0.05);
  }

  &.markdown-body tbody tr,
  :deep(.markdown-body tbody tr) {
    background: rgba(255, 255, 255, 0.02);
  }

  &.markdown-body tbody tr:nth-child(2n),
  :deep(.markdown-body tbody tr:nth-child(2n)) {
    background: rgba(255, 255, 255, 0.035);
  }

  &.markdown-body th,
  &.markdown-body td,
  :deep(.markdown-body th),
  :deep(.markdown-body td) {
    padding: 8px 10px;
    border-color: rgba(58, 73, 74, 0.42);
    background: transparent;
    color: rgba(228, 225, 230, 0.88);
  }

  &.markdown-body th,
  :deep(.markdown-body th) {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(244, 247, 248, 0.94);
  }

  &.markdown-body blockquote,
  :deep(.markdown-body blockquote) {
    color: rgba(185, 202, 202, 0.78);
    border-left-color: rgba(99, 247, 255, 0.22);
  }

  &.markdown-body h1,
  &.markdown-body h2,
  &.markdown-body h3,
  &.markdown-body h4,
  &.markdown-body h5,
  &.markdown-body h6,
  :deep(.markdown-body h1),
  :deep(.markdown-body h2),
  :deep(.markdown-body h3),
  :deep(.markdown-body h4),
  :deep(.markdown-body h5),
  :deep(.markdown-body h6) {
    color: rgba(244, 247, 248, 0.94);
    border-bottom-color: rgba(58, 73, 74, 0.34);
  }

  :deep(p),
  :deep(li),
  :deep(blockquote) {
    color: rgba(228, 225, 230, 0.84);
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.72;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  :deep(p),
  :deep(ul),
  :deep(ol),
  :deep(pre),
  :deep(blockquote) {
    margin: 0;
  }

  :deep(p + p),
  :deep(p + ul),
  :deep(p + ol),
  :deep(ul + p),
  :deep(ol + p),
  :deep(think + p),
  :deep(pre + p),
  :deep(p + pre) {
    margin-top: 8px;
  }

  :deep(.agent-think) {
    display: block;
    margin: 0 0 10px;
    border: 1px solid rgba(221, 183, 255, 0.12);
    border-radius: 7px;
    background: rgba(221, 183, 255, 0.04);
    overflow: hidden;
  }

  :deep(.agent-think-summary) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-height: 34px;
    padding: 8px 10px;
    list-style: none;
    cursor: pointer;
    overflow: hidden;
  }

  :deep(.agent-think-summary::-webkit-details-marker) {
    display: none;
  }

  :deep(.agent-think:not([open]) .agent-think-body) {
    display: none;
  }

  :deep(.agent-think-summary::before) {
    content: var(--agent-think-label, 'Think');
    color: rgba(221, 183, 255, 0.82);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    text-transform: uppercase;
  }

  :deep(.agent-think-summary::after) {
    content: '';
    width: 7px;
    height: 7px;
    border-right: 1.5px solid rgba(221, 183, 255, 0.72);
    border-bottom: 1.5px solid rgba(221, 183, 255, 0.72);
    transform: rotate(45deg);
    transition: transform 140ms ease;
  }

  :deep(.agent-think[open] .agent-think-summary::after) {
    transform: rotate(225deg);
  }

  :deep(.agent-think-preview) {
    display: block;
    min-width: 0;
    max-width: 100%;
    color: rgba(205, 195, 214, 0.82);
    font-size: 12px;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :deep(.agent-think-body) {
    padding: 0 10px 10px;
    border-top: 1px solid rgba(221, 183, 255, 0.08);
    color: rgba(205, 195, 214, 0.86);
    font-size: 12px;
    line-height: 1.65;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  :deep(.agent-think-body .markdown-body) {
    padding-top: 8px;
    color: rgba(205, 195, 214, 0.86);
    background: transparent;
    font-size: 12px;
    line-height: 1.65;
  }

  :deep(.agent-think-body p),
  :deep(.agent-think-body ul),
  :deep(.agent-think-body ol),
  :deep(.agent-think-body pre),
  :deep(.agent-think-body blockquote) {
    margin: 0;
  }

  :deep(.agent-think-body p + p),
  :deep(.agent-think-body p + ul),
  :deep(.agent-think-body p + ol),
  :deep(.agent-think-body ul + p),
  :deep(.agent-think-body ol + p),
  :deep(.agent-think-body pre + p),
  :deep(.agent-think-body p + pre) {
    margin-top: 8px;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 18px;
  }

  :deep(a) {
    color: #63f7ff;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  :deep(code) {
    display: inline;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
    color: #4ff7c0;
    font-size: 11px;
    font-family: var(--font-mono);
    line-height: 1.55;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  :deep(pre) {
    max-width: 100%;
    margin-bottom: 8px;
    padding: 10px 11px;
    border: 1px solid rgba(58, 73, 74, 0.28);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
    overflow: auto;
  }

  :deep(pre code) {
    display: block;
    padding: 0;
    border-radius: 0;
    background: transparent;
    color: #4ff7c0;
    font-size: 11px;
    font-family: var(--font-mono);
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
    display: inline-flex;
    min-height: 32px;
    max-width: 100%;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    border: 1px solid rgba(58, 73, 74, 0.4);
    border-radius: 4px;
    background: rgba(53, 52, 56, 0.66);
    color: rgba(228, 225, 230, 0.82);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.35;
    text-align: center;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
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
