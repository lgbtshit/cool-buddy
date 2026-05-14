<script setup lang="ts">
import { computed } from 'vue';
import { MonitorCog, Plus, Settings2 } from 'lucide-vue-next';
import type { LogTailStream } from '../../types/ssh-console';
import LogStreamPane from './LogStreamPane.vue';

const props = defineProps<{
  completionBasePath?: string;
  disconnectedHint: string;
  disconnectedTitle: string;
  emptyHint: string;
  emptyTitle: string;
  isConnected: boolean;
  logTitle: string;
  logSettingsLabel: string;
  logAddStreamLabel: string;
  logCloseStreamLabel: string;
  logPopoutLabel: string;
  pathPlaceholder: string;
  runningLabel: string;
  startLabel: string;
  stopLabel: string;
  stoppedLabel: string;
  streamLabel: string;
  streams: LogTailStream[];
  waitingEvents: string;
}>();

const emit = defineEmits<{
  openSettings: [];
  addStream: [];
  removeStream: [streamId: string];
  pathInput: [payload: { streamId: string; value: string }];
  popoutStream: [streamId: string];
  start: [streamId: string];
  stop: [streamId: string];
}>();

const isMultiPane = computed(() => props.streams.length > 1);
const streamSummary = computed(() => `${props.streams.length}`);
</script>

<template>
  <div class="panel-shell logs-shell" :class="{ 'logs-shell-multi': isMultiPane }">
    <div class="panel-topbar">
      <div class="panel-title accent">
        <MonitorCog :size="14" />
        <span>{{ logTitle }}</span>
      </div>
      <div class="log-meta">
        <span class="stream-count">{{ streamSummary }}</span>
        <button class="mini-icon-btn" :title="logAddStreamLabel" @click="emit('addStream')">
          <Plus :size="13" />
        </button>
        <button class="mini-icon-btn" :title="logSettingsLabel" @click="emit('openSettings')">
          <Settings2 :size="13" />
        </button>
      </div>
    </div>

    <div v-if="isMultiPane" class="log-grid">
      <LogStreamPane
        v-for="(stream, index) in streams"
        :key="stream.id"
        :can-remove="streams.length > 1"
        :completion-base-path="completionBasePath"
        :disconnected-hint="disconnectedHint"
        :disconnected-title="disconnectedTitle"
        :empty-hint="emptyHint"
        :empty-title="emptyTitle"
        :is-connected="isConnected"
        :path-placeholder="pathPlaceholder"
        :can-popout="true"
        :running-label="runningLabel"
        :single="false"
        :popout-label="logPopoutLabel"
        :start-label="startLabel"
        :stop-label="stopLabel"
        :stopped-label="stoppedLabel"
        :stream="stream"
        :stream-close-label="logCloseStreamLabel"
        :stream-index="index"
        :stream-label="streamLabel"
        :waiting-events="waitingEvents"
        @path-input="emit('pathInput', $event)"
        @popout="emit('popoutStream', $event)"
        @remove="emit('removeStream', $event)"
        @start="emit('start', $event)"
        @stop="emit('stop', $event)"
      />
    </div>

    <LogStreamPane
      v-else
      :can-remove="false"
      :completion-base-path="completionBasePath"
      :disconnected-hint="disconnectedHint"
      :disconnected-title="disconnectedTitle"
      :empty-hint="emptyHint"
      :empty-title="emptyTitle"
      :is-connected="isConnected"
      :path-placeholder="pathPlaceholder"
      :can-popout="true"
      :running-label="runningLabel"
      :single="true"
      :popout-label="logPopoutLabel"
      :start-label="startLabel"
      :stop-label="stopLabel"
      :stopped-label="stoppedLabel"
      :stream="streams[0]"
      :stream-close-label="logCloseStreamLabel"
      :stream-index="0"
      :stream-label="streamLabel"
      :waiting-events="waitingEvents"
      @path-input="emit('pathInput', $event)"
      @popout="emit('popoutStream', $event)"
      @remove="emit('removeStream', $event)"
      @start="emit('start', $event)"
      @stop="emit('stop', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.logs-shell {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.logs-shell-multi {
  background:
    linear-gradient(180deg, rgba(20, 24, 27, 0.92), rgba(17, 20, 23, 0.98)),
    rgba(17, 20, 23, 0.98);
}

.accent {
  color: var(--green);
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(185, 202, 202, 0.62);
}

.stream-count {
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(58, 73, 74, 0.28);
  border-radius: 999px;
  color: rgba(228, 225, 230, 0.8);
  font-size: 11px;
  line-height: 22px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.log-grid {
  display: grid;
  min-height: 0;
  flex: 1;
  gap: 10px;
  padding: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(280px, 1fr);
  overflow: auto;
}

@media (max-width: 960px) {
  .log-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
