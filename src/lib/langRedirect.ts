export type RedirectInput = { languages: readonly string[]; saved: string | null; userAgent: string };

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
  ');var r=d({languages:navigator.languages||[],saved:localStorage.getItem("k0t3i.lang"),userAgent:navigator.userAgent});' +
  'if(r)location.replace(r+location.search+location.hash)}catch(e){}})()';
