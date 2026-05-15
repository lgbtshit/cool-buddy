<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { Bug, Trash2, Wrench } from 'lucide-vue-next';
import { useSshConsoleStore } from '../../stores/ssh-console';

const store = useSshConsoleStore();
const { diagnostics, diagnosticsOpen } = storeToRefs(store);

const diagnosticsNewestFirst = computed(() => [...diagnostics.value].reverse());

function closeModal() {
  store.closeDiagnosticsModal();
}

function openDevtools() {
  void window.api.app.openDevtools();
}
</script>

<template>
  <div v-if="diagnosticsOpen" class="modal-scrim" @click.self="closeModal">
    <section class="session-modal diagnostics-modal">
      <div class="modal-header">
        <div>
          <h2>Diagnostics</h2>
          <p>Frontend, bridge, and backend runtime errors.</p>
        </div>
        <button class="ghost-icon-btn" type="button" @click="openDevtools">
          <Wrench :size="15" />
          <span>Open DevTools</span>
        </button>
      </div>

      <div v-if="diagnosticsNewestFirst.length" class="diagnostics-list">
        <article
          v-for="entry in diagnosticsNewestFirst"
          :key="entry.id"
          class="diagnostics-item"
          :class="`level-${entry.level}`"
        >
          <header class="diagnostics-item-header">
            <div class="diagnostics-item-title">
              <Bug :size="14" />
              <strong>{{ entry.message }}</strong>
            </div>
            <span class="diagnostics-meta">{{ entry.source }} | {{ entry.timestamp }}</span>
          </header>
          <pre class="diagnostics-details">{{ entry.details }}</pre>
        </article>
      </div>
      <div v-else class="diagnostics-empty">No diagnostics yet.</div>

      <div class="modal-actions">
        <button class="secondary-btn" type="button" @click="store.clearDiagnostics()">
          <Trash2 :size="14" />
          <span>Clear</span>
        </button>
        <button class="primary-btn" type="button" @click="closeModal">Close</button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.diagnostics-modal {
  width: min(960px, calc(100vw - 32px));
  max-height: min(82vh, 920px);
}

.ghost-icon-btn {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid rgba(58, 73, 74, 0.5);
  border-radius: 6px;
  background: rgba(22, 22, 26, 0.88);
  color: rgba(228, 225, 230, 0.92);
  cursor: pointer;
}

.diagnostics-list {
  display: grid;
  gap: 12px;
  min-height: 220px;
  max-height: calc(82vh - 180px);
  overflow: auto;
}

.diagnostics-item {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(58, 73, 74, 0.45);
  border-radius: 6px;
  background: rgba(15, 15, 18, 0.94);

  &.level-error {
    border-color: rgba(255, 123, 114, 0.5);
  }

  &.level-warning {
    border-color: rgba(243, 201, 105, 0.45);
  }
}

.diagnostics-item-header,
.diagnostics-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diagnostics-item-header {
  justify-content: space-between;
  align-items: flex-start;
}

.diagnostics-meta {
  color: rgba(185, 202, 202, 0.74);
  font-size: 11px;
}

.diagnostics-details {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: rgba(228, 225, 230, 0.9);
  font-size: 12px;
  line-height: 1.45;
}

.diagnostics-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: rgba(185, 202, 202, 0.78);
}
</style>
