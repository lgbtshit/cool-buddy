<script setup lang="ts">
import { SquareTerminal } from 'lucide-vue-next';
import { ref } from 'vue';
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue';

defineProps<{
  connectionLabel: string;
  sessionName: string;
  title: string;
  emptyDescription: string;
  hasActiveSession: boolean;
}>();

const terminalHostEl = ref<HTMLElement | null>(null);

defineExpose({
  terminalHostEl
});
</script>

<template>
  <div class="panel-shell terminal-shell">
    <div class="panel-topbar">
      <div class="panel-title">
        <SquareTerminal :size="14" />
        <span>{{ hasActiveSession ? `${title} - ${sessionName}` : title }}</span>
      </div>
      <span class="muted">{{ connectionLabel }}</span>
    </div>
    <div class="terminal-frame">
      <EmptyStatePanel
        v-if="!hasActiveSession"
        compact
        :description="emptyDescription"
        :icon="SquareTerminal"
        :title="title"
      />
      <div v-show="hasActiveSession" ref="terminalHostEl" class="terminal-host"></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.terminal-shell {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.terminal-frame {
  display: flex;
  min-height: 0;
  flex: 1;
  padding: 12px;
}

.terminal-host {
  min-height: 0;
  height: 100%;
  flex: 1;
  overflow: hidden;
  border-radius: 4px;
  background: #16161a;

  :deep(.xterm) {
    height: 100%;
    padding: 10px 12px;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0;
    word-spacing: 0;
    font-kerning: none;
  }

  :deep(.xterm-viewport::-webkit-scrollbar) {
    width: 10px;
  }
}
</style>
