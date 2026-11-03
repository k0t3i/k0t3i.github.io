import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // Absolute URLs such as /img/avatar.png are public files, kept as written (as in the build).
  plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
  define: { __BUILD_DATE__: JSON.stringify('2026-11-03T00:00:00.000Z'), __BACK_VARIANT__: JSON.stringify('bom') },
  // As in the build: an asset imported with ?url is a URL, never inlined.
  build: { assetsInlineLimit: 0 },
  test: { environment: 'happy-dom', include: ['tests/unit/**/*.spec.ts'], passWithNoTests: true },
});
