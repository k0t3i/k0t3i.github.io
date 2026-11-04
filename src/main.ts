import { ViteSSG } from 'vite-ssg';
import App from './App.vue';
import { routes } from './router/routes';
// In cascade order: tokens.css declares the layers, the others fill them.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/board.css';
import './styles/open.css';
import './styles/parts.css';
import './styles/sheets.css';
import './styles/wide.css';
import './styles/back.css';
import './styles/depth.css';
import './styles/motion.css';
import './styles/modes.css';

/*
 * hydration: the client takes over the prerendered page as it is, nodes and all. Without it vite-ssg
 * mounts a new app over it: the whole page is drawn a second time, and what the visitor did before
 * (a sheet open, the focus) is lost.
 */
export const createApp = ViteSSG(App, { routes, base: import.meta.env.BASE_URL }, undefined, { hydration: true });
