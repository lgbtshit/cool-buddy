<script setup lang="ts">
import { Keyboard, X } from 'lucide-vue-next';
import { computed } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { locale, t } = useAppCopy();

const shortcutItems = computed(() =>
  locale.value === 'zh-CN'
    ? [
        {
          keys: ['Ctrl', 'Shift', 'C'],
          title: '复制终端选中内容',
          detail: '先在终端里选中文本，再按组合键复制到剪贴板。'
        },
        {
          keys: ['Ctrl', 'Shift', 'V'],
          title: '粘贴单行命令',
          detail: '把当前剪贴板内容直接粘贴进终端输入区。'
        },
        {
          keys: ['Ctrl', 'Shift', 'V'],
          title: '粘贴多行命令',
          detail: '检测到多行内容时会先弹出确认框，再决定整段执行还是逐行发送。'
        }
      ]
    : [
        {
          keys: ['Ctrl', 'Shift', 'C'],
          title: 'Copy terminal selection',
          detail: 'Select text inside the terminal, then copy it to the clipboard.'
        },
        {
          keys: ['Ctrl', 'Shift', 'V'],
          title: 'Paste a single-line command',
          detail: 'Paste the current clipboard content directly into the terminal input.'
        },
        {
          keys: ['Ctrl', 'Shift', 'V'],
          title: 'Paste multi-line commands',
          detail:
            'When multiple lines are detected, a confirmation dialog lets you run all or send line by line.'
        }
      ]
);
</script>

<template>
  <div v-if="open" class="modal-scrim">
    <section class="session-modal keybindings-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('keyBindings') }}</h2>
          <p>{{ t('keyBindingsHint') }}</p>
        </div>
        <button class="icon-btn" @click="emit('close')">
          <X :size="16" />
        </button>
      </div>

      <div class="keybindings-list">
        <article
          v-for="item in shortcutItems"
          :key="`${item.title}-${item.keys.join('-')}`"
          class="keybinding-item"
        >
          <div class="keybinding-copy">
            <div class="keybinding-heading">
              <Keyboard :size="14" />
              <strong>{{ item.title }}</strong>
            </div>
            <p>{{ item.detail }}</p>
          </div>
          <div class="keybinding-chord" aria-label="Shortcut keys">
            <kbd v-for="key in item.keys" :key="key">{{ key }}</kbd>
          </div>
        </article>
      </div>

      <div class="modal-actions">
        <button class="ghost-btn" @click="emit('close')">{{ t('cancel') }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.keybindings-modal {
  width: min(680px, calc(100vw - 32px));
}

.keybindings-list {
  display: grid;
  gap: 12px;
}

.keybinding-item {
  display: grid;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(58, 73, 74, 0.35);
  border-radius: 6px;
  background: rgba(14, 14, 17, 0.72);
  grid-template-columns: minmax(0, 1fr) auto;
}

.keybinding-copy {
  display: grid;
  gap: 6px;

  p {
    color: rgba(185, 202, 202, 0.78);
    font-size: 13px;
    line-height: 1.5;
  }
}

.keybinding-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(228, 225, 230, 0.92);
}

.keybinding-chord {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  kbd {
    min-width: 36px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid rgba(99, 247, 255, 0.18);
    border-radius: 4px;
    background: rgba(24, 29, 32, 0.92);
    box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.04);
    color: var(--cyan-soft);
    font-size: 12px;
    line-height: 28px;
    text-align: center;
  }
}
</style>
