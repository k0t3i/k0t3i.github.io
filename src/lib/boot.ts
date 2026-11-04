/** sessionStorage key: the board has powered on once in this session (tab). */
export const BOOT_KEY = 'k0t3i.booted';

/** How long the power-on of the board lasts: motion.css draws all of it within this time. */
export const BOOT_MS = 1200;

/** The standby of the head script ends by itself after this long, should the app not have mounted. */
export const STANDBY_MS = 2000;

/**
 * Part of the inline head script (lib/theme.ts), run before the first paint. On the first visit of
 * the session, with motion allowed, it puts the board in standby (data-boot on <html>): from the
 * first paint the screen of DISP1 is dark and LED1 is off (motion.css), so the power-on that follows
 * once the app has mounted (useBoot.ts) never hides anything that was already drawn. Should the app
 * not have taken the standby over within STANDBY_MS, the standby ends by itself, the board is simply
 * at rest, and the session counts as booted: an app that mounts later, and the next page, find no
 * standby and never show the dark screen again.
 * Its own try (and one for the key): a storage that throws leaves the board at rest, and the rest of
 * the script runs.
 */
export const STANDBY_SNIPPET: string =
  'try{if(!sessionStorage.getItem("' +
  BOOT_KEY +
  '")&&matchMedia("(prefers-reduced-motion: no-preference)").matches){var b=document.documentElement;' +
  'b.dataset.boot="";setTimeout(function(){if("boot"in b.dataset){delete b.dataset.boot;' +
  'try{sessionStorage.setItem("' +
  BOOT_KEY +
  '","1")}catch(e){}}},' +
  STANDBY_MS +
  ')}}catch(e){}';
