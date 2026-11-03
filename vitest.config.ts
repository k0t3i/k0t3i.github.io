import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  define: { __BUILD_DATE__: JSON.stringify('2026-11-03T00:00:00.000Z') },
  test: { environment: 'happy-dom', include: ['tests/unit/**/*.spec.ts'], passWithNoTests: true },
});
