import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // Absolute URLs such as /img/avatar.png are public files, kept as written (as in the build).
  plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
  define: { __BUILD_DATE__: JSON.stringify('2026-11-03T00:00:00.000Z') },
  test: { environment: 'happy-dom', include: ['tests/unit/**/*.spec.ts'], passWithNoTests: true },
});
