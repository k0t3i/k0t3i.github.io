import type { RouteRecordRaw } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import type { Locale } from '../content/types';

declare module 'vue-router' {
  interface RouteMeta {
    locale?: Locale;
  }
}

/**
 * GitHub Pages also serves the file of each folder at its own address (/index.html, /en/index.html):
 * the same prerendered page, so the same route (an alias keeps the address), never the 404's.
 */
export const routes: RouteRecordRaw[] = [
  { path: '/', alias: '/index.html', component: HomeView, meta: { locale: 'fr' } },
  { path: '/en/', alias: '/en/index.html', component: HomeView, meta: { locale: 'en' } },
  { path: '/:pathMatch(.*)*', component: NotFoundView },
];
