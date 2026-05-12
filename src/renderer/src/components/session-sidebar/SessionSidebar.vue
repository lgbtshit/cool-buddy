<script setup lang="ts">
import {
  Activity,
  Database,
  MoreHorizontal,
  HardDrive,
  History,
  Plus,
  Search,
  Server,
  SquareTerminal
} from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import packageJson from '../../../../../package.json';
import { storeToRefs } from 'pinia';
import { useAppCopy } from '../../composables/use-app-copy';
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue';
import RemoteExplorerPane from '../remote-explorer-pane/RemoteExplorerPane.vue';
import SessionDeleteModal from '../session-delete-modal/SessionDeleteModal.vue';
import { useSshConsoleStore } from '../../stores/ssh-console';
import type { SessionItem } from '../../types/ssh-console';

const store = useSshConsoleStore();
const { activeSessionId, filteredSessions, searchQuery, sessionGroups, sessions, sessionsLoaded } =
  storeToRefs(store);
const { t } = useAppCopy();
const appVersion = packageJson.version;
const sessionPaneRef = ref<HTMLElement | null>(null);
const sessionMenuRef = ref<HTMLElement | null>(null);
const sessionMenu = ref<{ sessionId: string; x: number; y: number } | null>(null);
const sessionMenuStyle = ref({ left: '0px', top: '0px' });
const deleteConfirmTarget = ref<SessionItem | null>(null);
const MENU_GAP_PX = 6;
const VIEWPORT_PADDING_PX = 8;

const sessionIconMap = {
  server: Server,
  database: Database,
  hardDrive: HardDrive
};

const handleConnect = async (session: SessionItem) => {
  await store.connectToSession(session);
};

const closeSessionMenu = () => {
  sessionMenu.value = null;
};

const updateSessionMenuPosition = () => {
  if (!sessionMenu.value || !sessionPaneRef.value || !sessionMenuRef.value) return;

  const paneRect = sessionPaneRef.value.getBoundingClientRect();
  const menuRect = sessionMenuRef.value.getBoundingClientRect();
  const maxLeft = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerWidth - paneRect.left - menuRect.width - VIEWPORT_PADDING_PX
  );
  const maxTop = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerHeight - paneRect.top - menuRect.height - VIEWPORT_PADDING_PX
  );

  sessionMenuStyle.value = {
    left: `${Math.max(VIEWPORT_PADDING_PX, Math.min(sessionMenu.value.x, maxLeft))}px`,
    top: `${Math.max(VIEWPORT_PADDING_PX, Math.min(sessionMenu.value.y, maxTop))}px`
  };
};

const handleSessionContextMenu = (event: MouseEvent, session: SessionItem) => {
  event.preventDefault();
  event.stopPropagation();

  const paneRect = sessionPaneRef.value?.getBoundingClientRect();
  sessionMenu.value = {
    sessionId: session.id,
    x: paneRect ? event.clientX - paneRect.left : event.clientX,
    y: paneRect ? event.clientY - paneRect.top + MENU_GAP_PX : event.clientY
  };

  void nextTick(updateSessionMenuPosition);
};

const openDeleteConfirm = () => {
  if (!sessionMenu.value) return;
  deleteConfirmTarget.value =
    sessions.value.find((item) => item.id === sessionMenu.value?.sessionId) ?? null;
  closeSessionMenu();
};

const closeDeleteConfirm = () => {
  deleteConfirmTarget.value = null;
};

const confirmDeleteSession = async () => {
  if (!deleteConfirmTarget.value) return;
  await store.deleteSession(deleteConfirmTarget.value.id);
  closeDeleteConfirm();
};

const handleGlobalClick = () => {
  closeSessionMenu();
};

onMounted(() => {
  window.addEventListener('click', handleGlobalClick);
  window.addEventListener('resize', updateSessionMenuPosition);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick);
  window.removeEventListener('resize', updateSessionMenuPosition);
});
</script>

<template>
  <aside class="left-rail">
    <div class="brand-block">
      <div class="brand-mark">
        <SquareTerminal :size="16" />
      </div>
      <div>
        <h1>cool-buddy</h1>
        <p>{{ appVersion }}</p>
      </div>
    </div>

    <div ref="sessionPaneRef" class="session-pane">
      <div class="search-box">
        <Search :size="16" class="search-icon" />
        <input
          :value="searchQuery"
          :placeholder="t('searchSessions')"
          type="text"
          @input="store.setSearchQuery(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div v-if="!sessionsLoaded" class="empty-state compact">{{ t('loadingSessions') }}</div>

      <div v-else-if="sessions.length" class="session-groups">
        <section v-for="group in sessionGroups" :key="group.key" class="session-group">
          <header class="section-label">
            <span>{{ group.label }}</span>
            <button class="mini-icon-btn" @click="store.openSessionModal()">
              <Plus :size="14" />
            </button>
          </header>

          <button
            v-for="session in filteredSessions.filter((item) => item.group === group.key)"
            :key="session.id"
            class="session-item"
            :class="{ active: session.id === activeSessionId }"
            @click="void handleConnect(session)"
            @contextmenu="handleSessionContextMenu($event, session)"
          >
            <div class="session-main">
              <span class="session-dot" :data-state="session.status"></span>
              <component :is="sessionIconMap[session.icon]" :size="14" class="session-type" />
              <span class="session-name">{{ session.name }}</span>
            </div>
            <History v-if="session.group === 'staging'" :size="14" class="session-action" />
            <Activity
              v-else-if="session.id === activeSessionId"
              :size="14"
              class="session-action"
            />
          </button>
        </section>
      </div>

      <EmptyStatePanel
        v-else
        :description="t('noSessionsHint')"
        :icon="SquareTerminal"
        :title="t('noSessions')"
      >
        <template #actions>
          <button class="primary-btn" @click="store.openSessionModal()">
            {{ t('createFirstSession') }}
          </button>
        </template>
      </EmptyStatePanel>

      <div
        v-if="sessionMenu"
        ref="sessionMenuRef"
        class="tab-context-menu"
        :style="sessionMenuStyle"
        @click.stop
      >
        <button class="tab-context-item" @click="openDeleteConfirm">
          <MoreHorizontal :size="10" />
          <span>{{ t('deleteSessionMenu') }}</span>
        </button>
      </div>
    </div>
    <RemoteExplorerPane />
    <SessionDeleteModal
      :open="Boolean(deleteConfirmTarget)"
      :session-name="deleteConfirmTarget?.name ?? ''"
      @close="closeDeleteConfirm"
      @confirm="void confirmDeleteSession()"
    />
  </aside>
</template>
