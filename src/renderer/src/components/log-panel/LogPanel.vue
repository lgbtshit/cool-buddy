<script setup lang="ts">
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

function handlePathInput(event: Event) {
  resetCompletionState();
  emit('pathInput', (event.target as HTMLInputElement).value);
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
      <input
        :value="logPath"
        class="log-path-input"
        :disabled="isRunning"
        :placeholder="pathPlaceholder"
        type="text"
        @input="handlePathInput"
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
