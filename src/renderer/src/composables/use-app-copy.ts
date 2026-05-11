import { computed } from 'vue'
import { localeLabels } from '../i18n'
import { useSshConsoleStore } from '../stores/ssh-console'

export function useAppCopy() {
  const store = useSshConsoleStore()

  return {
    locale: computed(() => store.locale),
    localeLabel: computed(() => localeLabels[store.locale]),
    t: store.t
  }
}
