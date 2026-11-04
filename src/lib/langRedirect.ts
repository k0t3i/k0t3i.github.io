import type { Locale } from '../content/types';

export type RedirectInput = { languages: readonly string[]; saved: string | null; userAgent: string };

/** The key of the saved choice of language, read by the redirect of "/". */
export const LANG_KEY = 'k0t3i.lang';

/** A click on a link to a language is a choice: it is remembered, and the redirect of "/" then respects it. */
export function rememberLang(lang: Locale): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Storage can be blocked; the link still works.
  }
}

/**
 * Where to send a visitor of "/": "/en/" or null (stay). It is serialised with toString()
 * into an inline script, so it must not use anything defined outside of it.
 */
export function decideRedirect(input: RedirectInput): '/en/' | null {
  if (/bot|crawl|spider|slurp|lighthouse/i.test(input.userAgent)) return null;
  if (input.saved === 'fr') return null;
  if (input.saved === 'en') return '/en/';
  const first = input.languages.map((l) => l.toLowerCase()).find((l) => l.startsWith('fr') || l.startsWith('en'));
  return first !== undefined && first.startsWith('fr') ? null : '/en/';
}

/** Self-contained inline script: reads the saved choice and the browser, then replaces the location. */
export const REDIRECT_SNIPPET: string =
  '(function(){try{var d=(' +
  decideRedirect.toString() +
  `);var r=d({languages:navigator.languages||[],saved:localStorage.getItem(${JSON.stringify(LANG_KEY)}),userAgent:navigator.userAgent});` +
  'if(r)location.replace(r+location.search+location.hash)}catch(e){}})()';
