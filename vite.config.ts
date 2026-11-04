import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  define: {
    // The date of the build: the prerender and the first client render both show the uptime of this day.
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    // Every component is a <script setup>, and vue-router, vite-ssg and @unhead/vue use setup() only:
    // Vue is built without its Options API (data, methods, mixins...), 1.6 KB gzip less.
    __VUE_OPTIONS_API__: false,
  },
  // DIST_DIR builds into another folder than dist/ (scripts/postbuild.mjs and scripts/serve.mjs read it too).
  build: { assetsInlineLimit: 0, outDir: process.env.DIST_DIR || 'dist' },
  ssgOptions: {
    dirStyle: 'nested',
    // 404 is moved to dist/404.html by scripts/postbuild.mjs.
    includedRoutes: () => ['/', '/en/', '/404'],
  },
});
