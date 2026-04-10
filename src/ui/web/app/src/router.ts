import { defineAsyncComponent, h, type Component } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import BootEntryPage from './pages/BootEntryPage.vue';
import { getCurrentUiLocale, resolveUiLocaleFromQuery, setCurrentUiLocale } from './lib/i18n';
import { translateUiText } from '../../../text.js';

const pageModules = import.meta.glob('./pages/*.vue');

type RouteTitleKey =
  | 'route.openingWorkbench'
  | 'route.overview'
  | 'route.projects'
  | 'route.projectDetail'
  | 'route.skills'
  | 'route.presets'
  | 'route.presetDetail'
  | 'route.config'
  | 'route.notFound';

function createMissingPage(labelKey: RouteTitleKey): Component {
  return {
    name: `${labelKey}MissingPage`,
    setup() {
      return () =>
        h('section', { class: 'panel' }, [
          h('p', { class: 'field-label' }, translateUiText(getCurrentUiLocale(), labelKey)),
          h(
            'h3',
            { class: 'mt-2 font-display text-2xl text-charcoal' },
            translateUiText(getCurrentUiLocale(), 'router.missing.notReady', {
              label: translateUiText(getCurrentUiLocale(), labelKey),
            }),
          ),
          h(
            'p',
            { class: 'mt-2 text-sm text-muted' },
            translateUiText(getCurrentUiLocale(), 'router.missing.autoAppear'),
          ),
        ]);
    },
  };
}

function loadWorkspacePage(fileName: string, fallbackLabelKey: RouteTitleKey): Component {
  const loader = pageModules[`./pages/${fileName}.vue`] as undefined | (() => Promise<unknown>);
  return defineAsyncComponent(async () => {
    if (!loader) {
      return createMissingPage(fallbackLabelKey);
    }

    const module = (await loader()) as { default?: Component };
    return module.default ?? createMissingPage(fallbackLabelKey);
  });
}

const NotFoundPage: Component = {
  name: 'NotFoundPage',
  setup() {
    return () =>
      h('section', { class: 'panel' }, [
        h('p', { class: 'field-label' }, translateUiText(getCurrentUiLocale(), 'router.notFound.label')),
        h('h3', { class: 'mt-2 font-display text-2xl text-charcoal' }, translateUiText(getCurrentUiLocale(), 'router.notFound.title')),
        h(
          'p',
          { class: 'mt-2 text-sm text-muted' },
          translateUiText(getCurrentUiLocale(), 'router.notFound.description'),
        ),
      ]);
  },
};

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: BootEntryPage, meta: { titleKey: 'route.openingWorkbench' satisfies RouteTitleKey, navKey: null } },
    { path: '/dashboard', redirect: '/overview' },
    {
      path: '/overview',
      component: loadWorkspacePage('OverviewPage', 'route.overview'),
      meta: { titleKey: 'route.overview' satisfies RouteTitleKey, navKey: 'overview' },
    },
    {
      path: '/projects',
      component: loadWorkspacePage('ProjectsPage', 'route.projects'),
      meta: { titleKey: 'route.projects' satisfies RouteTitleKey, navKey: 'projects' },
    },
    {
      path: '/projects/:projectId',
      component: loadWorkspacePage('ProjectDetailPage', 'route.projectDetail'),
      props: true,
      meta: { titleKey: 'route.projectDetail' satisfies RouteTitleKey, navKey: 'projects' },
    },
    {
      path: '/skills',
      component: loadWorkspacePage('SkillsPage', 'route.skills'),
      meta: { titleKey: 'route.skills' satisfies RouteTitleKey, navKey: 'skills' },
    },
    {
      path: '/presets',
      component: loadWorkspacePage('PresetsPage', 'route.presets'),
      meta: { titleKey: 'route.presets' satisfies RouteTitleKey, navKey: 'presets' },
    },
    {
      path: '/presets/:presetName',
      component: loadWorkspacePage('PresetDetailPage', 'route.presetDetail'),
      props: true,
      meta: { titleKey: 'route.presetDetail' satisfies RouteTitleKey, navKey: 'presets' },
    },
    {
      path: '/config',
      component: loadWorkspacePage('ConfigPage', 'route.config'),
      meta: { titleKey: 'route.config' satisfies RouteTitleKey, navKey: 'config' },
    },
    {
      path: '/:pathMatch(.*)*',
      component: NotFoundPage,
      meta: { titleKey: 'route.notFound' satisfies RouteTitleKey, navKey: null },
    },
  ],
});

router.beforeEach((to, from) => {
  const nextLocale = resolveUiLocaleFromQuery(to.query.lang ?? from.query.lang ?? getCurrentUiLocale());
  setCurrentUiLocale(nextLocale);
  return true;
});
