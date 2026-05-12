<script setup lang="ts">
import { useAppCopy } from '../../composables/use-app-copy';

defineProps<{
  lineLimit: number;
  maxLines: number;
  minLines: number;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [];
  'update:line-limit': [value: number];
}>();

const { t } = useAppCopy();
</script>

<template>
  <div v-if="open" class="modal-scrim">
    <section class="session-modal log-settings-modal">
      <div class="modal-header">
        <div>
          <h2>{{ t('logSettings') }}</h2>
          <p>{{ t('logLineCountHint') }}</p>
        </div>
      </div>

      <div class="modal-grid">
        <label>
          <span>{{ t('logLineCount') }}</span>
          <input
            :max="maxLines"
            :min="minLines"
            :value="lineLimit"
            type="number"
            @input="
              emit(
                'update:line-limit',
                Number(($event.target as HTMLInputElement).value) || minLines
              )
            "
          />
        </label>
      </div>

      <div class="modal-actions">
        <button class="ghost-btn" @click="emit('close')">{{ t('cancel') }}</button>
        <button class="primary-btn" @click="emit('save')">{{ t('logSaveSettings') }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.log-settings-modal {
  width: min(420px, calc(100vw - 32px));
}
</style>
