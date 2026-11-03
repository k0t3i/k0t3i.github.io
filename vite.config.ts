import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * The back side of the board is built in one of two variants, for comparison (the other one is
 * dropped later): `bom`, a bill of materials (the default), or `populated`, a dense decorative side.
 *   BACK_VARIANT=populated npm run build
 * DIST_DIR builds into another folder (the e2e suite serves the populated variant next to dist/).
 */
const BACK_VARIANTS = ['bom', 'populated'];
const backVariant = process.env.BACK_VARIANT || 'bom';
if (!BACK_VARIANTS.includes(backVariant)) {
  throw new Error(`BACK_VARIANT must be one of ${BACK_VARIANTS.join(', ')}, not "${backVariant}"`);
}

export default defineConfig({
  plugins: [vue()],
  define: {
    // The date of the build: the prerender and the first client render both show the uptime of this day.
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BACK_VARIANT__: JSON.stringify(backVariant),
  },
  build: { assetsInlineLimit: 0, outDir: process.env.DIST_DIR || 'dist' },
  ssgOptions: {
    dirStyle: 'nested',
    // 404 is moved to dist/404.html by scripts/postbuild.mjs.
    includedRoutes: () => ['/', '/en/', '/404'],
  },
});
