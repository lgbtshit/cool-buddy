<script setup lang="ts">
import { computed } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';

const props = defineProps<{
  open: boolean;
  content: string;
}>();

const emit = defineEmits<{
  close: [];
  executeAll: [];
  executeLineByLine: [];
}>();

const { locale, t } = useAppCopy();

const lineCount = computed(() => props.content.split(/\r?\n/).length);
const previewText = computed(() => props.content.split(/\r?\n/).slice(0, 6).join('\n'));
const descriptionText = computed(() =>
  locale.value === 'zh-CN'
    ? `检测到 ${lineCount.value} 行命令内容，选择如何发送到远端终端。`
    : `Detected ${lineCount.value} lines of command content. Choose how to send it to the remote terminal.`
);
</script>

<template>
  <div v-if="open" class="modal-scrim">
    <section class="paste-confirm-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('pasteConfirmTitle') }}</h2>
          <p>{{ descriptionText }}</p>
        </div>
      </div>

      <pre class="paste-preview">{{ previewText }}</pre>

      <div class="modal-actions paste-confirm-actions">
        <button class="ghost-btn" @click="emit('close')">{{ t('cancel') }}</button>
        <button class="ghost-btn" @click="emit('executeLineByLine')">
          {{ t('pasteExecuteLineByLine') }}
        </button>
        <button class="primary-btn" @click="emit('executeAll')">{{ t('pasteExecuteAll') }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.paste-confirm-modal {
  width: min(560px, calc(100vw - 48px));
  padding: 18px;
  border: 1px solid rgba(58, 73, 74, 0.55);
  border-radius: 6px;
  background: rgba(19, 19, 22, 0.98);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
}

.paste-preview {
  max-height: 180px;
  margin-top: 14px;
  overflow: auto;
  padding: 12px;
  border: 1px solid rgba(58, 73, 74, 0.35);
  border-radius: 4px;
  background: rgba(14, 14, 17, 0.88);
  color: rgba(228, 225, 230, 0.88);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.paste-confirm-actions {
  display: grid;
  align-items: stretch;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  :deep(.primary-btn),
  :deep(.ghost-btn) {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: 8px 12px;
    text-align: center;
    white-space: normal;
    word-break: break-word;
  }
}
</style>
