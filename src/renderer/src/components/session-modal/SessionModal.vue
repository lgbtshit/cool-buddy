<script setup lang="ts">
import { computed } from 'vue';
import { ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus';
import 'element-plus/es/components/input/style/css';
import 'element-plus/es/components/input-number/style/css';
import 'element-plus/es/components/option/style/css';
import 'element-plus/es/components/select/style/css';
import { FolderOpen, KeyRound, LockKeyhole, ShieldCheck, X } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useAppCopy } from '../../composables/use-app-copy';
import { useSshConsoleStore } from '../../stores/ssh-console';

const store = useSshConsoleStore();
const { canSaveSession, sessionDraft, sessionModalOpen, sessions, sshAuthCapabilities } =
  storeToRefs(store);
const { t } = useAppCopy();

/**
 * Computed: defaultKeyPreview
 * Purpose:
 *   Summarizes the most relevant detected default SSH key paths so the modal
 *   can acknowledge what the system has already discovered without overwhelming
 *   the user with a long path list.
 * Returns:
 *   Up to two detected key paths plus an overflow count for any remaining
 *   items.
 * Example:
 *   If three default keys are detected, the UI shows the first two and a
 *   "+1" overflow badge.
 */
const defaultKeyPreview = computed(() => {
  const paths = sshAuthCapabilities.value.detectedDefaultKeyPaths;
  return {
    visiblePaths: paths.slice(0, 2),
    remainingCount: Math.max(0, paths.length - 2)
  };
});
</script>

<template>
  <div v-if="sessionModalOpen" class="modal-scrim">
    <section class="session-modal session-create-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('createSession') }}</h2>
          <p>{{ t('sessionAuthDescription') }}</p>
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

        <section class="auth-panel">
          <div class="auth-panel-header">
            <div>
              <span class="panel-kicker">{{ t('sessionAuthTitle') }}</span>
              <p>{{ t('sessionAuthHint') }}</p>
            </div>
            <div class="capability-pills">
              <span class="capability-pill" :data-active="sshAuthCapabilities.hasAgent">
                <ShieldCheck :size="13" />
                <span>{{
                  sshAuthCapabilities.hasAgent
                    ? t('sessionAgentAvailable')
                    : t('sessionAgentUnavailable')
                }}</span>
              </span>
              <span
                class="capability-pill"
                :data-active="sshAuthCapabilities.detectedDefaultKeyPaths.length > 0"
              >
                <KeyRound :size="13" />
                <span>{{
                  sshAuthCapabilities.detectedDefaultKeyPaths.length > 0
                    ? t('sessionDefaultKeyFound')
                    : t('sessionDefaultKeyMissing')
                }}</span>
              </span>
            </div>
          </div>

          <div class="auth-method-grid">
            <button
              class="auth-method-card"
              :class="{ active: sessionDraft.authMethod === 'systemKey' }"
              type="button"
              @click="store.setSessionDraftAuthMethod('systemKey')"
            >
              <div class="auth-method-icon">
                <KeyRound :size="16" />
              </div>
              <div class="auth-method-copy">
                <strong>{{ t('sessionAuthSystemKey') }}</strong>
                <span>{{ t('sessionAuthSystemKeyHint') }}</span>
              </div>
            </button>

            <button
              class="auth-method-card"
              :class="{ active: sessionDraft.authMethod === 'password' }"
              type="button"
              @click="store.setSessionDraftAuthMethod('password')"
            >
              <div class="auth-method-icon">
                <LockKeyhole :size="16" />
              </div>
              <div class="auth-method-copy">
                <strong>{{ t('sessionAuthPassword') }}</strong>
                <span>{{ t('sessionAuthPasswordHint') }}</span>
              </div>
            </button>
          </div>

          <div v-if="sessionDraft.authMethod === 'systemKey'" class="auth-mode-body">
            <div class="segmented-control">
              <button
                class="segment-btn"
                :class="{ active: sessionDraft.keySource === 'default' }"
                type="button"
                @click="store.setSessionDraftKeySource('default')"
              >
                {{ t('sessionKeySourceDefault') }}
              </button>
              <button
                class="segment-btn"
                :class="{ active: sessionDraft.keySource === 'custom' }"
                type="button"
                @click="store.setSessionDraftKeySource('custom')"
              >
                {{ t('sessionKeySourceCustom') }}
              </button>
            </div>

            <div v-if="sessionDraft.keySource === 'default'" class="auth-capability-card">
              <div class="capability-copy">
                <strong>{{ t('sessionKeySourceDefault') }}</strong>
                <p>{{ t('sessionKeySourceDefaultHint') }}</p>
              </div>

              <div v-if="defaultKeyPreview.visiblePaths.length" class="detected-path-list">
                <span v-for="path in defaultKeyPreview.visiblePaths" :key="path" class="path-chip">
                  {{ path }}
                </span>
                <span v-if="defaultKeyPreview.remainingCount" class="path-chip subdued">
                  +{{ defaultKeyPreview.remainingCount }}
                </span>
              </div>

              <p v-else class="empty-capability-note">
                {{ t('sessionDefaultKeySummary') }}
              </p>
            </div>

            <div v-else class="custom-key-grid">
              <label class="full-span">
                <span>{{ t('sessionPrivateKeyPath') }}</span>
                <div class="browse-row">
                  <ElInput v-model="sessionDraft.privateKeyPath" />
                  <button
                    class="browse-btn"
                    type="button"
                    @click="void store.chooseSessionDraftPrivateKey()"
                  >
                    <FolderOpen :size="15" />
                    <span>{{ t('browsePrivateKey') }}</span>
                  </button>
                </div>
              </label>

              <label class="full-span">
                <span>{{ t('sessionPrivateKeyPassphrase') }}</span>
                <ElInput v-model="sessionDraft.passphrase" type="password" show-password />
              </label>

              <p class="helper-line">{{ t('sessionKeySourceCustomHint') }}</p>
            </div>
          </div>

          <label v-else class="password-field">
            <span>{{ t('password') }}</span>
            <ElInput v-model="sessionDraft.password" type="password" show-password />
          </label>
        </section>
      </div>

      <div class="modal-actions">
        <button v-if="sessions.length" class="ghost-btn" @click="store.closeSessionModal()">
          {{ t('cancel') }}
        </button>
        <button class="primary-btn" :disabled="!canSaveSession" @click="void store.saveSession()">
          {{ t('saveSession') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.session-create-modal {
  width: min(860px, calc(100vw - 40px));
}

.session-form-grid {
  align-items: start;

  :deep(.el-input),
  :deep(.el-select),
  :deep(.el-input-number) {
    width: 100%;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    min-height: 40px;
    border-radius: 8px;
    background: rgba(14, 14, 17, 0.72);
    box-shadow:
      inset 0 0 0 1px rgba(58, 73, 74, 0.44),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  :deep(.el-input-number .el-input__wrapper) {
    min-height: 40px;
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

.auth-panel {
  display: grid;
  grid-column: 1 / -1;
  gap: 16px;
  padding: 18px;
  border: 1px solid rgba(58, 73, 74, 0.34);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(20, 23, 27, 0.92) 0%, rgba(14, 15, 19, 0.92) 100%),
    rgba(14, 14, 17, 0.72);
}

.auth-panel-header {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: 12px;

  p {
    max-width: 520px;
    color: rgba(185, 202, 202, 0.72);
    font-size: 12px;
    line-height: 1.6;
  }
}

.panel-kicker {
  display: inline-block;
  margin-bottom: 4px;
  color: rgba(99, 247, 255, 0.82);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.capability-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.capability-pill {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgba(58, 73, 74, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(185, 202, 202, 0.68);
  font-size: 11px;

  &[data-active='true'] {
    border-color: rgba(99, 247, 255, 0.24);
    background: rgba(99, 247, 255, 0.08);
    color: rgba(210, 251, 252, 0.92);
  }
}

.auth-method-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.auth-method-card {
  display: flex;
  min-height: 82px;
  align-items: start;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(58, 73, 74, 0.32);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  color: rgba(228, 225, 230, 0.88);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    transform 140ms ease,
    box-shadow 140ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(99, 247, 255, 0.18);
  }

  &.active {
    border-color: rgba(99, 247, 255, 0.28);
    background: rgba(99, 247, 255, 0.08);
    box-shadow: inset 0 0 0 1px rgba(99, 247, 255, 0.08);
  }
}

.auth-method-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  background: rgba(99, 247, 255, 0.12);
  color: rgba(185, 250, 252, 0.92);
  flex: 0 0 auto;
}

.auth-method-copy {
  display: grid;
  gap: 4px;

  strong {
    font-size: 13px;
    font-weight: 600;
  }

  span {
    color: rgba(185, 202, 202, 0.7);
    font-size: 12px;
    line-height: 1.5;
  }
}

.auth-mode-body,
.custom-key-grid {
  display: grid;
  gap: 14px;
}

.segmented-control {
  display: inline-grid;
  width: fit-content;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  padding: 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.segment-btn {
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(185, 202, 202, 0.72);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &.active {
    background: rgba(99, 247, 255, 0.12);
    color: rgba(228, 251, 252, 0.94);
  }
}

.auth-capability-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(58, 73, 74, 0.28);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.12);
}

.capability-copy {
  display: grid;
  gap: 4px;

  strong {
    color: rgba(238, 241, 244, 0.96);
    font-size: 13px;
    font-weight: 600;
  }

  p {
    color: rgba(185, 202, 202, 0.72);
    font-size: 12px;
    line-height: 1.6;
  }
}

.detected-path-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.path-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(214, 223, 225, 0.86);
  font-size: 11px;
  line-height: 1.4;
  word-break: break-all;

  &.subdued {
    color: rgba(185, 202, 202, 0.68);
  }
}

.empty-capability-note,
.helper-line {
  color: rgba(185, 202, 202, 0.68);
  font-size: 12px;
  line-height: 1.6;
}

.full-span {
  width: 100%;
}

.browse-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.browse-btn {
  display: inline-flex;
  min-width: 124px;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid rgba(58, 73, 74, 0.38);
  border-radius: 8px;
  background: rgba(33, 35, 40, 0.9);
  color: rgba(228, 225, 230, 0.82);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.password-field {
  display: grid;
  gap: 8px;
}

@media (max-width: 760px) {
  .auth-method-grid,
  .browse-row {
    grid-template-columns: 1fr;
  }

  .capability-pills {
    width: 100%;
  }

  .segment-btn {
    min-width: 0;
  }
}
</style>
