<script setup lang="ts">
import { Bot, Check, ChevronDown, KeyRound, Link2, RefreshCw, Waypoints } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';
import { useSshConsoleStore } from '../../stores/ssh-console';
import type { AgentProviderCode } from '../../types/ssh-console';

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
const providerMenuOpen = ref(false);
const providerPickerRef = ref<HTMLElement | null>(null);

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

const modelDatalistId = 'agent-provider-models';

function toggleProviderMenu() {
  providerMenuOpen.value = !providerMenuOpen.value;
}

function selectProvider(providerCode: AgentProviderCode) {
  store.applyAgentProviderCode(providerCode);
  providerMenuOpen.value = false;
}

async function loadProviderModels() {
  await store.loadProviderModels();
}

function handleWindowPointerDown(event: MouseEvent) {
  if (!providerMenuOpen.value || !providerPickerRef.value) {
    return;
  }

  const target = event.target;
  if (target instanceof Node && !providerPickerRef.value.contains(target)) {
    providerMenuOpen.value = false;
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    providerMenuOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('mousedown', handleWindowPointerDown);
  window.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowPointerDown);
  window.removeEventListener('keydown', handleEscape);
});
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
                <div ref="providerPickerRef" class="provider-picker">
                  <button
                    class="provider-picker-trigger"
                    :class="{ open: providerMenuOpen }"
                    type="button"
                    @click="toggleProviderMenu"
                  >
                    <span class="provider-picker-value">{{ selectedProviderName }}</span>
                    <ChevronDown :size="16" class="provider-picker-caret" />
                  </button>

                  <div v-if="providerMenuOpen" class="provider-picker-menu">
                    <button
                      v-for="provider in agentProviderOptions"
                      :key="provider.code"
                      class="provider-picker-option"
                      :class="{ active: provider.code === agentSettings.providerCode }"
                      type="button"
                      @click="selectProvider(provider.code)"
                    >
                      <span class="provider-picker-option-main">
                        <span class="provider-picker-option-name">{{ provider.name }}</span>
                        <span class="provider-picker-option-description">
                          {{ provider.description }}
                        </span>
                      </span>
                      <Check
                        v-if="provider.code === agentSettings.providerCode"
                        :size="15"
                        class="provider-picker-check"
                      />
                    </button>
                  </div>
                </div>
              </label>

              <div class="provider-note">
                <span class="provider-badge">{{ agentSettings.providerName }}</span>
                <p>{{ selectedProviderDescription }}</p>
              </div>

              <label>
                <span>{{ t('agentProviderUrlLabel') }}</span>
                <div class="field-shell">
                  <Link2 :size="15" />
                  <input
                    :value="agentSettings.baseUrl"
                    :placeholder="t('agentProviderUrlPlaceholder')"
                    type="text"
                    @input="store.updateAgentBaseUrl(($event.target as HTMLInputElement).value)"
                  />
                </div>
              </label>

              <label>
                <span>{{ t('agentProviderKeyLabel') }}</span>
                <div class="field-shell">
                  <KeyRound :size="15" />
                  <input
                    :value="agentSettings.apiKey"
                    :placeholder="t('agentProviderKeyPlaceholder')"
                    type="password"
                    @input="store.updateAgentApiKey(($event.target as HTMLInputElement).value)"
                  />
                </div>
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
                <div class="field-shell">
                  <Waypoints :size="15" />
                  <input
                    :value="agentSettings.modelName"
                    :placeholder="t('agentProviderModelPlaceholder')"
                    :list="modelDatalistId"
                    type="text"
                    @input="store.updateAgentModelName(($event.target as HTMLInputElement).value)"
                  />
                </div>
                <datalist :id="modelDatalistId">
                  <option v-for="model in agentModelOptions" :key="model.id" :value="model.id">
                    {{ model.name }}
                  </option>
                </datalist>
              </label>

              <p class="helper-text">{{ t('agentProviderModelsHint') }}</p>

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

  input {
    width: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 13px;
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

.provider-picker {
  position: relative;
}

.provider-picker-trigger {
  display: flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border: 1px solid var(--field-border);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(30, 32, 37, 0.98) 0%, rgba(20, 22, 26, 0.98) 100%);
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;

  &:hover {
    border-color: rgba(99, 247, 255, 0.26);
    background: linear-gradient(180deg, rgba(33, 36, 40, 0.98) 0%, rgba(22, 25, 28, 0.98) 100%);
  }

  &:focus-visible,
  &.open {
    border-color: rgba(99, 247, 255, 0.36);
    box-shadow:
      0 0 0 1px rgba(99, 247, 255, 0.08),
      0 10px 28px rgba(0, 0, 0, 0.32);
  }
}

.provider-picker-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-picker-caret {
  flex: 0 0 auto;
  color: rgba(185, 202, 202, 0.7);
  transition: transform 160ms ease;

  .provider-picker-trigger.open & {
    transform: rotate(180deg);
  }
}

.provider-picker-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  left: 0;
  width: 100%;
  max-height: 320px;
  overflow: auto;
  padding: 8px;
  border: 1px solid rgba(73, 86, 91, 0.52);
  border-radius: 10px;
  background: rgba(18, 20, 24, 0.98);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(14px);

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: rgba(121, 138, 144, 0.44);
    background-clip: padding-box;
  }
}

.provider-picker-option {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: rgba(228, 225, 230, 0.9);
  text-align: left;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    transform 140ms ease;

  &:hover {
    border-color: rgba(99, 247, 255, 0.18);
    background: rgba(99, 247, 255, 0.08);
  }

  &.active {
    border-color: rgba(99, 247, 255, 0.24);
    background: linear-gradient(180deg, rgba(29, 43, 48, 0.96) 0%, rgba(24, 34, 39, 0.96) 100%);
  }
}

.provider-picker-option-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.provider-picker-option-name {
  color: rgba(236, 238, 240, 0.96);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.provider-picker-option-description {
  color: rgba(165, 178, 184, 0.72);
  font-size: 11px;
  line-height: 1.5;
}

.provider-picker-check {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--cyan-soft);
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

.field-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--field-border);
  border-radius: 8px;
  background: var(--field-bg);
  color: rgba(185, 202, 202, 0.72);

  &:focus-within {
    border-color: var(--field-border-strong);
    background: var(--field-bg-elevated);
    box-shadow: var(--field-shadow-focus);
  }

  input {
    height: 42px;
  }
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
