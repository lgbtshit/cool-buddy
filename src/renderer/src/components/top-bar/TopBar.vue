<script setup lang="ts">
import {
  Circle,
  Grid2x2,
  History,
  Languages,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Server,
  Database,
  HardDrive,
  X
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useAppCopy } from '../../composables/use-app-copy'
import { useSshConsoleStore } from '../../stores/ssh-console'
import type { SessionItem } from '../../types/ssh-console'

const store = useSshConsoleStore()
const { activeSessionId, latencyLabel, openTabs, status, tabMenu } = storeToRefs(store)
const { localeLabel, t } = useAppCopy()

const iconMap = {
  server: Server,
  database: Database,
  hardDrive: HardDrive
}

const handleConnect = async (session: SessionItem) => {
  await store.connectToSession(session)
}

const handleContextMenu = (event: MouseEvent, sessionId: string) => {
  event.preventDefault()
  event.stopPropagation()
  store.openTabMenuAt({
    sessionId,
    x: event.clientX,
    y: event.clientY
  })
}
</script>

<template>
  <header class="topbar">
    <div class="tab-strip">
      <button
        v-for="session in openTabs"
        :key="session.id"
        class="top-tab"
        :class="{ active: session.id === activeSessionId }"
        @click="void handleConnect(session)"
        @contextmenu="handleContextMenu($event, session.id)"
      >
        <component :is="iconMap[session.icon]" :size="14" />
        <span>{{ session.name }}</span>
      </button>

      <button class="icon-btn" @click="store.openSessionModal()"><Plus :size="16" /></button>

      <div
        v-if="tabMenu"
        class="tab-context-menu"
        :style="{ left: `${tabMenu.x}px`, top: `${tabMenu.y}px` }"
        @click.stop
      >
        <button class="tab-context-item" @click="store.removeTab(tabMenu.sessionId)">
          <MoreHorizontal :size="14" />
          <span>{{ t('removeTab') }}</span>
        </button>
      </div>
    </div>

    <div class="topbar-actions">
      <div class="connection-pill">
        <Circle :size="10" class="pulse-dot" />
        <span>{{ latencyLabel }}</span>
      </div>
      <button class="icon-btn"><Grid2x2 :size="16" /></button>
      <button class="icon-btn"><LayoutGrid :size="16" /></button>
      <button class="icon-btn"><History :size="16" /></button>
      <button class="icon-btn" :disabled="status !== 'connected'" @click="store.disconnect()">
        <X :size="15" />
      </button>
      <button class="locale-btn" @click="store.toggleLocale()">
        <Languages :size="15" />
        <span>{{ localeLabel }}</span>
      </button>
      <button class="primary-split">{{ t('splitPane') }}</button>
    </div>
  </header>
</template>
