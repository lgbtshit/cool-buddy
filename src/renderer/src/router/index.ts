import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/ssh-workbench'
    },
    {
      path: '/ssh-workbench',
      name: 'ssh-workbench',
      component: () => import('../views/ssh-workbench/SshWorkbenchView.vue')
    },
    {
      path: '/log-pane-window',
      name: 'log-pane-window',
      component: () => import('../views/log-pane-window/LogPaneWindowView.vue')
    }
  ]
});
