<script setup lang="ts">
import { useAppCopy } from '../../composables/use-app-copy'

defineProps<{
  message: string
  open: boolean
  title: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useAppCopy()
</script>

<template>
  <div v-if="open" class="modal-scrim">
    <section class="paste-confirm-modal session-delete-modal">
      <div class="modal-header">
        <div>
          <h2>{{ title }}</h2>
          <p>{{ message }}</p>
        </div>
      </div>

      <div class="modal-actions">
        <button class="primary-btn" @click="emit('close')">{{ t('cancel') }}</button>
      </div>
    </section>
  </div>
</template>
