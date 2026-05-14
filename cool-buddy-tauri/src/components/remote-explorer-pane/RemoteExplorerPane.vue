<script setup lang="ts">
import { ElInput } from 'element-plus';
import type { InputInstance } from 'element-plus';
import 'element-plus/es/components/input/style/css';
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue';
import { useSshConsoleStore } from '../../stores/ssh-console';
import type { RemoteEntry } from '../../types/ssh-console';

type DroppedRemoteFile = {
  file: File;
  relativePath: string;
};

type DroppedRemotePayload = {
  directories: string[];
  files: DroppedRemoteFile[];
};

type BrowserDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

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

const explorerPaneRef = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dropActive = ref(false);
const pathInput = ref('');
const selectedEntryPaths = ref<string[]>([]);
const selectionAnchorPath = ref('');
const editingEntryPath = ref('');
const editingName = ref('');
const createEntryDialogOpen = ref(false);
const createEntryKind = ref<'directory' | 'file'>('directory');
const createEntryName = ref('');
const deleteDialogOpen = ref(false);
const deleteTargetPaths = ref<string[]>([]);
const deleteTargetLabel = ref('');
const contextMenuOpen = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const renamingEntryPath = ref('');
const createEntryInput = ref<InputInstance | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);
const renameInput = ref<InputInstance | null>(null);
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
    selectedEntryPaths.value = [];
    selectionAnchorPath.value = '';
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

function isEntrySelected(path: string) {
  return selectedEntryPaths.value.includes(path);
}

function isEntryExclusivelySelected(path: string) {
  return selectedEntryPaths.value.length === 1 && selectedEntryPaths.value[0] === path;
}

function clearEntrySelection() {
  selectedEntryPaths.value = [];
  selectionAnchorPath.value = '';
}

function openCreateEntryDialog(kind: 'directory' | 'file' = 'directory') {
  closeContextMenu();
  createEntryKind.value = kind;
  createEntryName.value = '';
  createEntryDialogOpen.value = true;
  nextTick(() => {
    createEntryInput.value?.focus();
  });
}

function closeCreateEntryDialog() {
  createEntryDialogOpen.value = false;
  createEntryName.value = '';
}

function openDeleteDialog(paths: string[], label: string) {
  if (!paths.length) {
    return;
  }

  closeContextMenu();
  deleteTargetPaths.value = [...paths];
  deleteTargetLabel.value = label;
  deleteDialogOpen.value = true;
}

function closeDeleteDialog() {
  deleteDialogOpen.value = false;
  deleteTargetPaths.value = [];
  deleteTargetLabel.value = '';
}

function closeContextMenu() {
  contextMenuOpen.value = false;
}

function openContextMenu(event: MouseEvent) {
  event.preventDefault();
  closeContextMenu();
  clearEntrySelection();
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  contextMenuOpen.value = true;

  nextTick(() => {
    const menu = contextMenuRef.value;
    if (!menu) {
      return;
    }

    const rect = menu.getBoundingClientRect();
    const padding = 12;
    if (rect.right > window.innerWidth - padding) {
      contextMenuX.value = Math.max(padding, window.innerWidth - rect.width - padding);
    }
    if (rect.bottom > window.innerHeight - padding) {
      contextMenuY.value = Math.max(padding, window.innerHeight - rect.height - padding);
    }
  });
}

function selectSingleEntry(path: string) {
  selectedEntryPaths.value = [path];
  selectionAnchorPath.value = path;
}

function toggleEntrySelection(path: string) {
  if (isEntrySelected(path)) {
    selectedEntryPaths.value = selectedEntryPaths.value.filter((value) => value !== path);
  } else {
    selectedEntryPaths.value = [...selectedEntryPaths.value, path];
  }

  selectionAnchorPath.value = path;
}

function selectEntryRange(path: string) {
  const anchorPath = selectionAnchorPath.value || path;
  const startIndex = visibleEntries.value.findIndex((entry) => entry.path === anchorPath);
  const endIndex = visibleEntries.value.findIndex((entry) => entry.path === path);

  if (startIndex < 0 || endIndex < 0) {
    selectSingleEntry(path);
    return;
  }

  const [rangeStart, rangeEnd] =
    startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  selectedEntryPaths.value = visibleEntries.value
    .slice(rangeStart, rangeEnd + 1)
    .map((entry) => entry.path);
}

function updateEntrySelection(entry: RemoteEntry, event?: MouseEvent) {
  const useRangeSelection = Boolean(event?.shiftKey);
  const useToggleSelection = Boolean(event && (event.ctrlKey || event.metaKey));

  if (useRangeSelection) {
    selectEntryRange(entry.path);
    return;
  }

  if (useToggleSelection) {
    toggleEntrySelection(entry.path);
    return;
  }

  selectSingleEntry(entry.path);
}

async function openEntry(entry: RemoteEntry) {
  selectSingleEntry(entry.path);
  editingEntryPath.value = '';
  await store.openRemoteEntry(entry);
}

function triggerUploadPicker() {
  fileInput.value?.click();
}

/**
 * 读取目录条目的全部直接子项，兼容分批返回的浏览器实现。
 * @param directoryEntry 浏览器目录条目
 * @return Promise<BrowserFileSystemEntry[]> 目录下的直接子项列表
 */
async function readDirectoryEntries(
  directoryEntry: FileSystemDirectoryEntry
): Promise<FileSystemEntry[]> {
  const reader = directoryEntry.createReader();
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      break;
    }

    entries.push(...batch);
  }

  return entries;
}

/**
 * 递归收集拖拽进来的文件系统条目，并记录目录路径和文件相对路径。
 * @param entry 浏览器文件系统条目
 * @param basePath 父级相对路径前缀
 * @return Promise<DroppedRemotePayload> 目录列表与文件列表
 */
async function collectDroppedFiles(
  entry: FileSystemEntry,
  basePath = ''
): Promise<DroppedRemotePayload> {
  const nextPath = basePath ? `${basePath}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });

    return {
      directories: [],
      files: [
        {
          file,
          relativePath: nextPath
        }
      ]
    };
  }

  if (!entry.isDirectory) {
    return {
      directories: [],
      files: []
    };
  }

  const directories = [nextPath];
  const files: DroppedRemoteFile[] = [];
  const directoryEntry = entry as FileSystemDirectoryEntry;
  const children = await readDirectoryEntries(directoryEntry);

  for (const child of children) {
    const childPayload = await collectDroppedFiles(child, nextPath);
    directories.push(...childPayload.directories);
    files.push(...childPayload.files);
  }

  return {
    directories,
    files
  };
}

/**
 * 从拖拽事件中提取所有待上传文件，支持普通文件与文件夹混合拖入。
 * @param event 拖拽放下事件
 * @return Promise<DroppedRemotePayload> 目录列表与文件列表
 */
async function extractDroppedFiles(event: DragEvent): Promise<DroppedRemotePayload> {
  const transferItems = Array.from(event.dataTransfer?.items ?? []) as BrowserDataTransferItem[];
  const transferFiles = Array.from(event.dataTransfer?.files ?? []);
  const droppedDirectories: string[] = [];
  const droppedFiles: DroppedRemoteFile[] = [];

  console.log('[remote-upload] extractDroppedFiles:start', {
    itemCount: transferItems.length,
    fileCount: transferFiles.length
  });

  if (transferItems.length > 0) {
    for (const item of transferItems) {
      const entry = item.webkitGetAsEntry?.() ?? null;

      if (entry) {
        console.log('[remote-upload] extractDroppedFiles:item-entry', {
          kind: item.kind,
          name: entry.name,
          fullPath: entry.fullPath,
          isFile: entry.isFile,
          isDirectory: entry.isDirectory
        });
        const payload = await collectDroppedFiles(entry);
        droppedDirectories.push(...payload.directories);
        droppedFiles.push(...payload.files);
        continue;
      }

      const file = item.getAsFile();
      if (file) {
        console.log('[remote-upload] extractDroppedFiles:item-file-fallback', {
          kind: item.kind,
          name: file.name,
          size: file.size
        });
        droppedFiles.push({
          file,
          relativePath: file.name
        });
        continue;
      }

      console.warn('[remote-upload] extractDroppedFiles:item-unresolved', {
        kind: item.kind,
        type: item.type
      });
    }
  } else {
    for (const file of transferFiles) {
      droppedFiles.push({
        file,
        relativePath: file.name
      });
    }
  }

  console.log('[remote-upload] extractDroppedFiles:done', {
    directoryCount: droppedDirectories.length,
    directories: droppedDirectories,
    fileCount: droppedFiles.length,
    files: droppedFiles.map((item) => item.relativePath)
  });

  return {
    directories: droppedDirectories,
    files: droppedFiles
  };
}

/**
 * 处理文件选择器选中的普通文件上传。
 * @param event 文件输入事件
 * @return Promise<void> 无返回
 */
async function handleFileSelection(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []);
  if (files.length > 0) {
    await store.uploadRemoteFiles(files);
  }

  (event.target as HTMLInputElement).value = '';
}

/**
 * 处理拖拽上传，支持目录递归展开后再上传。
 * @param event 拖拽放下事件
 * @return Promise<void> 无返回
 */
async function handleDrop(event: DragEvent) {
  event.preventDefault();
  dropActive.value = false;

  try {
    const payload = await extractDroppedFiles(event);
    console.log('[remote-upload] handleDrop:resolved', {
      directoryCount: payload.directories.length,
      fileCount: payload.files.length
    });
    if (payload.files.length > 0 || payload.directories.length > 0) {
      await store.uploadRemoteItems(payload);
      return;
    }

    console.warn('No files or directories were found in the dropped items.');
  } catch (error) {
    console.error('Failed to handle dropped remote upload items.', error);
    throw error;
  }
}

async function handleCreateDirectory() {
  openCreateEntryDialog('directory');
}

async function submitCreateEntry() {
  const nextName = createEntryName.value.trim();
  if (!nextName) {
    return;
  }

  if (createEntryKind.value === 'directory') {
    await store.createRemoteDirectory(nextName);
  } else {
    await store.createRemoteFile(nextName);
  }

  if (!explorerError.value) {
    closeCreateEntryDialog();
  }
}

async function handleRename(entry: RemoteEntry) {
  selectSingleEntry(entry.path);
  editingEntryPath.value = entry.path;
  editingName.value = entry.name;
  await nextTick();
  const input = renameInput.value;
  if (!input) return;

  input.focus?.();
  input.input?.focus();
  const extensionIndex =
    entry.kind === 'file' && entry.name.includes('.') ? entry.name.lastIndexOf('.') : -1;
  const selectionEnd = extensionIndex > 0 ? extensionIndex : entry.name.length;
  input.input?.setSelectionRange(0, selectionEnd);
}

async function handleDelete(entry: RemoteEntry) {
  openDeleteDialog([entry.path], entry.name);
}

async function submitDeleteEntries() {
  const targetPaths = [...deleteTargetPaths.value];
  if (!targetPaths.length) {
    return;
  }

  for (const path of targetPaths) {
    await store.deleteRemoteEntry(path);
  }

  clearEntrySelection();
  closeDeleteDialog();
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

  updateEntrySelection(entry, event);
}

async function handleEntryNameClick(entry: RemoteEntry, event: MouseEvent) {
  if (editingEntryPath.value === entry.path || renamingEntryPath.value === entry.path) {
    return;
  }

  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    updateEntrySelection(entry, event);
    return;
  }

  if (!isEntryExclusivelySelected(entry.path)) {
    selectSingleEntry(entry.path);
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
    clearEntrySelection();
  } finally {
    renamingEntryPath.value = '';
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (contextMenuOpen.value && !target.closest('.remote-context-menu')) {
    closeContextMenu();
  }

  if (explorerPaneRef.value?.contains(target)) {
    return;
  }

  clearEntrySelection();
}

function handleWindowKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Delete') {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }

  if (editingEntryPath.value || createEntryDialogOpen.value || deleteDialogOpen.value) {
    return;
  }

  if (!selectedEntryPaths.value.length || explorerBusy.value) {
    return;
  }

  event.preventDefault();
  const label =
    selectedEntryPaths.value.length === 1
      ? visibleEntries.value.find((entry) => entry.path === selectedEntryPaths.value[0])?.name ??
        selectedEntryPaths.value[0]
      : `已选中的 ${selectedEntryPaths.value.length} 个项目`;
  openDeleteDialog(selectedEntryPaths.value, label);
}

onMounted(() => {
  window.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('keydown', handleWindowKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('keydown', handleWindowKeyDown);
});
</script>

<template>
  <div
    ref="explorerPaneRef"
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
          <ElInput
            v-model="pathInput"
            class="remote-path-input"
            :disabled="explorerLoading || explorerBusy"
            :placeholder="t('remotePathPlaceholder')"
            @input="resetPathCompletionState()"
            @keydown.enter.prevent="void submitPath()"
            @keydown.tab.prevent="void handlePathTabComplete()"
          />
          <button
            type="button"
            class="mini-icon-btn remote-path-up-btn"
            :disabled="!canGoToParentDirectory || explorerLoading || explorerBusy"
            @click="void goToParentDirectory()"
          >
            <ArrowUp :size="14" />
          </button>
        </form>
      </div>

      <div class="remote-explorer-scroll" @contextmenu="openContextMenu">
        <div v-if="explorerError" class="remote-explorer-error">{{ explorerError }}</div>

        <div v-if="explorerLoading" class="empty-state compact">{{ t('loadingRemoteFiles') }}</div>

        <div v-else-if="visibleEntries.length" class="remote-entry-list">
          <button
            v-for="entry in visibleEntries"
            :key="entry.path"
            class="remote-entry-row"
            :class="{ 'is-selected': isEntrySelected(entry.path) }"
            @click="handleEntryClick(entry, $event)"
            @dblclick="void openEntry(entry)"
          >
            <div class="remote-entry-main">
              <component :is="entry.kind === 'directory' ? FolderOpen : FileText" :size="15" />
              <ElInput
                v-if="editingEntryPath === entry.path"
                ref="renameInput"
                v-model="editingName"
                class="remote-entry-rename-input"
                @blur="void submitRename(entry)"
                @click.stop
                @dblclick.stop
                @keydown.enter.prevent="void submitRename(entry)"
                @keydown.esc.prevent="cancelRename()"
              />
              <button
                v-else
                class="remote-entry-name"
                :class="{ 'is-selected': isEntrySelected(entry.path) }"
                @click.stop="void handleEntryNameClick(entry, $event)"
                @dblclick.stop="void openEntry(entry)"
              >
                {{ entry.name }}
              </button>
            </div>
            <div class="remote-entry-actions">
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

  <Teleport to="body">
    <div
      v-if="contextMenuOpen"
      ref="contextMenuRef"
      class="remote-context-menu"
      :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
    >
      <button class="remote-context-menu-item" @click="openCreateEntryDialog('file')">
        <FileText :size="14" />
        <span>新建文件</span>
      </button>
      <button class="remote-context-menu-item" @click="openCreateEntryDialog('directory')">
        <FolderOpen :size="14" />
        <span>新建文件夹</span>
      </button>
    </div>

    <div
      v-if="createEntryDialogOpen"
      class="remote-create-overlay"
      @click.self="closeCreateEntryDialog()"
    >
      <section class="remote-create-dialog" role="dialog" aria-modal="true" aria-label="新建项目">
        <div class="remote-create-header">
          <span class="remote-create-eyebrow">REMOTE EXPLORER</span>
          <h3 class="remote-create-title">
            {{ createEntryKind === 'directory' ? '新建文件夹' : '新建文件' }}
          </h3>
          <p class="remote-create-copy">在当前目录中创建一个新的{{ createEntryKind === 'directory' ? '文件夹' : '文件' }}。</p>
        </div>

        <div class="remote-create-kind-switch" role="tablist" aria-label="Create entry type">
          <button
            type="button"
            class="remote-create-kind-btn"
            :class="{ 'is-active': createEntryKind === 'directory' }"
            @click="createEntryKind = 'directory'"
          >
            <FolderOpen :size="14" />
            <span>文件夹</span>
          </button>
          <button
            type="button"
            class="remote-create-kind-btn"
            :class="{ 'is-active': createEntryKind === 'file' }"
            @click="createEntryKind = 'file'"
          >
            <FileText :size="14" />
            <span>文件</span>
          </button>
        </div>

        <form class="remote-create-form" @submit.prevent="void submitCreateEntry()">
          <label class="remote-create-label" for="remote-create-name">名称</label>
          <ElInput
            id="remote-create-name"
            ref="createEntryInput"
            v-model="createEntryName"
            class="remote-create-input"
            :placeholder="createEntryKind === 'directory' ? '例如 assets' : '例如 README.md'"
            @keydown.esc.prevent="closeCreateEntryDialog()"
          />
          <div class="remote-create-actions">
            <button type="button" class="remote-create-secondary" @click="closeCreateEntryDialog()">
              取消
            </button>
            <button
              type="submit"
              class="remote-create-primary"
              :disabled="!createEntryName.trim() || explorerBusy"
            >
              {{ createEntryKind === 'directory' ? '创建文件夹' : '创建文件' }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <div
      v-if="deleteDialogOpen"
      class="remote-create-overlay"
      @click.self="closeDeleteDialog()"
    >
      <section class="remote-create-dialog remote-delete-dialog" role="dialog" aria-modal="true">
        <div class="remote-create-header">
          <span class="remote-create-eyebrow">REMOTE EXPLORER</span>
          <h3 class="remote-create-title">确认删除</h3>
          <p class="remote-create-copy">
            {{ deleteTargetPaths.length > 1 ? '将删除这些项目：' : '将删除这个项目：' }}
            <span class="remote-delete-label">{{ deleteTargetLabel }}</span>
          </p>
        </div>

        <div class="remote-create-actions remote-delete-actions">
          <button type="button" class="remote-create-secondary" @click="closeDeleteDialog()">
            取消
          </button>
          <button
            type="button"
            class="remote-create-primary remote-delete-primary"
            :disabled="explorerBusy"
            @click="void submitDeleteEntries()"
          >
            {{ deleteTargetPaths.length > 1 ? '删除所选项目' : '删除' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
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

.remote-create-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(5, 7, 9, 0.76);
  backdrop-filter: blur(10px);
}

.remote-create-dialog {
  width: min(100%, 380px);
  padding: 18px;
  border: 1px solid rgba(84, 100, 108, 0.28);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(20, 25, 28, 0.98), rgba(15, 18, 21, 0.98));
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.remote-create-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.remote-create-eyebrow {
  color: rgba(99, 247, 255, 0.78);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.remote-create-title {
  margin: 0;
  color: rgba(241, 245, 248, 0.96);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.15;
}

.remote-create-copy {
  margin: 0;
  color: rgba(176, 186, 194, 0.82);
  font-size: 12px;
  line-height: 1.45;
}

.remote-create-kind-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.remote-create-kind-btn {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid rgba(70, 80, 88, 0.64);
  border-radius: 6px;
  background: rgba(25, 30, 34, 0.88);
  color: rgba(197, 204, 210, 0.86);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease,
    transform 160ms ease;

  &:hover {
    border-color: rgba(99, 247, 255, 0.26);
    background: rgba(33, 39, 43, 0.96);
    color: rgba(235, 241, 246, 0.96);
  }

  &.is-active {
    border-color: rgba(99, 247, 255, 0.54);
    background: rgba(8, 39, 44, 0.96);
    color: rgba(235, 249, 250, 0.98);
    box-shadow: inset 0 0 0 1px rgba(99, 247, 255, 0.12);
  }
}

.remote-create-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.remote-create-label {
  color: rgba(191, 199, 205, 0.92);
  font-size: 12px;
  font-weight: 500;
}

.remote-create-input {
  :deep(.el-input__wrapper) {
    min-height: 38px;
    border-radius: 6px;
    background: rgba(10, 13, 15, 0.92);
    box-shadow: inset 0 0 0 1px rgba(73, 85, 92, 0.7);
  }

  :deep(.el-input__wrapper.is-focus) {
    box-shadow: inset 0 0 0 1px rgba(99, 247, 255, 0.52);
  }

  :deep(.el-input__inner) {
    color: rgba(237, 242, 245, 0.96);
    font-size: 13px;
  }
}

.remote-create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 6px;
}

.remote-create-secondary,
.remote-create-primary {
  min-width: 92px;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    opacity 160ms ease;
}

.remote-create-secondary {
  border: 1px solid rgba(76, 85, 92, 0.78);
  background: rgba(23, 28, 31, 0.9);
  color: rgba(210, 216, 221, 0.92);
}

.remote-create-primary {
  border: 1px solid rgba(71, 188, 194, 0.74);
  background: linear-gradient(180deg, rgba(18, 121, 127, 0.96), rgba(12, 91, 96, 0.96));
  color: rgba(240, 251, 252, 0.98);

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
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

.remote-context-menu {
  position: fixed;
  z-index: 1990;
  display: flex;
  min-width: 154px;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgba(74, 88, 95, 0.56);
  border-radius: 8px;
  background: rgba(15, 19, 22, 0.98);
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.remote-context-menu-item {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(224, 230, 234, 0.92);
  font-size: 12px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(0, 220, 229, 0.1);
    color: rgba(241, 248, 250, 0.98);
  }
}

.remote-delete-dialog {
  width: min(100%, 360px);
}

.remote-delete-label {
  display: inline-block;
  margin-top: 4px;
  color: rgba(236, 240, 244, 0.96);
  word-break: break-all;
}

.remote-delete-actions {
  padding-top: 2px;
}

.remote-delete-primary {
  border-color: rgba(202, 95, 95, 0.74);
  background: linear-gradient(180deg, rgba(144, 49, 49, 0.96), rgba(116, 37, 37, 0.96));
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
  align-items: center;
  gap: 8px;
}

.remote-path-input {
  flex: 1;

  :deep(.el-input__wrapper) {
    min-height: 36px;
    border-radius: 4px;
    background: rgba(14, 14, 17, 0.72);
  }
}

.remote-path-up-btn {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  align-self: center;
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
  outline: none;

  &:hover {
    background: rgba(53, 52, 56, 0.62);
  }

  &:focus,
  &:focus-visible {
    outline: none;
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
  outline: none;

  &:focus,
  &:focus-visible {
    outline: none;
  }

  &.is-selected:hover {
    color: var(--cyan-soft);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}

.remote-entry-rename-input {
  width: 100%;
  min-width: 0;

  :deep(.el-input__wrapper) {
    min-height: 26px;
    padding: 0 8px;
    border-radius: 4px;
    background: rgba(14, 14, 17, 0.82);
    box-shadow: inset 0 0 0 1px rgba(99, 247, 255, 0.32);
  }

  :deep(.el-input__inner) {
    font-size: 12px;
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
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
