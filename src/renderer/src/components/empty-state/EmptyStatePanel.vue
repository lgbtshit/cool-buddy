<script setup lang="ts">
import type { LucideIcon } from 'lucide-vue-next'

defineProps<{
  title: string
  description: string
  icon: LucideIcon
  compact?: boolean
}>()
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
