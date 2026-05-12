<script setup lang="ts">
import {
  ArrowUp,
  Eye,
  EyeOff,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  FileText,
  FolderOpen
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, nextTick, ref, watch } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue';
import { useSshConsoleStore } from '../../stores/ssh-console';
import type { RemoteEntry } from '../../types/ssh-console';

const store = useSshConsoleStore();
const {
  explorerBusy,
  explorerError,
  explorerLoading,
  isConnected,
  remoteDirectory,
  remotePreview,
  showHiddenFiles
} = storeToRefs(store);
const { t } = useAppCopy();

const fileInput = ref<HTMLInputElement | null>(null);
const dropActive = ref(false);
const pathInput = ref('');
const selectedEntryPath = ref('');
const editingEntryPath = ref('');
const editingName = ref('');
const renamingEntryPath = ref('');
const renameInput = ref<HTMLInputElement | null>(null);
const pathCompletionMatches = ref<string[]>([]);
const pathCompletionIndex = ref(-1);
const pathCompletionQuery = ref('');

const previewLines = computed(() => {
  if (!remotePreview.value) return [];
  return remotePreview.value.content.split(/\r?\n/).slice(0, 10);
});

const canGoToParentDirectory = computed(() => {
  const currentPath = remoteDirectory.value?.path?.trim();
  return Boolean(currentPath && currentPath !== '/');
});

const visibleEntries = computed(() => {
  const entries = remoteDirectory.value?.entries ?? [];
  if (showHiddenFiles.value) {
    return entries;
  }

  return entries.filter((entry) => !entry.name.startsWith('.'));
});

watch(
  () => remoteDirectory.value?.path,
  (path) => {
    pathInput.value = path ?? '';
    selectedEntryPath.value = '';
    editingEntryPath.value = '';
    editingName.value = '';
    resetPathCompletionState();
  },
  { immediate: true }
);

function resetPathCompletionState() {
  pathCompletionMatches.value = [];
  pathCompletionIndex.value = -1;
  pathCompletionQuery.value = '';
}

function isSameMatchList(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function openEntry(entry: RemoteEntry) {
  selectedEntryPath.value = entry.path;
  editingEntryPath.value = '';
  await store.openRemoteEntry(entry);
}

function triggerUploadPicker() {
  fileInput.value?.click();
}

async function handleFileSelection(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []);
  if (files.length > 0) {
    await store.uploadRemoteFiles(files);
  }

  (event.target as HTMLInputElement).value = '';
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  dropActive.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) {
    await store.uploadRemoteFiles(files);
  }
}

async function handleCreateDirectory() {
  const name = window.prompt(t('newFolderPrompt'));
  if (!name) return;
  await store.createRemoteDirectory(name);
}

async function handleRename(entry: RemoteEntry) {
  selectedEntryPath.value = entry.path;
  editingEntryPath.value = entry.path;
  editingName.value = entry.name;
  await nextTick();
  const input = renameInput.value;
  if (!input) return;

  input.focus();
  const extensionIndex =
    entry.kind === 'file' && entry.name.includes('.') ? entry.name.lastIndexOf('.') : -1;
  const selectionEnd = extensionIndex > 0 ? extensionIndex : entry.name.length;
  input.setSelectionRange(0, selectionEnd);
}

async function handleDelete(entry: RemoteEntry) {
  const confirmed = window.confirm(`${t('deleteConfirm')} ${entry.name}?`);
  if (!confirmed) return;
  await store.deleteRemoteEntry(entry.path);
}

async function submitPath() {
  const nextPath = pathInput.value.trim();
  if (!nextPath) return;
  await store.loadRemoteDirectory(nextPath);
}

async function handlePathTabComplete() {
  if (!isConnected.value || explorerBusy.value || explorerLoading.value) {
    return;
  }

  const currentValue = pathInput.value;
  const basePath = remoteDirectory.value?.path?.trim() || '.';
  const result = await window.api.ssh.completeRemotePath({
    input: currentValue,
    basePath
  });

  if (!result.matches.length) {
    resetPathCompletionState();
    return;
  }

  const canCycle =
    pathCompletionQuery.value === currentValue &&
    isSameMatchList(pathCompletionMatches.value, result.matches) &&
    result.matches.length > 1;

  if (canCycle) {
    const nextIndex =
      (pathCompletionIndex.value + 1 + result.matches.length) % result.matches.length;
    pathCompletionIndex.value = nextIndex;
    pathCompletionQuery.value = result.matches[nextIndex];
    pathInput.value = result.matches[nextIndex];
    return;
  }

  pathCompletionMatches.value = result.matches;
  pathCompletionIndex.value = result.matches.indexOf(result.value);
  pathCompletionQuery.value = result.value;
  pathInput.value = result.value;
}

async function goToParentDirectory() {
  const currentPath = remoteDirectory.value?.path?.trim();
  if (!currentPath || currentPath === '/') return;

  const normalizedPath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  const parentPath = lastSlashIndex <= 0 ? '/' : normalizedPath.slice(0, lastSlashIndex);
  await store.loadRemoteDirectory(parentPath);
}

function handleEntryClick(entry: RemoteEntry, event: MouseEvent) {
  if (event.detail > 1) return;

  if (editingEntryPath.value && editingEntryPath.value !== entry.path) {
    editingEntryPath.value = '';
    editingName.value = '';
  }

  selectedEntryPath.value = entry.path;
}

async function handleEntryNameClick(entry: RemoteEntry) {
  if (editingEntryPath.value === entry.path || renamingEntryPath.value === entry.path) {
    return;
  }

  if (selectedEntryPath.value !== entry.path) {
    selectedEntryPath.value = entry.path;
    return;
  }

  await handleRename(entry);
}

function cancelRename() {
  if (renamingEntryPath.value) {
    return;
  }

  editingEntryPath.value = '';
  editingName.value = '';
}

async function submitRename(entry: RemoteEntry) {
  if (editingEntryPath.value !== entry.path || renamingEntryPath.value === entry.path) {
    return;
  }

  const nextName = editingName.value.trim();
  if (!nextName || nextName === entry.name) {
    cancelRename();
    return;
  }

  renamingEntryPath.value = entry.path;
  editingEntryPath.value = '';
  editingName.value = '';

  try {
    await store.renameRemoteEntry(entry.path, nextName);
    selectedEntryPath.value = '';
  } finally {
    renamingEntryPath.value = '';
  }
}
</script>

<template>
  <div
    class="explorer-pane remote-explorer-pane"
    :class="{ 'is-drop-active': dropActive }"
    @dragenter.prevent="dropActive = true"
    @dragover.prevent="dropActive = true"
    @dragleave.prevent="dropActive = false"
    @drop="void handleDrop($event)"
  >
    <header class="section-label">
      <span>{{ t('fileExplorer') }}</span>
      <div class="explorer-actions">
        <button
          class="mini-icon-btn"
          :disabled="!isConnected || explorerBusy"
          @click="triggerUploadPicker"
        >
          <Upload :size="14" />
        </button>
        <button
          class="mini-icon-btn"
          :disabled="!isConnected || explorerBusy"
          @click="void handleCreateDirectory()"
        >
          <FolderPlus :size="14" />
        </button>
        <button
          class="mini-icon-btn"
          :disabled="!isConnected || explorerLoading || explorerBusy"
          @click="void store.toggleHiddenFiles()"
        >
          <component :is="showHiddenFiles ? EyeOff : Eye" :size="14" />
        </button>
        <button
          class="mini-icon-btn"
          :disabled="!isConnected || explorerLoading || explorerBusy"
          @click="void store.loadRemoteDirectory(remoteDirectory?.path)"
        >
          <RefreshCw :size="14" />
        </button>
      </div>
    </header>

    <input
      ref="fileInput"
      class="hidden-upload-input"
      type="file"
      multiple
      @change="void handleFileSelection($event)"
    />

    <EmptyStatePanel
      v-if="!isConnected"
      :compact="true"
      :description="t('explorerDisconnectedHint')"
      :icon="FolderOpen"
      :title="t('explorerDisconnectedTitle')"
    />

    <div v-else class="remote-explorer-content">
      <div class="remote-path-bar">
        <form class="remote-path-form" @submit.prevent="void submitPath()">
          <input
            v-model="pathInput"
            class="remote-path-input"
            :disabled="explorerLoading || explorerBusy"
            :placeholder="t('remotePathPlaceholder')"
            type="text"
            @input="resetPathCompletionState()"
            @keydown.tab.prevent="void handlePathTabComplete()"
          />
          <button
            class="mini-icon-btn remote-path-up-btn"
            :disabled="!canGoToParentDirectory || explorerLoading || explorerBusy"
            @click="void goToParentDirectory()"
          >
            <ArrowUp :size="14" />
          </button>
        </form>
      </div>

      <div class="remote-explorer-scroll">
        <div v-if="explorerError" class="remote-explorer-error">{{ explorerError }}</div>

        <div v-if="explorerLoading" class="empty-state compact">{{ t('loadingRemoteFiles') }}</div>

        <div v-else-if="visibleEntries.length" class="remote-entry-list">
          <button
            v-for="entry in visibleEntries"
            :key="entry.path"
            class="remote-entry-row"
            :class="{ 'is-selected': selectedEntryPath === entry.path }"
            @click="handleEntryClick(entry, $event)"
            @dblclick="void openEntry(entry)"
          >
            <div class="remote-entry-main">
              <component :is="entry.kind === 'directory' ? FolderOpen : FileText" :size="15" />
              <input
                v-if="editingEntryPath === entry.path"
                ref="renameInput"
                v-model="editingName"
                class="remote-entry-rename-input"
                type="text"
                @blur="void submitRename(entry)"
                @click.stop
                @dblclick.stop
                @keydown.enter.prevent="void submitRename(entry)"
                @keydown.esc.prevent="cancelRename()"
              />
              <button
                v-else
                class="remote-entry-name"
                :class="{ 'is-selected': selectedEntryPath === entry.path }"
                @click.stop="void handleEntryNameClick(entry)"
                @dblclick.stop="void openEntry(entry)"
              >
                {{ entry.name }}
              </button>
            </div>
            <div class="remote-entry-actions">
              <button
                v-if="entry.kind !== 'directory'"
                class="mini-icon-btn"
                :disabled="explorerBusy"
                @click.stop="selectedEntryPath = entry.path"
                @dblclick.stop="void openEntry(entry)"
              >
                <Eye :size="13" />
              </button>
              <button
                class="mini-icon-btn"
                :disabled="explorerBusy"
                @click.stop="void handleRename(entry)"
              >
                <Pencil :size="13" />
              </button>
              <button
                class="mini-icon-btn"
                :disabled="explorerBusy"
                @click.stop="void handleDelete(entry)"
              >
                <Trash2 :size="13" />
              </button>
            </div>
          </button>
        </div>

        <EmptyStatePanel
          v-else
          :compact="true"
          :description="t('emptyRemoteFolderHint')"
          :icon="FolderPlus"
          :title="t('emptyRemoteFolder')"
        />

        <div v-if="remotePreview" class="remote-preview">
          <div class="remote-preview-header">
            <span>{{ remotePreview.path }}</span>
          </div>
          <pre class="remote-preview-body">{{ previewLines.join('\n') }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.explorer-pane {
  min-height: 0;
  padding: 14px 16px;
}

.explorer-actions {
  display: flex;
  gap: 10px;
}

.remote-explorer-pane {
  position: relative;
  display: flex;
  overflow: hidden;
  flex-direction: column;

  &.is-drop-active {
    background: rgba(18, 28, 30, 0.55);
    box-shadow: inset 0 0 0 1px rgba(99, 247, 255, 0.45);
  }
}

.hidden-upload-input {
  display: none;
}

.remote-explorer-content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.remote-explorer-scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding-top: 10px;
}

.remote-path-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  padding-bottom: 10px;
  background: rgba(27, 27, 30, 0.94);
  backdrop-filter: blur(10px);
}

.remote-path-form {
  display: flex;
  gap: 8px;
}

.remote-path-input {
  height: 36px;
  flex: 1;
  padding: 0 12px;
  border: 1px solid var(--field-border);
  border-radius: 4px;
  background: rgba(14, 14, 17, 0.72);
  color: rgba(228, 225, 230, 0.88);
  font-size: 12px;

  &:focus-visible {
    border-color: var(--field-border-strong);
    background: var(--field-bg-elevated);
    box-shadow: var(--field-shadow-focus);
  }

  &:hover {
    border-color: rgba(99, 247, 255, 0.24);
  }
}

.remote-path-up-btn {
  flex: 0 0 auto;
}

.remote-entry-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.remote-entry-row {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 10px;
  border: 0;
  border-radius: 4px;
  background: rgba(53, 52, 56, 0.34);
  color: rgba(228, 225, 230, 0.88);
  cursor: pointer;

  &:hover {
    background: rgba(53, 52, 56, 0.62);
  }

  &.is-selected {
    background: rgba(0, 220, 229, 0.12);
    box-shadow: inset 0 0 0 1px rgba(99, 247, 255, 0.32);
  }
}

.remote-entry-main,
.remote-entry-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.remote-entry-main {
  min-width: 0;
}

.remote-entry-name {
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;

  &.is-selected:hover {
    color: var(--cyan-soft);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}

.remote-entry-rename-input {
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid rgba(99, 247, 255, 0.32);
  border-radius: 4px;
  background: rgba(14, 14, 17, 0.82);
  color: rgba(228, 225, 230, 0.92);
  font-size: 12px;

  &:focus-visible {
    border-color: var(--field-border-strong);
    box-shadow: var(--field-shadow-focus);
  }
}

.remote-preview {
  padding-top: 10px;
  border-top: 1px solid rgba(58, 73, 74, 0.35);
}

.remote-preview-header {
  margin-bottom: 8px;
  color: rgba(185, 202, 202, 0.82);
  font-size: 11px;
  word-break: break-all;
}

.remote-preview-body {
  max-height: 132px;
  overflow: auto;
  padding: 10px;
  border: 1px solid rgba(58, 73, 74, 0.3);
  border-radius: 4px;
  background: rgba(14, 14, 17, 0.74);
  color: rgba(228, 225, 230, 0.88);
  font-family: 'JetBrains Mono', 'Cascadia Mono', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
