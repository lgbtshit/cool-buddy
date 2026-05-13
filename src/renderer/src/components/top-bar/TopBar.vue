<script setup lang="ts">
import {
  Check,
  ChevronDown,
  Circle,
  Languages,
  MoreHorizontal,
  Plus,
  Server,
  Database,
  HardDrive
} from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppCopy } from '../../composables/use-app-copy';
import { useSshConsoleStore } from '../../stores/ssh-console';
import type { SessionItem } from '../../types/ssh-console';
import type { Locale } from '../../../../shared/locale';

const store = useSshConsoleStore();
const { activeSessionId, latencyLabel, openTabs, tabMenu } = storeToRefs(store);
const { locale, localeLabel, localeOptions, t } = useAppCopy();

const iconMap = {
  server: Server,
  database: Database,
  hardDrive: HardDrive
};
const tabStripRef = ref<HTMLElement | null>(null);
const tabMenuRef = ref<HTMLElement | null>(null);
const localeMenuRef = ref<HTMLElement | null>(null);
const localeTriggerRef = ref<HTMLElement | null>(null);
const localeMenuOpen = ref(false);
const tabMenuStyle = ref({ left: '0px', top: '0px' });
const MENU_GAP_PX = 6;
const VIEWPORT_PADDING_PX = 8;

const handleConnect = async (session: SessionItem) => {
  await store.connectToSession(session);
};

const setLocale = (nextLocale: Locale) => {
  store.setLocale(nextLocale);
  localeMenuOpen.value = false;
};

const toggleLocaleMenu = () => {
  localeMenuOpen.value = !localeMenuOpen.value;
};

const handleWindowPointerDown = (event: MouseEvent) => {
  const target = event.target as Node | null;

  if (
    localeMenuOpen.value &&
    target &&
    !localeMenuRef.value?.contains(target) &&
    !localeTriggerRef.value?.contains(target)
  ) {
    localeMenuOpen.value = false;
  }
};

const updateTabMenuPosition = () => {
  if (!tabMenu.value || !tabStripRef.value || !tabMenuRef.value) return;

  const stripRect = tabStripRef.value.getBoundingClientRect();
  const menuRect = tabMenuRef.value.getBoundingClientRect();
  const maxLeft = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerWidth - stripRect.left - menuRect.width - VIEWPORT_PADDING_PX
  );
  const maxTop = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerHeight - stripRect.top - menuRect.height - VIEWPORT_PADDING_PX
  );

  let left = Math.min(tabMenu.value.x, maxLeft);
  let top = Math.min(tabMenu.value.y, maxTop);

  if (top < VIEWPORT_PADDING_PX) {
    top = Math.max(VIEWPORT_PADDING_PX, tabMenu.value.y - menuRect.height - MENU_GAP_PX);
  }

  tabMenuStyle.value = {
    left: `${Math.max(VIEWPORT_PADDING_PX, left)}px`,
    top: `${Math.max(VIEWPORT_PADDING_PX, top)}px`
  };
};

const handleContextMenu = (event: MouseEvent, sessionId: string) => {
  event.preventDefault();
  event.stopPropagation();

  const stripRect = tabStripRef.value?.getBoundingClientRect();
  store.openTabMenuAt({
    sessionId,
    x: stripRect ? event.clientX - stripRect.left : event.clientX,
    y: stripRect ? event.clientY - stripRect.top + MENU_GAP_PX : event.clientY
  });
  void nextTick(updateTabMenuPosition);
};

watch(tabMenu, (value) => {
  if (!value) return;
  void nextTick(updateTabMenuPosition);
});

onMounted(() => {
  window.addEventListener('resize', updateTabMenuPosition);
  window.addEventListener('mousedown', handleWindowPointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateTabMenuPosition);
  window.removeEventListener('mousedown', handleWindowPointerDown);
});
</script>

<template>
  <header class="topbar">
    <div ref="tabStripRef" class="tab-strip">
      <button
        v-for="session in openTabs"
        :key="session.id"
        class="top-tab"
        :class="{ active: session.id === activeSessionId }"
        @click="void handleConnect(session)"
        @contextmenu="handleContextMenu($event, session.id)"
      >
        <component :is="iconMap[session.icon]" :size="14" />
        <span>{{ session.name }}</span>
      </button>

      <button class="icon-btn" @click="store.openSessionModal()"><Plus :size="16" /></button>

      <div
        v-if="tabMenu"
        ref="tabMenuRef"
        class="tab-context-menu"
        :style="tabMenuStyle"
        @click.stop
      >
        <button class="tab-context-item" @click="store.removeTab(tabMenu.sessionId)">
          <MoreHorizontal :size="10" />
          <span>{{ t('removeTab') }}</span>
        </button>
      </div>
    </div>

    <div class="topbar-actions">
      <div class="connection-pill">
        <Circle :size="10" class="pulse-dot" />
        <span>{{ latencyLabel }}</span>
      </div>
      <button
        ref="localeTriggerRef"
        class="locale-btn"
        type="button"
        :aria-expanded="localeMenuOpen"
        @click="toggleLocaleMenu"
      >
        <Languages :size="15" />
        <span class="locale-current">{{ localeLabel }}</span>
        <ChevronDown :size="14" class="locale-chevron" :class="{ open: localeMenuOpen }" />
      </button>
      <div v-if="localeMenuOpen" ref="localeMenuRef" class="locale-menu">
        <button
          v-for="option in localeOptions"
          :key="option.value"
          class="locale-menu-item"
          :class="{ active: option.value === locale }"
          type="button"
          @click="setLocale(option.value)"
        >
          <span>{{ option.label }}</span>
          <Check v-if="option.value === locale" :size="14" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped lang="scss">
.topbar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px 0 8px;
  border-bottom: 1px solid rgba(58, 73, 74, 0.55);
  background: rgba(19, 19, 22, 0.82);
  backdrop-filter: blur(16px);
}

.tab-strip,
.topbar-actions {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.tab-strip {
  position: relative;
  flex: 1;
  overflow: visible;
}

.top-tab {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border: 0;
  border-top: 2px solid transparent;
  background: transparent;
  color: rgba(185, 202, 202, 0.82);
  font-size: 12px;
  cursor: pointer;

  &.active {
    border-top-color: var(--cyan);
    background: rgba(53, 52, 56, 0.9);
    color: var(--cyan-soft);
  }
}

.tab-context-menu {
  position: absolute;
  z-index: 40;
  min-width: 132px;
  padding: 6px;
  border: 1px solid rgba(58, 73, 74, 0.6);
  border-radius: 6px;
  background: rgba(19, 19, 22, 0.98);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42);
}

.tab-context-item {
  display: flex;
  width: 100%;
  min-height: 24px;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgba(228, 225, 230, 0.92);
  font-size: 9px;
  line-height: 1;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(53, 52, 56, 0.8);
    color: var(--cyan-soft);
  }
}

.connection-pill {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid rgba(58, 73, 74, 0.4);
  border-radius: 999px;
  background: rgba(14, 14, 17, 0.72);
  color: rgba(228, 225, 230, 0.88);
  font-size: 12px;
}

.locale-btn {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid rgba(58, 73, 74, 0.4);
  border-radius: 999px;
  background: rgba(14, 14, 17, 0.72);
  color: rgba(228, 225, 230, 0.88);
  cursor: pointer;
}

.locale-current {
  min-width: 72px;
  color: rgba(228, 225, 230, 0.76);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  text-align: left;
}

.locale-chevron {
  transition: transform 0.18s ease;

  &.open {
    transform: rotate(180deg);
  }
}

.locale-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 50;
  display: grid;
  min-width: 180px;
  padding: 6px;
  border: 1px solid rgba(58, 73, 74, 0.6);
  border-radius: 8px;
  background: rgba(19, 19, 22, 0.98);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42);
}

.locale-menu-item {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(228, 225, 230, 0.92);
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover,
  &.active {
    background: rgba(53, 52, 56, 0.8);
    color: var(--cyan-soft);
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.pulse-dot {
  color: #10b981;
  fill: currentColor;
  animation: pulse 1.8s infinite;
}
</style>
