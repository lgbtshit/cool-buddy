<script setup lang="ts">
import { ElInput } from 'element-plus';
import 'element-plus/es/components/input/style/css';
import { nextTick, ref, watch, computed } from 'vue';
import { ExternalLink, FileText, Play, Square, X } from 'lucide-vue-next';
import type { LogTailStream } from '../../types/ssh-console';
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue';

const props = defineProps<{
  completionBasePath?: string;
  disconnectedHint: string;
  disconnectedTitle: string;
  emptyHint: string;
  emptyTitle: string;
  isConnected: boolean;
  pathPlaceholder: string;
  runningLabel: string;
  single: boolean;
  startLabel: string;
  stopLabel: string;
  stoppedLabel: string;
  stream: LogTailStream;
  streamCloseLabel: string;
  streamIndex: number;
  streamLabel: string;
  waitingEvents: string;
  canRemove: boolean;
  popoutLabel: string;
  canPopout: boolean;
}>();

const emit = defineEmits<{
  pathInput: [payload: { streamId: string; value: string }];
  start: [streamId: string];
  stop: [streamId: string];
  remove: [streamId: string];
  popout: [streamId: string];
}>();

const logStreamRef = ref<HTMLElement | null>(null);
const completionMatches = ref<string[]>([]);
const completionIndex = ref(-1);
const completionQuery = ref('');

const paneTitle = computed(
  () => props.stream.path.trim() || `${props.streamLabel} ${props.streamIndex + 1}`
);
const canStart = computed(
  () =>
    Boolean(props.isConnected && props.stream.path.trim() && props.stream.state !== 'running')
);

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
  emit('pathInput', { streamId: props.stream.id, value });
}

async function handlePathTabComplete() {
  if (!props.isConnected || props.stream.state === 'running') {
    return;
  }

  const currentValue = props.stream.path;
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
    emit('pathInput', {
      streamId: props.stream.id,
      value: result.matches[nextIndex]
    });
    return;
  }

  completionMatches.value = result.matches;
  completionIndex.value = result.matches.indexOf(result.value);
  completionQuery.value = result.value;
  emit('pathInput', { streamId: props.stream.id, value: result.value });
}

watch(
  () => [props.stream.lines.length, props.stream.state] as const,
  async ([lineCount, state]) => {
    if (state !== 'running' || lineCount === 0) {
      return;
    }

    await nextTick();
    const element = logStreamRef.value;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }
);

watch(
  () => props.stream.path,
  (value) => {
    if (value !== completionQuery.value) {
      resetCompletionState();
    }
  }
);
</script>

<template>
  <section class="log-pane" :class="{ 'log-pane-single': single }">
    <div class="log-pane-header">
      <div class="log-pane-heading">
        <span class="log-pane-title" :title="paneTitle">{{ paneTitle }}</span>
        <span class="pause-pill" :class="{ active: stream.state === 'running' }">
          {{ stream.state === 'running' ? runningLabel : stoppedLabel }}
        </span>
      </div>

      <div class="log-pane-actions">
        <button
          v-if="stream.state !== 'running'"
          class="mini-text-btn"
          :disabled="!canStart"
          @click="emit('start', stream.id)"
        >
          <Play :size="13" />
          <span>{{ startLabel }}</span>
        </button>
        <button v-else class="mini-text-btn" @click="emit('stop', stream.id)">
          <Square :size="13" />
          <span>{{ stopLabel }}</span>
        </button>
        <button
          v-if="canPopout"
          class="mini-icon-btn"
          :title="popoutLabel"
          @click="emit('popout', stream.id)"
        >
          <ExternalLink :size="13" />
        </button>
        <button
          v-if="canRemove"
          class="mini-icon-btn"
          :title="streamCloseLabel"
          @click="emit('remove', stream.id)"
        >
          <X :size="13" />
        </button>
      </div>
    </div>

    <div class="log-pane-toolbar">
      <ElInput
        :model-value="stream.path"
        class="log-path-input"
        :disabled="stream.state === 'running'"
        :placeholder="pathPlaceholder"
        @update:model-value="handlePathInput"
        @keydown.tab.prevent="void handlePathTabComplete()"
      />
    </div>

    <div class="log-pane-body">
      <div v-if="stream.error" class="remote-explorer-error log-error">{{ stream.error }}</div>

      <template v-if="stream.state === 'running' && stream.lines.length > 0">
        <pre ref="logStreamRef" class="log-stream">{{ stream.lines.join('\n') }}</pre>
        <p class="log-waiting">
          <span>{{ waitingEvents }}</span>
          <span class="waiting-dot"></span>
        </p>
      </template>

      <template v-else-if="stream.state === 'running'">
        <EmptyStatePanel
          compact
          :description="waitingEvents"
          :icon="FileText"
          :title="runningLabel"
        />
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
  </section>
</template>

<style scoped lang="scss">
.log-pane {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  border: 1px solid rgba(70, 86, 88, 0.34);
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(28, 34, 37, 0.96), rgba(17, 20, 23, 0.96)),
    rgba(17, 20, 23, 0.96);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.log-pane-single {
  border-color: transparent;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.log-pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 0;
}

.log-pane-heading,
.log-pane-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.log-pane-actions {
  flex: 0 0 auto;
}

.log-pane-title {
  overflow: hidden;
  color: rgba(228, 225, 230, 0.9);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pause-pill {
  flex: 0 0 auto;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(53, 52, 56, 0.8);
  color: rgba(228, 225, 230, 0.78);
  font-size: 10px;

  &.active {
    background: rgba(16, 185, 129, 0.16);
    color: #8df5c8;
  }
}

.log-pane-toolbar {
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
    box-shadow: inset 0 0 0 1px rgba(58, 73, 74, 0.18);
  }

  :deep(.el-input__inner) {
    font-size: 12px;
  }
}

.log-pane-body {
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

@media (max-width: 900px) {
  .log-pane-header {
    flex-direction: column;
    align-items: stretch;
  }

  .log-pane-actions {
    justify-content: flex-end;
  }
}
</style>
