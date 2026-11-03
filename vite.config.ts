import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: { assetsInlineLimit: 0 },
  ssgOptions: {
    dirStyle: 'nested',
    // 404 is moved to dist/404.html by scripts/postbuild.mjs.
    includedRoutes: () => ['/', '/en/', '/404'],
  },
});
