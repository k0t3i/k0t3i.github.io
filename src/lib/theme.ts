/** The two boards: the green one on a light page (default), and the matte black one. */
export type Theme = 'green' | 'dark';

/** localStorage key of the visitor's choice, made with JP1. */
export const THEME_KEY = 'k0t3i.theme';

/**
 * The board to show: the saved choice when there is one, else the device scheme. It is serialised
 * with toString() into an inline script, so it must not use anything defined outside of it.
 */
export function resolveTheme(input: { saved: string | null; prefersDark: boolean }): Theme {
  if (input.saved === 'green' || input.saved === 'dark') return input.saved;
  return input.prefersDark ? 'dark' : 'green';
}

/**
 * Self-contained inline script of the head, run before the first paint. First it sets data-js on
 * <html>: the page has JavaScript, so the two faces of the board are stacked from the first paint
 * (depth.css), and the page never shows the back face below the front one, then takes it away.
 * Then it sets data-theme only when a choice is saved (resolveTheme then returns that choice):
 * without one, the CSS follows the device scheme by itself, which also holds without JavaScript.
 */
export const THEME_SNIPPET: string =
  '(function(){try{document.documentElement.dataset.js="";var r=(' +
  resolveTheme.toString() +
  ');var s=localStorage.getItem("' +
  THEME_KEY +
  '");if(r({saved:s,prefersDark:matchMedia("(prefers-color-scheme: dark)").matches})===s)' +
  'document.documentElement.dataset.theme=s}catch(e){}})()';
