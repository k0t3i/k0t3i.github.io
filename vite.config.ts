import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/*
 * The date of the build: the prerender and the first client render both show the uptime of this day.
 * vite-ssg loads this file once per build (client, then server), and `npm run build` (scripts/build.mjs)
 * gives the same date to scripts/postbuild.mjs (the lastmod of the sitemap): the first load sets it, the
 * others read it.
 */
process.env.BUILD_DATE ??= new Date().toISOString();

export default defineConfig({
  plugins: [vue()],
  define: {
    __BUILD_DATE__: JSON.stringify(process.env.BUILD_DATE),
    // Every component is a <script setup>, and vue-router, vite-ssg and @unhead/vue use setup() only:
    // Vue is built without its Options API (data, methods, mixins...), 1.6 KB gzip less.
    __VUE_OPTIONS_API__: false,
  },
  // DIST_DIR builds into another folder than dist/ (scripts/postbuild.mjs and scripts/serve.mjs read it too).
  // No modulepreload polyfill (about 270 B gzip): every browser the site supports has modulepreload.
  build: { assetsInlineLimit: 0, modulePreload: { polyfill: false }, outDir: process.env.DIST_DIR || 'dist' },
  ssgOptions: {
    dirStyle: 'nested',
    // 404 is moved to dist/404.html by scripts/postbuild.mjs.
    includedRoutes: () => ['/', '/en/', '/404'],
  },
});
