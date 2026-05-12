import { createRouter, createWebHashHistory } from 'vue-router';
import SshWorkbenchView from '../views/ssh-workbench/SshWorkbenchView.vue';

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
      component: SshWorkbenchView
    }
  ]
});
