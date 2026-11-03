import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // The date of the build: the prerender and the first client render both show the uptime of this day.
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
  build: { assetsInlineLimit: 0 },
  ssgOptions: {
    dirStyle: 'nested',
    // 404 is moved to dist/404.html by scripts/postbuild.mjs.
    includedRoutes: () => ['/', '/en/', '/404'],
  },
});
