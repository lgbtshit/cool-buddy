<script setup lang="ts">
import { ElInput } from 'element-plus';
import 'element-plus/es/components/input/style/css';
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
const leftRailRef = ref<HTMLElement | null>(null);
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
  if (!sessionMenu.value || !leftRailRef.value || !sessionMenuRef.value) return;

  const railRect = leftRailRef.value.getBoundingClientRect();
  const menuRect = sessionMenuRef.value.getBoundingClientRect();
  const maxLeft = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerWidth - railRect.left - menuRect.width - VIEWPORT_PADDING_PX
  );
  const maxTop = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerHeight - railRect.top - menuRect.height - VIEWPORT_PADDING_PX
  );

  sessionMenuStyle.value = {
    left: `${Math.max(VIEWPORT_PADDING_PX, Math.min(sessionMenu.value.x, maxLeft))}px`,
    top: `${Math.max(VIEWPORT_PADDING_PX, Math.min(sessionMenu.value.y, maxTop))}px`
  };
};

const handleSessionContextMenu = (event: MouseEvent, session: SessionItem) => {
  event.preventDefault();
  event.stopPropagation();

  const railRect = leftRailRef.value?.getBoundingClientRect();
  sessionMenu.value = {
    sessionId: session.id,
    x: railRect ? event.clientX - railRect.left : event.clientX,
    y: railRect ? event.clientY - railRect.top + MENU_GAP_PX : event.clientY
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
  <aside ref="leftRailRef" class="left-rail">
    <div class="brand-block">
      <div class="brand-mark">
        <SquareTerminal :size="16" />
      </div>
      <div>
        <h1>cool-buddy</h1>
        <p>{{ appVersion }}</p>
      </div>
    </div>

    <div class="session-pane">
      <div class="search-box">
        <ElInput
          :model-value="searchQuery"
          :placeholder="t('searchSessions')"
          @update:model-value="store.setSearchQuery"
        >
          <template #prefix>
            <Search :size="16" class="search-icon" />
          </template>
        </ElInput>
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
    </div>

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

    <RemoteExplorerPane />
    <SessionDeleteModal
      :open="Boolean(deleteConfirmTarget)"
      :session-name="deleteConfirmTarget?.name ?? ''"
      @close="closeDeleteConfirm"
      @confirm="void confirmDeleteSession()"
    />
  </aside>
</template>

<style scoped lang="scss">
.left-rail {
  position: relative;
  display: grid;
  min-height: 0;
  grid-template-rows: auto minmax(220px, 1fr) minmax(220px, 0.9fr) auto;
  border-right: 1px solid rgba(58, 73, 74, 0.7);
  background: rgba(27, 27, 30, 0.92);
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px 14px;
  border-bottom: 1px solid rgba(58, 73, 74, 0.55);

  h1 {
    color: var(--cyan);
    font-size: 14px;
    font-weight: 700;
  }

  p {
    margin-top: 2px;
    color: rgba(185, 202, 202, 0.7);
    font-size: 11px;
  }
}

.brand-mark {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: var(--cyan);
}

.session-pane {
  position: relative;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(58, 73, 74, 0.35);
}

.search-box {
  margin-bottom: 20px;

  :deep(.el-input__wrapper) {
    min-height: 38px;
    padding-left: 10px;
    border-radius: 8px;
    background: rgba(14, 14, 17, 0.72);
    box-shadow:
      inset 0 0 0 1px rgba(58, 73, 74, 0.44),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  :deep(.el-input__wrapper:hover) {
    box-shadow:
      inset 0 0 0 1px rgba(99, 247, 255, 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  :deep(.el-input__inner) {
    font-size: 13px;
  }

  :deep(.el-input.is-focus .el-input__wrapper) {
    background: rgba(14, 14, 17, 0.84);
    box-shadow:
      0 0 0 1px rgba(99, 247, 255, 0.18),
      0 10px 24px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }
}

.search-icon {
  color: rgba(185, 202, 202, 0.62);
}

.session-group + .session-group {
  margin-top: 20px;
}

.session-item {
  display: flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  padding: 0 10px 0 12px;
  border: 0;
  border-left: 2px solid transparent;
  background: transparent;
  color: rgba(228, 225, 230, 0.88);
  cursor: pointer;
  transition: background-color 140ms ease;

  &:hover {
    background: rgba(53, 52, 56, 0.55);
  }

  &.active {
    border-left-color: var(--cyan);
    background: rgba(53, 52, 56, 0.8);
    color: var(--cyan-soft);
  }
}

.session-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.session-name {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-type,
.session-action {
  opacity: 0.75;
}

.session-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(132, 148, 149, 0.6);

  &[data-state='online'] {
    background: #10b981;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.35);
  }

  &[data-state='warning'] {
    background: var(--yellow);
  }
}

.tab-context-menu {
  position: absolute;
  z-index: 40;
  min-width: 132px;
  padding: 6px;
  border: 1px solid rgba(58, 73, 74, 0.6);
  border-radius: 6px;
  background: rgba(19, 19, 22, 0.98);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42);
}

.tab-context-item {
  display: flex;
  width: 100%;
  min-height: 24px;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgba(228, 225, 230, 0.92);
  font-size: 9px;
  line-height: 1;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(53, 52, 56, 0.8);
    color: var(--cyan-soft);
  }
}
</style>
