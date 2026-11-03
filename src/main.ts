import { ViteSSG } from 'vite-ssg';
import App from './App.vue';
import { routes } from './router/routes';
// In cascade order: tokens.css declares the layers, the others fill them.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/board.css';
import './styles/parts.css';
import './styles/sheets.css';
import './styles/wide.css';
import './styles/back.css';
import './styles/depth.css';
import './styles/motion.css';
import './styles/modes.css';

export const createApp = ViteSSG(App, { routes, base: import.meta.env.BASE_URL });
