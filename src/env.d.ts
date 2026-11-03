/** ISO date of the build, injected by `define` in vite.config.ts (and vitest.config.ts). */
declare const __BUILD_DATE__: string;

/** The variant of the back side built into the page (vite.config.ts, from BACK_VARIANT). */
declare const __BACK_VARIANT__: 'bom' | 'populated';
