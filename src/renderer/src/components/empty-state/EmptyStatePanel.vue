<script setup lang="ts">
import type { LucideIcon } from 'lucide-vue-next';

defineProps<{
  title: string;
  description: string;
  icon: LucideIcon;
  compact?: boolean;
}>();
</script>

<template>
  <div class="empty-state-panel" :class="{ compact }">
    <div class="empty-state-orb">
      <component :is="icon" :size="compact ? 16 : 18" />
    </div>
    <div class="empty-state-copy">
      <strong>{{ title }}</strong>
      <p>{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="empty-state-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.empty-state-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 12px;
  border: 1px dashed rgba(99, 247, 255, 0.18);
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(18, 28, 30, 0.36), rgba(14, 14, 17, 0.22)),
    rgba(255, 255, 255, 0.01);
  width: 100%;

  &.compact {
    padding: 12px 10px;
  }
}

.empty-state-orb {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(99, 247, 255, 0.22);
  border-radius: 6px;
  background: rgba(14, 14, 17, 0.68);
  color: rgba(99, 247, 255, 0.88);
}

.empty-state-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;

  strong {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  p {
    color: rgba(185, 202, 202, 0.76);
    font-size: 12px;
    line-height: 1.55;
  }
}

.empty-state-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
