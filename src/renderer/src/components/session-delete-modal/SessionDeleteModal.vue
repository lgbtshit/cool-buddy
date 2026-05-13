<script setup lang="ts">
import { computed } from 'vue';
import { useAppCopy } from '../../composables/use-app-copy';

const props = defineProps<{
  open: boolean;
  sessionName: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

const { t } = useAppCopy();
const descriptionText = computed(() =>
  t('sessionDeleteDescription', { sessionName: props.sessionName })
);
</script>

<template>
  <div v-if="open" class="modal-scrim">
    <section class="paste-confirm-modal session-delete-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('deleteSessionTitle') }}</h2>
          <p>{{ descriptionText }}</p>
        </div>
      </div>

      <div class="modal-actions">
        <button class="ghost-btn" @click="emit('close')">{{ t('cancel') }}</button>
        <button class="primary-btn" @click="emit('confirm')">{{ t('deleteSessionAction') }}</button>
      </div>
    </section>
  </div>
</template>
