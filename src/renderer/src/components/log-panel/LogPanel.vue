<script setup lang="ts">
import { ElInput } from 'element-plus';
import 'element-plus/es/components/input/style/css';
import { nextTick, ref, watch } from 'vue';
import { MonitorCog, Play, Square, FileText, Settings2 } from 'lucide-vue-next';
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue';

const props = defineProps<{
  canStart: boolean;
  completionBasePath?: string;
  isConnected: boolean;
  isRunning: boolean;
  logError: string;
  logLineLimit: number;
  logPath: string;
  logLines: string[];
  logTitle: string;
  logSettingsLabel: string;
  pathPlaceholder: string;
  runningLabel: string;
  startLabel: string;
  stopLabel: string;
  stoppedLabel: string;
  waitingEvents: string;
  emptyTitle: string;
  emptyHint: string;
  disconnectedTitle: string;
  disconnectedHint: string;
}>();

const emit = defineEmits<{
  pathInput: [value: string];
  openSettings: [];
  start: [];
  stop: [];
}>();

const logStreamRef = ref<HTMLElement | null>(null);
const completionMatches = ref<string[]>([]);
const completionIndex = ref(-1);
const completionQuery = ref('');

function resetCompletionState() {
  completionMatches.value = [];
  completionIndex.value = -1;
  completionQuery.value = '';
}

function isSameMatchList(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function handlePathInput(value: string) {
  resetCompletionState();
  emit('pathInput', value);
}

async function handlePathTabComplete() {
  if (!props.isConnected || props.isRunning) {
    return;
  }

  const currentValue = props.logPath;
  const basePath = props.completionBasePath?.trim() || '.';
  const result = await window.api.ssh.completeRemotePath({
    input: currentValue,
    basePath
  });

  if (!result.matches.length) {
    resetCompletionState();
    return;
  }

  const canCycle =
    completionQuery.value === currentValue &&
    isSameMatchList(completionMatches.value, result.matches) &&
    result.matches.length > 1;

  if (canCycle) {
    const nextIndex = (completionIndex.value + 1 + result.matches.length) % result.matches.length;
    completionIndex.value = nextIndex;
    completionQuery.value = result.matches[nextIndex];
    emit('pathInput', result.matches[nextIndex]);
    return;
  }

  completionMatches.value = result.matches;
  completionIndex.value = result.matches.indexOf(result.value);
  completionQuery.value = result.value;
  emit('pathInput', result.value);
}

watch(
  () => [props.logLines.length, props.isRunning] as const,
  async ([lineCount, isRunning]) => {
    if (!isRunning || lineCount === 0) {
      return;
    }

    await nextTick();
    const element = logStreamRef.value;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }
);

watch(
  () => props.logPath,
  (value) => {
    if (value !== completionQuery.value) {
      resetCompletionState();
    }
  }
);
</script>

<template>
  <div class="panel-shell logs-shell">
    <div class="panel-topbar">
      <div class="panel-title accent">
        <MonitorCog :size="14" />
        <span>{{ logTitle }}</span>
      </div>
      <div class="log-meta">
        <span class="pause-pill" :class="{ active: isRunning }">
          {{ isRunning ? runningLabel : stoppedLabel }}
        </span>
        <button class="mini-icon-btn" :title="logSettingsLabel" @click="emit('openSettings')">
          <Settings2 :size="13" />
        </button>
        <button
          v-if="!isRunning"
          class="mini-text-btn"
          :disabled="!canStart"
          @click="emit('start')"
        >
          <Play :size="13" />
          <span>{{ startLabel }}</span>
        </button>
        <button v-else class="mini-text-btn" @click="emit('stop')">
          <Square :size="13" />
          <span>{{ stopLabel }}</span>
        </button>
      </div>
    </div>

    <div class="log-toolbar">
      <ElInput
        :model-value="logPath"
        class="log-path-input"
        :disabled="isRunning"
        :placeholder="pathPlaceholder"
        @update:model-value="handlePathInput"
        @keydown.tab.prevent="void handlePathTabComplete()"
      />
      <span class="log-line-limit">{{ logLineLimit }}</span>
    </div>

    <div class="log-body">
      <div v-if="logError" class="remote-explorer-error log-error">{{ logError }}</div>

      <template v-if="isRunning && logLines.length > 0">
        <pre ref="logStreamRef" class="log-stream">{{ logLines.join('\n') }}</pre>
        <p class="log-waiting">
          <span>{{ waitingEvents }}</span>
          <span class="waiting-dot"></span>
        </p>
      </template>

      <template v-else-if="!isConnected">
        <EmptyStatePanel
          compact
          :description="disconnectedHint"
          :icon="FileText"
          :title="disconnectedTitle"
        />
      </template>

      <template v-else>
        <EmptyStatePanel compact :description="emptyHint" :icon="FileText" :title="emptyTitle" />
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.logs-shell {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.accent {
  color: var(--green);
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(185, 202, 202, 0.62);
}

.pause-pill {
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(53, 52, 56, 0.8);
  color: rgba(228, 225, 230, 0.78);
  font-size: 10px;

  &.active {
    background: rgba(16, 185, 129, 0.16);
    color: #8df5c8;
  }
}

.log-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 0;
}

.log-path-input {
  flex: 1;

  :deep(.el-input__wrapper) {
    min-height: 34px;
    border-radius: 4px;
    background: rgba(14, 14, 17, 0.72);
  }

  :deep(.el-input__inner) {
    font-size: 12px;
  }
}

.log-line-limit {
  min-width: 38px;
  height: 34px;
  flex: 0 0 auto;
  padding: 0 10px;
  border: 1px solid rgba(58, 73, 74, 0.28);
  border-radius: 4px;
  background: rgba(24, 29, 32, 0.78);
  color: rgba(185, 202, 202, 0.82);
  font-size: 11px;
  line-height: 32px;
  text-align: center;
}

.log-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 14px 14px;
  font-size: 12px;
  line-height: 1.65;
}

.log-error {
  margin-bottom: 12px;
}

.log-stream {
  display: block;
  min-height: 0;
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border: 1px solid rgba(58, 73, 74, 0.3);
  border-radius: 4px;
  background: rgba(14, 14, 17, 0.88);
  color: rgba(228, 225, 230, 0.88);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-waiting {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: rgba(185, 202, 202, 0.48);
  font-style: italic;
}

.waiting-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgba(105, 246, 185, 0.75);
  animation: pulse 1.8s infinite;
}
</style>
