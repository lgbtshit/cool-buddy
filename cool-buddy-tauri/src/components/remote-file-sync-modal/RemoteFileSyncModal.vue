<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useSshConsoleStore } from '../../stores/ssh-console';

const store = useSshConsoleStore();
const { pendingRemoteFileSyncRequest } = storeToRefs(store);
</script>

<template>
  <div
    v-if="pendingRemoteFileSyncRequest"
    class="modal-scrim"
    @click.self="void store.dismissRemoteFileSyncRequest()"
  >
    <section class="session-modal remote-file-sync-modal">
      <div class="modal-header">
        <div>
          <h2>Remote File Changed</h2>
          <p>The local temp copy was updated after opening the remote file.</p>
        </div>
      </div>

      <div class="sync-details">
        <div class="sync-row">
          <span class="sync-label">Remote</span>
          <code>{{ pendingRemoteFileSyncRequest.remotePath }}</code>
        </div>
        <div class="sync-row">
          <span class="sync-label">Local</span>
          <code>{{ pendingRemoteFileSyncRequest.localPath }}</code>
        </div>
      </div>

      <div class="modal-actions">
        <button class="secondary-btn" type="button" @click="void store.dismissRemoteFileSyncRequest()">
          Later
        </button>
        <button class="primary-btn" type="button" @click="void store.confirmRemoteFileSync()">
          Upload Now
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.remote-file-sync-modal {
  width: min(560px, calc(100vw - 32px));
}

.sync-details {
  display: grid;
  gap: 10px;
}

.sync-row {
  display: grid;
  gap: 6px;
}

.sync-label {
  color: rgba(185, 202, 202, 0.8);
  font-size: 11px;
  text-transform: uppercase;
}

code {
  display: block;
  overflow-wrap: anywhere;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(14, 14, 17, 0.82);
  color: rgba(228, 225, 230, 0.92);
  font-size: 12px;
}
</style>
