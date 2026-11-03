import { ViteSSG } from 'vite-ssg';
import App from './App.vue';
import { routes } from './router/routes';

export const createApp = ViteSSG(App, { routes, base: import.meta.env.BASE_URL });
