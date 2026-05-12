<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useAppCopy } from '../../composables/use-app-copy';
import { useSshConsoleStore } from '../../stores/ssh-console';

const store = useSshConsoleStore();
const { canSaveSession, sessionDraft, sessionModalOpen, sessions } = storeToRefs(store);
const { t } = useAppCopy();
</script>

<template>
  <div v-if="sessionModalOpen" class="modal-scrim">
    <section class="session-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('createSession') }}</h2>
          <p>{{ t('noSessionsHint') }}</p>
        </div>
        <button v-if="sessions.length" class="icon-btn" @click="store.closeSessionModal()">
          <X :size="16" />
        </button>
      </div>

      <div class="modal-grid">
        <label>
          <span>{{ t('sessionName') }}</span>
          <input v-model="sessionDraft.name" type="text" />
        </label>
        <label>
          <span>{{ t('sessionGroup') }}</span>
          <select v-model="sessionDraft.group">
            <option value="production">{{ t('production') }}</option>
            <option value="staging">{{ t('staging') }}</option>
            <option value="local">{{ t('local') }}</option>
          </select>
        </label>
        <label>
          <span>{{ t('host') }}</span>
          <input v-model="sessionDraft.host" type="text" />
        </label>
        <label>
          <span>{{ t('port') }}</span>
          <input v-model.number="sessionDraft.port" type="number" min="1" max="65535" />
        </label>
        <label>
          <span>{{ t('username') }}</span>
          <input v-model="sessionDraft.username" type="text" />
        </label>
        <label>
          <span>{{ t('password') }}</span>
          <input v-model="sessionDraft.password" type="password" />
        </label>
      </div>

      <div class="modal-actions">
        <button v-if="sessions.length" class="ghost-btn" @click="store.closeSessionModal()">
          {{ t('cancel') }}
        </button>
        <button class="primary-btn" :disabled="!canSaveSession" @click="store.saveSession()">
          {{ t('saveSession') }}
        </button>
      </div>
    </section>
  </div>
</template>
