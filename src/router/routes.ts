import type { RouteRecordRaw } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import type { Locale } from '../content/types';

declare module 'vue-router' {
  interface RouteMeta {
    locale?: Locale;
  }
}

export const routes: RouteRecordRaw[] = [
  { path: '/', component: HomeView, meta: { locale: 'fr' } },
  { path: '/en/', component: HomeView, meta: { locale: 'en' } },
  { path: '/:pathMatch(.*)*', component: NotFoundView },
];
