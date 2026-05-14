<script setup lang="ts">
import { ElInput, ElOption, ElSelect } from 'element-plus';
import 'element-plus/es/components/input/style/css';
import 'element-plus/es/components/option/style/css';
import 'element-plus/es/components/select/style/css';
import { Bot, KeyRound, Link2, RefreshCw, Waypoints } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';
import { useSshConsoleStore } from '../../stores/ssh-console';

const store = useSshConsoleStore();
const {
  agentProviderOptions,
  agentSettings,
  agentSettingsError,
  agentSettingsLoading,
  agentModelOptions,
  agentModelsLoading,
  agentSettingsOpen,
  agentSettingsSaving,
  canSaveAgentSettings
} = storeToRefs(store);
const { locale, t } = useAppCopy();

const activeCategory = ref<'provider'>('provider');

const selectedProviderDescription = computed(() => {
  return (
    agentProviderOptions.value.find((item) => item.code === agentSettings.value.providerCode)
      ?.description ?? ''
  );
});

const updatedAtLabel = computed(() => {
  if (!agentSettings.value.updatedAt) {
    return '';
  }

  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(agentSettings.value.updatedAt));
});

const selectedProviderName = computed(() => {
  return (
    agentProviderOptions.value.find((item) => item.code === agentSettings.value.providerCode)
      ?.name ?? agentSettings.value.providerName
  );
});

const selectedModelOption = computed(() => {
  return (
    agentModelOptions.value.find((item) => item.id === agentSettings.value.modelName.trim()) ?? null
  );
});

const providerCodeModel = computed({
  get: () => agentSettings.value.providerCode,
  set: (value) => {
    store.applyAgentProviderCode(value);
  }
});

const modelNameModel = computed({
  get: () => agentSettings.value.modelName,
  set: (value) => {
    store.updateAgentModelName(value);
  }
});

async function loadProviderModels() {
  await store.loadProviderModels();
}
</script>

<template>
  <div v-if="agentSettingsOpen" class="modal-scrim">
    <section class="session-modal terminal-settings-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('terminalSettings') }}</h2>
          <p>{{ t('agentSettingsHint') }}</p>
        </div>
      </div>

      <div class="settings-shell">
        <aside class="settings-nav">
          <button
            class="settings-nav-item"
            :class="{ active: activeCategory === 'provider' }"
            @click="activeCategory = 'provider'"
          >
            <Bot :size="15" />
            <span>{{ t('agentSettingsCategoryProvider') }}</span>
          </button>
        </aside>

        <section class="settings-panel">
          <template v-if="activeCategory === 'provider'">
            <div class="section-intro">
              <span class="section-kicker">{{ t('agentSettingsCategoryProvider') }}</span>
              <p>{{ t('agentProviderHint') }}</p>
            </div>

            <div v-if="agentSettingsLoading" class="panel-empty">{{ t('loadingSessions') }}</div>

            <div v-else class="form-grid">
              <label>
                <span>{{ t('agentProviderLabel') }}</span>
                <ElSelect
                  v-model="providerCodeModel"
                  class="provider-select"
                  placement="bottom-start"
                  popper-class="cool-buddy-select-popper"
                >
                  <ElOption
                    v-for="provider in agentProviderOptions"
                    :key="provider.code"
                    :label="provider.name"
                    :value="provider.code"
                  >
                    <div class="provider-option">
                      <span class="provider-option-name">{{ provider.name }}</span>
                      <span class="provider-option-description">{{ provider.description }}</span>
                    </div>
                  </ElOption>
                </ElSelect>
              </label>

              <div class="provider-note">
                <span class="provider-badge">{{ selectedProviderName }}</span>
                <p>{{ selectedProviderDescription }}</p>
              </div>

              <label>
                <span>{{ t('agentProviderUrlLabel') }}</span>
                <ElInput
                  :model-value="agentSettings.baseUrl"
                  :placeholder="t('agentProviderUrlPlaceholder')"
                  @update:model-value="store.updateAgentBaseUrl"
                >
                  <template #prefix>
                    <Link2 :size="15" />
                  </template>
                </ElInput>
              </label>

              <label>
                <span>{{ t('agentProviderKeyLabel') }}</span>
                <ElInput
                  :model-value="agentSettings.apiKey"
                  :placeholder="t('agentProviderKeyPlaceholder')"
                  type="password"
                  show-password
                  @update:model-value="store.updateAgentApiKey"
                >
                  <template #prefix>
                    <KeyRound :size="15" />
                  </template>
                </ElInput>
              </label>

              <label>
                <div class="field-label-row">
                  <span>{{ t('agentProviderModelLabel') }}</span>
                  <button
                    class="mini-inline-btn"
                    :disabled="agentSettingsLoading || agentModelsLoading"
                    type="button"
                    @click="void loadProviderModels()"
                  >
                    <RefreshCw :size="14" :class="{ spinning: agentModelsLoading }" />
                    <span>{{ t('agentProviderLoadModels') }}</span>
                  </button>
                </div>
                <ElSelect
                  v-model="modelNameModel"
                  class="provider-select"
                  filterable
                  allow-create
                  default-first-option
                  reserve-keyword
                  :loading="agentModelsLoading"
                  :loading-text="t('loadingSessions')"
                  :no-data-text="'No loaded models yet.'"
                  :no-match-text="'No matching loaded models.'"
                  :placeholder="t('agentProviderModelPlaceholder')"
                  popper-class="cool-buddy-select-popper"
                >
                  <template #prefix>
                    <Waypoints :size="15" />
                  </template>
                  <ElOption
                    v-for="model in agentModelOptions"
                    :key="model.id"
                    :label="model.name"
                    :value="model.id"
                  >
                    <div class="provider-option">
                      <span class="provider-option-name">{{ model.name }}</span>
                      <span v-if="model.name !== model.id" class="provider-option-description">
                        {{ model.id }}
                      </span>
                    </div>
                  </ElOption>
                </ElSelect>
              </label>

              <p class="helper-text">
                {{
                  selectedModelOption
                    ? `Selected: ${selectedModelOption.name}${
                        selectedModelOption.name !== selectedModelOption.id
                          ? ` (${selectedModelOption.id})`
                          : ''
                      }`
                    : t('agentProviderModelsHint')
                }}
              </p>

              <p class="footnote">{{ t('agentCodexHint') }}</p>
              <p v-if="updatedAtLabel" class="saved-at">
                {{ t('agentSettingsSavedAt') }}: {{ updatedAtLabel }}
              </p>
              <p v-if="agentSettingsError" class="error-text">{{ agentSettingsError }}</p>
            </div>
          </template>
        </section>
      </div>

      <div class="modal-actions">
        <button class="ghost-btn" @click="store.closeAgentSettingsModal()">
          {{ t('cancel') }}
        </button>
        <button
          class="primary-btn"
          :disabled="!canSaveAgentSettings || agentSettingsLoading || agentSettingsSaving"
          @click="void store.saveAgentSettings()"
        >
          {{ t('agentSettingsSave') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.terminal-settings-modal {
  width: min(880px, calc(100vw - 40px));

  :deep(.el-input),
  :deep(.el-select) {
    --el-input-bg-color: rgba(14, 14, 17, 0.88);
    --el-fill-color-blank: rgba(14, 14, 17, 0.88);
    --el-fill-color-light: rgba(14, 14, 17, 0.88);
    --el-text-color-regular: rgba(228, 225, 230, 0.92);
    --el-text-color-placeholder: rgba(185, 202, 202, 0.46);
    --el-border-color: rgba(58, 73, 74, 0.42);
    --el-border-color-hover: rgba(99, 247, 255, 0.24);
    --el-border-color-focus: rgba(99, 247, 255, 0.52);
  }

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    min-height: 42px;
    padding: 0 14px;
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(30, 32, 37, 0.98) 0%, rgba(20, 22, 26, 0.98) 100%);
    box-shadow: inset 0 0 0 1px rgba(58, 73, 74, 0.42);
  }

  :deep(.el-input__wrapper:hover),
  :deep(.el-select__wrapper:hover) {
    box-shadow: inset 0 0 0 1px rgba(99, 247, 255, 0.24);
  }

  :deep(.el-input.is-focus .el-input__wrapper),
  :deep(.el-select.is-focused .el-select__wrapper) {
    background: linear-gradient(180deg, rgba(33, 36, 40, 0.98) 0%, rgba(22, 25, 28, 0.98) 100%);
    box-shadow:
      0 0 0 1px rgba(99, 247, 255, 0.14),
      0 10px 28px rgba(0, 0, 0, 0.28);
  }

  :deep(.el-input__inner),
  :deep(.el-select__selected-item),
  :deep(.el-select__placeholder) {
    color: rgba(228, 225, 230, 0.92);
    font-size: 13px;
  }

  :deep(.el-input__prefix),
  :deep(.el-input__suffix),
  :deep(.el-select__prefix),
  :deep(.el-select__suffix),
  :deep(.el-input__icon),
  :deep(.el-select__caret) {
    color: rgba(185, 202, 202, 0.66);
  }

  :deep(.el-input__prefix-inner),
  :deep(.el-input__suffix-inner),
  :deep(.el-select__prefix),
  :deep(.el-select__suffix) {
    gap: 8px;
  }

  :deep(.el-select__selection) {
    min-width: 0;
  }
}

.settings-shell {
  display: grid;
  min-height: 420px;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 18px;
}

.settings-nav {
  padding-right: 18px;
  border-right: 1px solid rgba(58, 73, 74, 0.34);
}

.settings-nav-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: rgba(228, 225, 230, 0.84);
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &.active {
    border-color: rgba(99, 247, 255, 0.2);
    background: rgba(99, 247, 255, 0.08);
    color: var(--cyan-soft);
  }
}

.settings-panel {
  min-width: 0;
}

.section-intro {
  margin-bottom: 18px;

  p {
    color: rgba(185, 202, 202, 0.72);
    font-size: 12px;
    line-height: 1.6;
  }
}

.section-kicker {
  display: inline-block;
  margin-bottom: 6px;
  color: rgba(185, 202, 202, 0.6);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.panel-empty {
  display: grid;
  min-height: 240px;
  place-items: center;
  border: 1px dashed rgba(58, 73, 74, 0.42);
  border-radius: 8px;
  color: rgba(185, 202, 202, 0.68);
  font-size: 12px;
}

.form-grid {
  display: grid;
  gap: 14px;

  label {
    display: grid;
    gap: 8px;

    span {
      color: rgba(228, 225, 230, 0.9);
      font-size: 12px;
      font-weight: 500;
    }
  }

  :deep(.el-input),
  :deep(.el-select) {
    width: 100%;
  }
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mini-inline-btn {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgba(58, 73, 74, 0.38);
  border-radius: 6px;
  background: rgba(33, 35, 40, 0.9);
  color: rgba(228, 225, 230, 0.82);
  font-size: 11px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.spinning {
  animation: spin 900ms linear infinite;
}

.provider-option {
  display: grid;
  gap: 2px;
}

.provider-option-name {
  color: rgba(236, 238, 240, 0.96);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
}

.provider-option-description {
  color: rgba(165, 178, 184, 0.72);
  font-size: 10px;
  line-height: 1.35;
}

.provider-note {
  padding: 12px 14px;
  border: 1px solid rgba(58, 73, 74, 0.3);
  border-radius: 8px;
  background: rgba(14, 14, 17, 0.62);

  p {
    color: rgba(185, 202, 202, 0.74);
    font-size: 12px;
    line-height: 1.55;
  }
}

.provider-badge {
  display: inline-flex;
  margin-bottom: 8px;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(99, 247, 255, 0.1);
  color: var(--cyan-soft);
  font-size: 11px;
  font-weight: 600;
}

.footnote,
.helper-text,
.saved-at,
.error-text {
  font-size: 12px;
  line-height: 1.6;
}

.footnote,
.helper-text,
.saved-at {
  color: rgba(185, 202, 202, 0.68);
}

.error-text {
  color: #ff8d85;
}

.modal-actions {
  gap: 12px;
  margin-top: 20px;

  :deep(.ghost-btn),
  :deep(.primary-btn) {
    min-width: 126px;
    min-height: 42px;
    padding: 0 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0;
    transition:
      transform 140ms ease,
      box-shadow 140ms ease,
      background 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  :deep(.ghost-btn) {
    border: 1px solid rgba(78, 83, 92, 0.72);
    background: linear-gradient(180deg, rgba(55, 57, 64, 0.92) 0%, rgba(42, 44, 50, 0.92) 100%);
    color: rgba(236, 238, 242, 0.92);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);

    &:hover:not(:disabled) {
      border-color: rgba(99, 247, 255, 0.18);
      color: #f4f7f8;
      transform: translateY(-1px);
    }
  }

  :deep(.primary-btn) {
    background: linear-gradient(180deg, #2cecf5 0%, #18c9d1 100%);
    color: #04282b;
    box-shadow:
      0 10px 24px rgba(0, 220, 229, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow:
        0 14px 28px rgba(0, 220, 229, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
