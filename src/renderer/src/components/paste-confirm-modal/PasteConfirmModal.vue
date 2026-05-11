<script setup lang="ts">
import { computed } from 'vue'
import { useAppCopy } from '../../composables/use-app-copy'

const props = defineProps<{
  open: boolean
  content: string
}>()

const emit = defineEmits<{
  close: []
  executeAll: []
  executeLineByLine: []
}>()

const { locale, t } = useAppCopy()

const lineCount = computed(() => props.content.split(/\r?\n/).length)
const previewText = computed(() => props.content.split(/\r?\n/).slice(0, 6).join('\n'))
const descriptionText = computed(() =>
  locale.value === 'zh-CN'
    ? `检测到 ${lineCount.value} 行命令内容，选择如何发送到远端终端。`
    : `Detected ${lineCount.value} lines of command content. Choose how to send it to the remote terminal.`
)
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
