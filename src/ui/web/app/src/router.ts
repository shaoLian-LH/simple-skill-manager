import { createRouter, createWebHistory } from 'vue-router';

import BootEntryPage from './pages/BootEntryPage.vue';
import ConfigPage from './pages/ConfigPage.vue';
import DashboardPage from './pages/DashboardPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import PresetsPage from './pages/PresetsPage.vue';
import ProjectDetailPage from './pages/ProjectDetailPage.vue';
import ProjectsPage from './pages/ProjectsPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: BootEntryPage },
    { path: '/dashboard', component: DashboardPage },
    { path: '/projects', component: ProjectsPage },
    { path: '/projects/:projectId', component: ProjectDetailPage, props: true },
    { path: '/presets', component: PresetsPage },
    { path: '/config', component: ConfigPage },
    { path: '/:pathMatch(.*)*', component: NotFoundPage },
  ],
});
