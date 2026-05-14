import { computed } from 'vue';
import { localeLabels, localeOptions } from '../shared/locale';
import { useSshConsoleStore } from '../stores/ssh-console';

export function useAppCopy() {
  const store = useSshConsoleStore();

  return {
    locale: computed(() => store.locale),
    localeLabel: computed(() => localeLabels[store.locale]),
    localeOptions,
    t: store.t
  };
}
