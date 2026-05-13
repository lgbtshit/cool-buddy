<script setup lang="ts">
import { ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus';
import 'element-plus/es/components/input/style/css';
import 'element-plus/es/components/input-number/style/css';
import 'element-plus/es/components/option/style/css';
import 'element-plus/es/components/select/style/css';
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

      <div class="modal-grid session-form-grid">
        <label>
          <span>{{ t('sessionName') }}</span>
          <ElInput v-model="sessionDraft.name" />
        </label>
        <label>
          <span>{{ t('sessionGroup') }}</span>
          <ElSelect v-model="sessionDraft.group" popper-class="cool-buddy-select-popper">
            <ElOption value="production" :label="t('production')" />
            <ElOption value="staging" :label="t('staging')" />
            <ElOption value="local" :label="t('local')" />
          </ElSelect>
        </label>
        <label>
          <span>{{ t('host') }}</span>
          <ElInput v-model="sessionDraft.host" />
        </label>
        <label>
          <span>{{ t('port') }}</span>
          <ElInputNumber
            v-model="sessionDraft.port"
            :controls="false"
            :min="1"
            :max="65535"
            class="full-width"
          />
        </label>
        <label>
          <span>{{ t('username') }}</span>
          <ElInput v-model="sessionDraft.username" />
        </label>
        <label>
          <span>{{ t('password') }}</span>
          <ElInput v-model="sessionDraft.password" type="password" show-password />
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

<style scoped lang="scss">
.session-form-grid {
  :deep(.el-input),
  :deep(.el-select),
  :deep(.el-input-number) {
    width: 100%;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    min-height: 38px;
    border-radius: 8px;
    background: rgba(14, 14, 17, 0.72);
    box-shadow:
      inset 0 0 0 1px rgba(58, 73, 74, 0.44),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  :deep(.el-input-number .el-input__wrapper) {
    min-height: 38px;
    border-radius: 8px;
    background: rgba(14, 14, 17, 0.72);
    box-shadow:
      inset 0 0 0 1px rgba(58, 73, 74, 0.44),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  :deep(.el-input__wrapper:hover),
  :deep(.el-select__wrapper:hover),
  :deep(.el-input-number .el-input__wrapper:hover) {
    box-shadow:
      inset 0 0 0 1px rgba(99, 247, 255, 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  :deep(.el-input.is-focus .el-input__wrapper),
  :deep(.el-select.is-focused .el-select__wrapper),
  :deep(.el-input-number .el-input__wrapper.is-focus),
  :deep(.el-input-number.is-focus .el-input__wrapper) {
    background: rgba(14, 14, 17, 0.84);
    box-shadow:
      0 0 0 1px rgba(99, 247, 255, 0.18),
      0 10px 24px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  :deep(.el-input__inner),
  :deep(.el-select__selected-item),
  :deep(.el-input-number .el-input__inner) {
    border: 0;
    background: transparent;
    box-shadow: none;
    font-size: 13px;
  }

  :deep(.el-input__inner:focus),
  :deep(.el-input-number .el-input__inner:focus) {
    border: 0;
    background: transparent;
    box-shadow: none;
    outline: none;
  }
}
</style>
