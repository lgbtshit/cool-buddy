<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from 'xterm'
import 'xterm/css/xterm.css'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppCopy } from '../../composables/use-app-copy'
import InspectorSidebar from '../../components/inspector-sidebar/InspectorSidebar.vue'
import LogPanel from '../../components/log-panel/LogPanel.vue'
import PasteConfirmModal from '../../components/paste-confirm-modal/PasteConfirmModal.vue'
import SessionModal from '../../components/session-modal/SessionModal.vue'
import SessionSidebar from '../../components/session-sidebar/SessionSidebar.vue'
import TerminalPanel from '../../components/terminal-panel/TerminalPanel.vue'
import TopBar from '../../components/top-bar/TopBar.vue'
import { useSshConsoleStore } from '../../stores/ssh-console'

const store = useSshConsoleStore()
const { activeSession, connectionLabel } = storeToRefs(store)
const { t } = useAppCopy()

const terminalPanelRef = ref<InstanceType<typeof TerminalPanel> | null>(null)
const pasteConfirmOpen = ref(false)
const pendingPasteContent = ref('')

const terminal = new Terminal({
  cursorBlink: true,
  fontFamily: '"JetBrains Mono", "Cascadia Mono", "Consolas", monospace',
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
})
const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)

let removeDataListener: (() => void) | null = null
let removeStatusListener: (() => void) | null = null
let removeTerminalInput: { dispose: () => void } | null = null
let resizeObserver: ResizeObserver | null = null

const logLines = computed(() => [
  '2023/10/24 16:45:12 [error] 1423#0: *12435 connect() failed (111: Connection refused) while connecting to upstream...',
  '2023/10/24 16:45:14 [error] 1423#0: *12437 connect() failed (111: Connection refused) while connecting to upstream...',
  '2023/10/24 16:45:20 [info] Agent 01 detected upstream failure. Attempting restart cycle...'
])

const terminalSessionName = computed(() => activeSession.value?.name ?? '--')
const isMacOS = navigator.userAgent.toLowerCase().includes('mac')

function writeSystemLine(message: string) {
  terminal.writeln(`\r\n${message}\r\n`)
}

async function copySelection() {
  const selection = terminal.getSelection()
  if (!selection) return

  await navigator.clipboard.writeText(selection)
}

async function pasteClipboard() {
  const clipboardText = await navigator.clipboard.readText()
  if (!clipboardText) return

  if (/[\r\n]/.test(clipboardText)) {
    pendingPasteContent.value = clipboardText
    pasteConfirmOpen.value = true
    return
  }

  terminal.paste(clipboardText)
}

function closePasteConfirm() {
  pasteConfirmOpen.value = false
  pendingPasteContent.value = ''
  terminal.focus()
}

function executeAllPaste() {
  terminal.paste(pendingPasteContent.value)
  closePasteConfirm()
}

async function executeLineByLinePaste() {
  const content = pendingPasteContent.value
  closePasteConfirm()

  try {
    await window.api.ssh.executeCommandBatch({ content })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Batch execution failed.'
    writeSystemLine(message)
  }
}

function getTerminalHost() {
  return terminalPanelRef.value?.terminalHostEl ?? null
}

function syncTerminalSize() {
  const terminalHost = getTerminalHost()
  if (!terminalHost) return
  fitAddon.fit()
  window.api.ssh.resize({ cols: terminal.cols, rows: terminal.rows })
}

function handleGlobalClick() {
  store.closeTabMenu()
}

onMounted(() => {
  const terminalHost = getTerminalHost()
  if (!terminalHost) return

  terminal.open(terminalHost)
  fitAddon.fit()
  terminal.focus()
  terminal.attachCustomKeyEventHandler((event) => {
    const modifierPressed = isMacOS ? event.metaKey : event.ctrlKey
    const key = event.key.toLowerCase()

    if (!modifierPressed || !event.shiftKey) {
      return true
    }

    if (key === 'c') {
      event.preventDefault()
      void copySelection()
      return false
    }

    if (key === 'v') {
      event.preventDefault()
      void pasteClipboard()
      return false
    }

    return true
  })

  writeSystemLine(t('readyBanner'))
  writeSystemLine(t('terminalIdle'))
  void store.loadSessions({ connectLastSession: true })

  removeTerminalInput = terminal.onData((data) => {
    window.api.ssh.input(data)
  })

  removeDataListener = window.api.ssh.onData((data) => {
    terminal.write(data)
  })

  removeStatusListener = window.api.ssh.onStatus((payload) => {
    store.setStatus(payload)

    if (payload.status === 'connected') {
      syncTerminalSize()
      terminal.focus()
    }

    writeSystemLine(`[${payload.status}] ${payload.message}`)
  })

  resizeObserver = new ResizeObserver(() => {
    syncTerminalSize()
  })
  resizeObserver.observe(terminalHost)

  window.addEventListener('click', handleGlobalClick)
})

onBeforeUnmount(() => {
  store.stopMetricsRefresh()
  removeDataListener?.()
  removeStatusListener?.()
  removeTerminalInput?.dispose()
  resizeObserver?.disconnect()
  window.removeEventListener('click', handleGlobalClick)
  terminal.dispose()
})
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
            :cols="terminal.cols"
            :connection-label="connectionLabel"
            :rows="terminal.rows"
            :session-name="terminalSessionName"
            :title="t('terminalTitle')"
          />

          <LogPanel
            :auto-pause-off="t('autoPauseOff')"
            :log-lines="logLines"
            :log-title="t('logTitle')"
            :waiting-events="t('waitingEvents')"
          />
        </section>

        <InspectorSidebar />
      </div>
    </section>

    <footer class="status-footer">
      <span>{{ t('footerConnection') }} | {{ t('latency') }}: 24ms</span>
      <div class="footer-actions">
        <button>{{ t('keyBindings') }}</button>
        <button>{{ t('quickActions') }}</button>
        <button>{{ t('terminalSettings') }}</button>
      </div>
    </footer>

    <SessionModal />
    <PasteConfirmModal
      :content="pendingPasteContent"
      :open="pasteConfirmOpen"
      @close="closePasteConfirm"
      @execute-all="executeAllPaste"
      @execute-line-by-line="executeLineByLinePaste"
    />
  </main>
</template>
