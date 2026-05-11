<script setup lang="ts">
import { useAppCopy } from '../../composables/use-app-copy'

defineProps<{
  open: boolean
  sessionName: string
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { locale, t } = useAppCopy()
</script>

<template>
  <div v-if="open" class="modal-scrim">
    <section class="paste-confirm-modal session-delete-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('deleteSessionTitle') }}</h2>
          <p>
            {{
              locale === 'zh-CN'
                ? `确认删除会话“${sessionName}”吗？此操作不会恢复。`
                : `Delete session "${sessionName}"? This action cannot be undone.`
            }}
          </p>
        </div>
      </div>

      <div class="modal-actions">
        <button class="ghost-btn" @click="emit('close')">{{ t('cancel') }}</button>
        <button class="primary-btn" @click="emit('confirm')">{{ t('deleteSessionAction') }}</button>
      </div>
    </section>
  </div>
</template>
