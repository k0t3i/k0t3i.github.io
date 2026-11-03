import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { decideRedirect, REDIRECT_SNIPPET } from '../../src/lib/langRedirect';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36';
const decide = (languages: string[], saved: string | null = null, userAgent = CHROME) =>
  decideRedirect({ languages, saved, userAgent });

describe('decideRedirect', () => {
  it('sends English browsers to /en/', () => expect(decide(['en-US'])).toBe('/en/'));
  it('keeps French browsers', () => expect(decide(['fr-FR'])).toBeNull());
  it('sends other languages to /en/', () => expect(decide(['de-DE'])).toBe('/en/'));
  it('takes the first fr or en language', () => expect(decide(['de-DE', 'fr'])).toBeNull());
  it('lets a saved fr win over the browser', () => expect(decide(['en-US'], 'fr')).toBeNull());
  it('lets a saved en win over the browser', () => expect(decide(['fr-FR'], 'en')).toBe('/en/'));
  it('ignores an unknown saved value', () => expect(decide(['fr-FR'], 'de')).toBeNull());
  it('never redirects Googlebot', () =>
    expect(decide(['en-US'], null, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBeNull());
  it('never redirects Lighthouse', () =>
    expect(decide(['en-US'], null, 'Mozilla/5.0 Chrome-Lighthouse')).toBeNull());
});

describe('REDIRECT_SNIPPET', () => {
  function run(languages: string[], saved: string | null, search = '', hash = ''): string[] {
    const replaced: string[] = [];
    runInNewContext(REDIRECT_SNIPPET, {
      navigator: { languages, userAgent: CHROME },
      localStorage: { getItem: (key: string) => (key === 'k0t3i.lang' ? saved : null) },
      location: { search, hash, replace: (url: string) => replaced.push(url) },
    });
    return replaced;
  }

  it('does not close a script element early', () => expect(REDIRECT_SNIPPET).not.toMatch(/<\/script/i));
  it('replaces the location and keeps the query and the hash', () =>
    expect(run(['en-GB'], null, '?a=1', '#x')).toEqual(['/en/?a=1#x']));
  it('does nothing for French', () => expect(run(['fr-FR'], null)).toEqual([]));
  it('reads the saved language', () => expect(run(['fr-FR'], 'en')).toEqual(['/en/']));
  it('swallows errors', () => {
    expect(() => runInNewContext(REDIRECT_SNIPPET, {})).not.toThrow();
  });
});
