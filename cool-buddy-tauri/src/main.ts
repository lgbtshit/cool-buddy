import './lib/desktop-api';
import './assets/main.scss';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useSshConsoleStore } from './stores/ssh-console';

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);

const store = useSshConsoleStore(pinia);

window.addEventListener('error', (event) => {
  store.addDiagnosticEntry({
    level: 'error',
    source: 'frontend',
    message: event.message || 'Unhandled frontend error',
    details: event.error instanceof Error ? event.error.stack || event.error.message : String(event.error ?? event.message)
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  store.addDiagnosticEntry({
    level: 'error',
    source: 'frontend',
    message: 'Unhandled promise rejection',
    details: reason instanceof Error ? reason.stack || reason.message : String(reason)
  });
});

window.addEventListener('cool-buddy:diagnostic', (event) => {
  const detail = (event as CustomEvent<{
    level: 'info' | 'warning' | 'error';
    source: 'frontend' | 'backend' | 'backend-host' | 'bridge' | 'rust' | 'unknown';
    message: string;
    details: string;
    timestamp?: string;
  }>).detail;

  if (!detail) {
    return;
  }

  store.addDiagnosticEntry(detail);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'i')) {
    event.preventDefault();
    void window.api.app.openDevtools();
  }
});

app.mount('#app');
