<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import LogStreamPane from '../../components/log-panel/LogStreamPane.vue';
import { useAppCopy } from '../../composables/use-app-copy';
import type { LogTailStream, LogTailState } from '../../types/ssh-console';

const route = useRoute();
const { t } = useAppCopy();

const removeLogDataListener = ref<(() => void) | null>(null);
const removeLogStatusListener = ref<(() => void) | null>(null);
const removeStatusListener = ref<(() => void) | null>(null);

const lineLimit = ref(50);
const completionBasePath = ref('');
const isConnected = ref(false);
const streamId = `popup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const stream = ref<LogTailStream>({
  id: streamId,
  path: '',
  lines: [],
  state: 'idle',
  error: '',
  statusMessage: ''
});
let remainder = '';

const pageTitle = computed(() => stream.value.path.trim() || t('logTitle'));

function applyStreamStatus(payload: { status: LogTailState; path: string; message: string }) {
  stream.value.state = payload.status;
  stream.value.statusMessage = payload.message.trim();

  if (payload.path && payload.path !== stream.value.path) {
    stream.value.path = payload.path;
  }

  if (payload.status === 'error') {
    stream.value.error = payload.message.trim();
    stream.value.lines = [];
    remainder = '';
    return;
  }

  if (payload.status === 'idle') {
    stream.value.error = '';
    stream.value.lines = [];
    remainder = '';
    return;
  }

  stream.value.error = '';
}

function appendChunk(chunk: string) {
  const normalizedChunk = chunk.replace(/\r\n/g, '\n');
  const combined = `${remainder}${normalizedChunk}`;
  const parts = combined.split('\n');
  remainder = parts.pop() ?? '';

  if (!parts.length) {
    return;
  }

  stream.value.lines = [...stream.value.lines, ...parts].slice(-lineLimit.value);
}

async function startLogTail() {
  const path = stream.value.path.trim();
  if (!path || !isConnected.value) {
    return;
  }

  stream.value.lines = [];
  stream.value.error = '';
  stream.value.statusMessage = '';
  remainder = '';
  await window.api.ssh.startLogTail({
    streamId,
    path,
    lineCount: lineLimit.value
  });
}

async function stopLogTail() {
  await window.api.ssh.stopLogTail(streamId);
}

function setPath(value: string) {
  stream.value.path = value;
}

function hydrateFromQuery() {
  const path = typeof route.query.path === 'string' ? route.query.path : '';
  const basePath = typeof route.query.basePath === 'string' ? route.query.basePath : '';
  const nextLineLimit = Number(route.query.lineLimit);

  stream.value.path = path;
  completionBasePath.value = basePath;
  lineLimit.value = Number.isFinite(nextLineLimit) && nextLineLimit > 0 ? Math.trunc(nextLineLimit) : 50;
}

onMounted(async () => {
  hydrateFromQuery();
  document.title = pageTitle.value;

  const status = await window.api.ssh.getStatusSnapshot();
  isConnected.value = status.status === 'connected';

  removeStatusListener.value = window.api.ssh.onStatus((payload) => {
    isConnected.value = payload.status === 'connected';
    if (payload.status === 'disconnected' || payload.status === 'error') {
      applyStreamStatus({
        status: 'idle',
        path: stream.value.path,
        message: payload.message
      });
    }
  });

  removeLogDataListener.value = window.api.ssh.onLogData((payload) => {
    if (payload.streamId !== streamId) {
      return;
    }
    appendChunk(payload.chunk);
  });

  removeLogStatusListener.value = window.api.ssh.onLogStatus((payload) => {
    if (payload.streamId !== streamId) {
      return;
    }
    applyStreamStatus(payload);
  });

  if (stream.value.path.trim() && isConnected.value) {
    await startLogTail();
  }
});

onBeforeUnmount(async () => {
  removeStatusListener.value?.();
  removeLogDataListener.value?.();
  removeLogStatusListener.value?.();
  if (stream.value.state === 'running') {
    await stopLogTail();
  }
});
</script>

<template>
  <main class="log-pane-window">
    <header class="window-topbar">
      <div class="window-title-group">
        <span class="window-kicker">{{ t('logTitle') }}</span>
        <h1>{{ pageTitle }}</h1>
      </div>
    </header>

    <section class="window-content">
      <LogStreamPane
        :can-remove="false"
        :completion-base-path="completionBasePath"
        :disconnected-hint="t('logDisconnectedHint')"
        :disconnected-title="t('logDisconnectedTitle')"
        :empty-hint="t('logEmptyHint')"
        :empty-title="t('logEmptyTitle')"
        :is-connected="isConnected"
        :path-placeholder="t('logPathPlaceholder')"
        :can-popout="false"
        :popout-label="t('logPopout')"
        :running-label="t('logRunning')"
        :single="false"
        :start-label="t('logStart')"
        :stop-label="t('logStop')"
        :stopped-label="t('logStopped')"
        :stream="stream"
        :stream-close-label="t('logCloseStream')"
        :stream-index="0"
        :stream-label="t('logStreamLabel')"
        :waiting-events="t('waitingEvents')"
        @path-input="setPath($event.value)"
        @start="void startLogTail()"
        @stop="void stopLogTail()"
      />
    </section>
  </main>
</template>

<style scoped lang="scss">
.log-pane-window {
  display: grid;
  height: 100vh;
  min-height: 100vh;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: #101315;
}

.window-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(58, 73, 74, 0.24);
  background: rgba(20, 24, 27, 0.94);
}

.window-title-group {
  min-width: 0;

  h1 {
    overflow: hidden;
    margin: 4px 0 0;
    color: rgba(228, 225, 230, 0.96);
    font-size: 16px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.window-kicker {
  color: rgba(105, 246, 185, 0.82);
  font-size: 11px;
  text-transform: uppercase;
}

.window-content {
  display: flex;
  min-height: 0;
  padding: 12px;
  overflow: hidden;

  :deep(.log-pane) {
    flex: 1;
    min-height: 0;
  }
}
</style>
