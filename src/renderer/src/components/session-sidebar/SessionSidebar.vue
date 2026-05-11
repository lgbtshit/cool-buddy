<script setup lang="ts">
import {
  Activity,
  Database,
  HardDrive,
  History,
  Plus,
  Search,
  Server,
  SquareTerminal
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useAppCopy } from '../../composables/use-app-copy'
import EmptyStatePanel from '../empty-state/EmptyStatePanel.vue'
import RemoteExplorerPane from '../remote-explorer-pane/RemoteExplorerPane.vue'
import { useSshConsoleStore } from '../../stores/ssh-console'
import type { SessionItem } from '../../types/ssh-console'

const store = useSshConsoleStore()
const { activeSessionId, filteredSessions, searchQuery, sessionGroups, sessions, sessionsLoaded } =
  storeToRefs(store)
const { t } = useAppCopy()

const sessionIconMap = {
  server: Server,
  database: Database,
  hardDrive: HardDrive
}

const handleConnect = async (session: SessionItem) => {
  await store.connectToSession(session)
}
</script>

<template>
  <aside class="left-rail">
    <div class="brand-block">
      <div class="brand-mark">
        <SquareTerminal :size="16" />
      </div>
      <div>
        <h1>{{ t('appName') }}</h1>
        <p>{{ t('version') }}</p>
      </div>
    </div>

    <div class="session-pane">
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
    <RemoteExplorerPane />
  </aside>
</template>
