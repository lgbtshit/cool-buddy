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
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const tabStripRef = ref<HTMLElement | null>(null)
const tabMenuRef = ref<HTMLElement | null>(null)
const tabMenuStyle = ref({ left: '0px', top: '0px' })
const MENU_GAP_PX = 6
const VIEWPORT_PADDING_PX = 8

const handleConnect = async (session: SessionItem) => {
  await store.connectToSession(session)
}

const updateTabMenuPosition = () => {
  if (!tabMenu.value || !tabStripRef.value || !tabMenuRef.value) return

  const stripRect = tabStripRef.value.getBoundingClientRect()
  const menuRect = tabMenuRef.value.getBoundingClientRect()
  const maxLeft = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerWidth - stripRect.left - menuRect.width - VIEWPORT_PADDING_PX
  )
  const maxTop = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerHeight - stripRect.top - menuRect.height - VIEWPORT_PADDING_PX
  )

  let left = Math.min(tabMenu.value.x, maxLeft)
  let top = Math.min(tabMenu.value.y, maxTop)

  if (top < VIEWPORT_PADDING_PX) {
    top = Math.max(VIEWPORT_PADDING_PX, tabMenu.value.y - menuRect.height - MENU_GAP_PX)
  }

  tabMenuStyle.value = {
    left: `${Math.max(VIEWPORT_PADDING_PX, left)}px`,
    top: `${Math.max(VIEWPORT_PADDING_PX, top)}px`
  }
}

const handleContextMenu = (event: MouseEvent, sessionId: string) => {
  event.preventDefault()
  event.stopPropagation()

  const stripRect = tabStripRef.value?.getBoundingClientRect()
  store.openTabMenuAt({
    sessionId,
    x: stripRect ? event.clientX - stripRect.left : event.clientX,
    y: stripRect ? event.clientY - stripRect.top + MENU_GAP_PX : event.clientY
  })
  void nextTick(updateTabMenuPosition)
}

watch(tabMenu, (value) => {
  if (!value) return
  void nextTick(updateTabMenuPosition)
})

onMounted(() => {
  window.addEventListener('resize', updateTabMenuPosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateTabMenuPosition)
})
</script>

<template>
  <header class="topbar">
    <div ref="tabStripRef" class="tab-strip">
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
        ref="tabMenuRef"
        class="tab-context-menu"
        :style="tabMenuStyle"
        @click.stop
      >
        <button class="tab-context-item" @click="store.removeTab(tabMenu.sessionId)">
          <MoreHorizontal :size="10" />
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
    </div>
  </header>
</template>
