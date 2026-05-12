<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppCopy } from '../../composables/use-app-copy';
import InspectorSidebar from '../../components/inspector-sidebar/InspectorSidebar.vue';
import KeybindingsModal from '../../components/keybindings-modal/KeybindingsModal.vue';
import LogAlertModal from '../../components/log-alert-modal/LogAlertModal.vue';
import LogPanel from '../../components/log-panel/LogPanel.vue';
import LogSettingsModal from '../../components/log-settings-modal/LogSettingsModal.vue';
import PasteConfirmModal from '../../components/paste-confirm-modal/PasteConfirmModal.vue';
import SessionModal from '../../components/session-modal/SessionModal.vue';
import SessionSidebar from '../../components/session-sidebar/SessionSidebar.vue';
import TerminalSettingsModal from '../../components/terminal-settings-modal/TerminalSettingsModal.vue';
import TerminalPanel from '../../components/terminal-panel/TerminalPanel.vue';
import TopBar from '../../components/top-bar/TopBar.vue';
import { useSshConsoleStore } from '../../stores/ssh-console';

const store = useSshConsoleStore();
const {
  activeSessionId,
  activeSession,
  connectionLabel,
  latencyLabel,
  isConnected,
  remoteDirectory,
  logTailError,
  logTailLineLimit,
  logTailLines,
  logTailPath,
  logTailState,
  canStartLogTail
} = storeToRefs(store);
const { t } = useAppCopy();

const terminalPanelRef = ref<InstanceType<typeof TerminalPanel> | null>(null);
const pasteConfirmOpen = ref(false);
const keybindingsOpen = ref(false);
const logAlertMessage = ref('');
const logAlertOpen = ref(false);
const logSettingsDraft = ref(50);
const logSettingsOpen = ref(false);
const pendingPasteContent = ref('');

const terminal = new Terminal({
  cursorBlink: true,
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 12,
  lineHeight: 1.2,
  letterSpacing: 0,
  theme: {
    background: '#16161a',
    foreground: '#e4e1e6',
    cursor: '#00f5ff',
    cursorAccent: '#131316',
    selectionBackground: 'rgba(0, 245, 255, 0.16)',
    black: '#0e0e11',
    red: '#ff7b72',
    green: '#69f6b9',
    yellow: '#f3c969',
    blue: '#63f7ff',
    magenta: '#ddb7ff',
    cyan: '#00dce5',
    white: '#e4e1e6',
    brightBlack: '#39393c',
    brightRed: '#ffb4ab',
    brightGreen: '#8df5c8',
    brightYellow: '#f7d98e',
    brightBlue: '#88f9ff',
    brightMagenta: '#f0dbff',
    brightCyan: '#8cfbff',
    brightWhite: '#ffffff'
  }
});
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

let removeDataListener: (() => void) | null = null;
let removeLogDataListener: (() => void) | null = null;
let removeLogStatusListener: (() => void) | null = null;
let removeStatusListener: (() => void) | null = null;
let removeAgentEventListener: (() => void) | null = null;
let removeTerminalInput: { dispose: () => void } | null = null;
let resizeObserver: ResizeObserver | null = null;

const terminalSessionName = computed(() => activeSession.value?.name ?? '--');
const isMacOS = navigator.userAgent.toLowerCase().includes('mac');
const hasActiveSession = computed(() => Boolean(activeSession.value));
const footerSessionMeta = computed(() => {
  if (!activeSession.value) return '';
  return `${activeSession.value.host}:${activeSession.value.port} | ${latencyLabel.value}`;
});

async function copySelection() {
  const selection = terminal.getSelection();
  if (!selection) return;

  await navigator.clipboard.writeText(selection);
}

async function pasteClipboard() {
  const clipboardText = await navigator.clipboard.readText();
  if (!clipboardText) return;

  if (/[\r\n]/.test(clipboardText)) {
    pendingPasteContent.value = clipboardText;
    pasteConfirmOpen.value = true;
    return;
  }

  terminal.paste(clipboardText);
}

function closePasteConfirm() {
  pasteConfirmOpen.value = false;
  pendingPasteContent.value = '';
  terminal.focus();
}

function closeKeybindingsModal() {
  keybindingsOpen.value = false;
}

function openLogSettingsModal() {
  logSettingsDraft.value = logTailLineLimit.value;
  logSettingsOpen.value = true;
}

function closeLogSettingsModal() {
  logSettingsOpen.value = false;
}

function saveLogSettings() {
  store.setLogTailLineLimit(logSettingsDraft.value);
  logSettingsOpen.value = false;
}

function closeLogAlertModal() {
  logAlertOpen.value = false;
  logAlertMessage.value = '';
}

async function handleStartLogTail() {
  try {
    await store.startLogTail();
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : t('logInvalidFileMessage');
    logAlertMessage.value = message || t('logInvalidFileMessage');
    logAlertOpen.value = true;
  }
}

function executeAllPaste() {
  terminal.paste(pendingPasteContent.value);
  closePasteConfirm();
}

async function executeLineByLinePaste() {
  const content = pendingPasteContent.value;
  closePasteConfirm();

  try {
    await window.api.ssh.executeCommandBatch({ content });
  } catch (error) {
    console.error('Batch execution failed.', error);
  }
}

function getTerminalHost() {
  return terminalPanelRef.value?.terminalHostEl ?? null;
}

function syncTerminalSize() {
  const terminalHost = getTerminalHost();
  if (!terminalHost) return;
  fitAddon.fit();
  window.api.ssh.resize({ cols: terminal.cols, rows: terminal.rows });
}

function handleGlobalClick() {
  store.closeTabMenu();
}

onMounted(() => {
  const terminalHost = getTerminalHost();
  if (!terminalHost) return;

  terminal.open(terminalHost);
  fitAddon.fit();
  terminal.focus();
  terminal.attachCustomKeyEventHandler((event) => {
    const modifierPressed = isMacOS ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();

    if (!modifierPressed || !event.shiftKey) {
      return true;
    }

    if (key === 'c') {
      event.preventDefault();
      void copySelection();
      return false;
    }

    if (key === 'v') {
      event.preventDefault();
      void pasteClipboard();
      return false;
    }

    return true;
  });

  void store.loadSessions({ connectLastSession: true });

  removeTerminalInput = terminal.onData((data) => {
    window.api.ssh.input(data);
  });

  removeDataListener = window.api.ssh.onData((data) => {
    terminal.write(data);
  });

  removeLogDataListener = window.api.ssh.onLogData((data) => {
    store.appendLogTailChunk(data);
  });

  removeLogStatusListener = window.api.ssh.onLogStatus((payload) => {
    store.setLogTailStatus(payload);

    if (payload.status === 'error') {
      logAlertMessage.value = payload.message.trim() || t('logInvalidFileMessage');
      logAlertOpen.value = true;
    }
  });

  removeStatusListener = window.api.ssh.onStatus((payload) => {
    store.setStatus(payload);

    if (
      payload.status === 'connecting' ||
      payload.status === 'disconnected' ||
      payload.status === 'error'
    ) {
      terminal.reset();
    }

    if (payload.status === 'connected') {
      syncTerminalSize();
      terminal.focus();
    }
  });

  removeAgentEventListener = window.api.harmlessAgent.onEvent((event) => {
    if (event.type === 'terminal-output') {
      if (event.sessionId === activeSessionId.value) {
        terminal.write(event.content);
      }
      return;
    }

    store.ingestHarmlessAgentEvent(event);
  });

  resizeObserver = new ResizeObserver(() => {
    syncTerminalSize();
  });
  resizeObserver.observe(terminalHost);

  window.addEventListener('click', handleGlobalClick);
});

onBeforeUnmount(() => {
  store.stopMetricsRefresh();
  removeDataListener?.();
  removeLogDataListener?.();
  removeLogStatusListener?.();
  removeStatusListener?.();
  removeAgentEventListener?.();
  removeTerminalInput?.dispose();
  resizeObserver?.disconnect();
  window.removeEventListener('click', handleGlobalClick);
  terminal.dispose();
});
</script>

<template>
  <main class="console-shell">
    <SessionSidebar />

    <section class="main-stage">
      <TopBar />

      <div class="workspace">
        <section class="terminal-stack">
          <TerminalPanel
            ref="terminalPanelRef"
            :connection-label="connectionLabel"
            :empty-description="t('terminalIdle')"
            :has-active-session="hasActiveSession"
            :session-name="terminalSessionName"
            :title="t('terminalTitle')"
          />

          <LogPanel
            :can-start="canStartLogTail"
            :completion-base-path="remoteDirectory?.path"
            :disconnected-hint="t('logDisconnectedHint')"
            :disconnected-title="t('logDisconnectedTitle')"
            :empty-hint="t('logEmptyHint')"
            :empty-title="t('logEmptyTitle')"
            :is-connected="isConnected"
            :is-running="logTailState === 'running'"
            :log-error="logTailError"
            :log-line-limit="logTailLineLimit"
            :log-lines="logTailLines"
            :log-path="logTailPath"
            :log-settings-label="t('logSettings')"
            :log-title="t('logTitle')"
            :path-placeholder="t('logPathPlaceholder')"
            :running-label="t('logRunning')"
            :start-label="t('logStart')"
            :stop-label="t('logStop')"
            :stopped-label="t('logStopped')"
            :waiting-events="t('waitingEvents')"
            @open-settings="openLogSettingsModal"
            @path-input="store.setLogTailPath"
            @start="void handleStartLogTail()"
            @stop="void store.stopLogTail()"
          />
        </section>

        <InspectorSidebar />
      </div>
    </section>

    <footer class="status-footer">
      <span v-if="hasActiveSession">{{ footerSessionMeta }}</span>
      <div class="footer-actions">
        <button @click="keybindingsOpen = true">{{ t('keyBindings') }}</button>
        <button>{{ t('quickActions') }}</button>
        <button @click="void store.openAgentSettingsModal()">{{ t('terminalSettings') }}</button>
      </div>
    </footer>

    <SessionModal />
    <KeybindingsModal :open="keybindingsOpen" @close="closeKeybindingsModal" />
    <LogAlertModal
      :message="logAlertMessage"
      :open="logAlertOpen"
      :title="t('logInvalidFileTitle')"
      @close="closeLogAlertModal"
    />
    <LogSettingsModal
      :line-limit="logSettingsDraft"
      :max-lines="500"
      :min-lines="1"
      :open="logSettingsOpen"
      @close="closeLogSettingsModal"
      @save="saveLogSettings"
      @update:line-limit="logSettingsDraft = $event"
    />
    <TerminalSettingsModal />
    <PasteConfirmModal
      :content="pendingPasteContent"
      :open="pasteConfirmOpen"
      @close="closePasteConfirm"
      @execute-all="executeAllPaste"
      @execute-line-by-line="executeLineByLinePaste"
    />
  </main>
</template>

<style scoped lang="scss">
.console-shell {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) 32px;
  width: 100%;
  height: 100%;
}

.main-stage {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: 52px minmax(0, 1fr);
}

.workspace {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) 360px;
  background: var(--bg-low);
}

.terminal-stack {
  display: grid;
  min-height: 0;
  gap: 10px;
  padding: 10px;
  grid-template-rows: minmax(0, 1fr) 38%;
}

.status-footer {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-top: 1px solid rgba(58, 73, 74, 0.45);
  background: rgba(14, 14, 17, 0.96);
  color: rgba(228, 225, 230, 0.8);
  font-size: 12px;
}

.footer-actions {
  display: flex;
  gap: 10px;

  button {
    padding: 4px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: rgba(185, 202, 202, 0.82);
    cursor: pointer;

    &:hover {
      background: rgba(53, 52, 56, 0.55);
    }
  }
}

@media (max-width: 1500px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}

@media (max-width: 1280px) {
  .console-shell {
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .workspace {
    grid-template-columns: 1fr;
  }

  .inspector-rail {
    display: none;
  }
}
</style>
