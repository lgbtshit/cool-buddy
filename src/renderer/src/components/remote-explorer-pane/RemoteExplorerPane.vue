<script setup lang="ts">
import {
  Eye,
  EyeOff,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  FileText,
  FolderOpen
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAppCopy } from '../../composables/use-app-copy'
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue'
import { useSshConsoleStore } from '../../stores/ssh-console'
import type { RemoteEntry } from '../../types/ssh-console'

const store = useSshConsoleStore()
const {
  explorerBusy,
  explorerError,
  explorerLoading,
  isConnected,
  remoteDirectory,
  remotePreview,
  showHiddenFiles
} = storeToRefs(store)
const { t } = useAppCopy()

const fileInput = ref<HTMLInputElement | null>(null)
const dropActive = ref(false)
const pathInput = ref('')
const selectedEntryPath = ref('')
const editingEntryPath = ref('')
const editingName = ref('')

const previewLines = computed(() => {
  if (!remotePreview.value) return []
  return remotePreview.value.content.split(/\r?\n/).slice(0, 10)
})

const visibleEntries = computed(() => {
  const entries = remoteDirectory.value?.entries ?? []
  if (showHiddenFiles.value) {
    return entries
  }

  return entries.filter((entry) => !entry.name.startsWith('.'))
})

watch(
  () => remoteDirectory.value?.path,
  (path) => {
    pathInput.value = path ?? ''
    selectedEntryPath.value = ''
    editingEntryPath.value = ''
    editingName.value = ''
  },
  { immediate: true }
)

async function openEntry(entry: RemoteEntry) {
  selectedEntryPath.value = entry.path
  editingEntryPath.value = ''
  await store.openRemoteEntry(entry)
}

function triggerUploadPicker() {
  fileInput.value?.click()
}

async function handleFileSelection(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  if (files.length > 0) {
    await store.uploadRemoteFiles(files)
  }

  ;(event.target as HTMLInputElement).value = ''
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  dropActive.value = false
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length > 0) {
    await store.uploadRemoteFiles(files)
  }
}

async function handleCreateDirectory() {
  const name = window.prompt(t('newFolderPrompt'))
  if (!name) return
  await store.createRemoteDirectory(name)
}

async function handleRename(entry: RemoteEntry) {
  selectedEntryPath.value = entry.path
  editingEntryPath.value = entry.path
  editingName.value = entry.name
}

async function handleDelete(entry: RemoteEntry) {
  const confirmed = window.confirm(`${t('deleteConfirm')} ${entry.name}?`)
  if (!confirmed) return
  await store.deleteRemoteEntry(entry.path)
}

async function submitPath() {
  const nextPath = pathInput.value.trim()
  if (!nextPath) return
  await store.loadRemoteDirectory(nextPath)
}

function handleEntryClick(entry: RemoteEntry, event: MouseEvent) {
  if (event.detail > 1) return

  if (editingEntryPath.value && editingEntryPath.value !== entry.path) {
    editingEntryPath.value = ''
    editingName.value = ''
  }

  if (selectedEntryPath.value === entry.path) {
    editingEntryPath.value = entry.path
    editingName.value = entry.name
    return
  }

  selectedEntryPath.value = entry.path
}

function cancelRename() {
  editingEntryPath.value = ''
  editingName.value = ''
}

async function submitRename(entry: RemoteEntry) {
  const nextName = editingName.value.trim()
  if (!nextName || nextName === entry.name) {
    cancelRename()
    return
  }

  await store.renameRemoteEntry(entry.path, nextName)
  cancelRename()
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
          />
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
                v-model="editingName"
                class="remote-entry-rename-input"
                type="text"
                @blur="void submitRename(entry)"
                @click.stop
                @dblclick.stop
                @keydown.enter.prevent="void submitRename(entry)"
                @keydown.esc.prevent="cancelRename()"
              />
              <span v-else class="remote-entry-name">{{ entry.name }}</span>
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
