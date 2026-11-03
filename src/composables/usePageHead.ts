import { useHead } from '@unhead/vue';
import { toValue, type MaybeRefOrGetter } from 'vue';
import { SITE } from '../content/site';
import type { SiteContent } from '../content/types';
import { REDIRECT_SNIPPET } from '../lib/langRedirect';
import { THEME_SNIPPET } from '../lib/theme';
// ?url gives the hashed URL of the build, the same one fonts.css points to: the preload is reused.
import hankenUrl from '../assets/fonts/hanken-grotesk.woff2?url';
import monoUrl from '../assets/fonts/jetbrains-mono.woff2?url';

const KNOWS_ABOUT = ['Front-end development', 'Web accessibility', 'Web performance', 'Software architecture', 'Debugging'];

/** `<` is escaped so that no string of the data can close the script element. */
const json = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

/**
 * Head of every page (App.vue): the page follows the device scheme, and the theme script sets a saved
 * choice before the first paint. scripts/postbuild.mjs moves the data-critical scripts right after the
 * CSP: the theme, then the redirect.
 *
 * Prerender only, and never changed afterwards:
 * - the client bundle is minified, so its copy of the snippet would have another hash than the CSP's;
 * - the client cannot claim the two keyed theme-color metas of the prerender (unhead writes no
 *   data-hid on a meta), so it would add them a second time.
 */
export function useThemeHead(): void {
  if (!import.meta.env.SSR) return;
  useHead({
    meta: [
      { name: 'color-scheme', content: 'light dark' },
      // The page colour of each board, for the browser chrome. A key keeps both: unhead dedupes by name.
      { key: 'theme-color-light', name: 'theme-color', content: '#eceae3', media: '(prefers-color-scheme: light)' },
      { key: 'theme-color-dark', name: 'theme-color', content: '#08090a', media: '(prefers-color-scheme: dark)' },
    ],
    script: [{ innerHTML: THEME_SNIPPET, tagPriority: 'critical', 'data-critical': 'theme' }],
  });
}

/**
 * SEO head of a home page: title, description, canonical, hreflang, JSON-LD and, on the French
 * page only, the language redirect. The icons are in index.html, shared with the 404 page.
 */
export function usePageHead(source: MaybeRefOrGetter<SiteContent>): void {
  useHead(() => {
    const content = toValue(source);
    const url = content.locale === 'fr' ? SITE.baseUrl : `${SITE.baseUrl}en/`;
    const jobTitle = content.meta.title.split(' · ')[1] ?? content.meta.title;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url,
      inLanguage: content.locale,
      mainEntity: {
        '@type': 'Person',
        name: 'Anthony',
        jobTitle,
        url: SITE.baseUrl,
        sameAs: [SITE.github],
        worksFor: { '@type': 'Organization', name: 'Fircosoft' },
        knowsAbout: KNOWS_ABOUT,
      },
    };
    return {
      htmlAttrs: { lang: content.locale },
      title: content.meta.title,
      meta: [
        { name: 'description', content: content.meta.description },
      ],
      link: [
        // Both faces are on the first screen (title and silkscreen). Fonts are always fetched in CORS mode.
        ...[hankenUrl, monoUrl].map((href) => ({ rel: 'preload', as: 'font', type: 'font/woff2', href, crossorigin: '' }) as const),
        { rel: 'canonical', href: url },
        { rel: 'alternate', hreflang: 'fr', href: SITE.baseUrl },
        { rel: 'alternate', hreflang: 'en', href: `${SITE.baseUrl}en/` },
        { rel: 'alternate', hreflang: 'x-default', href: SITE.baseUrl },
      ],
      script: [
        { type: 'application/ld+json', innerHTML: json(jsonLd) },
        // Prerender only, as the theme script (see useThemeHead).
        ...(content.locale === 'fr' && import.meta.env.SSR
          ? [{ innerHTML: REDIRECT_SNIPPET, tagPriority: 'critical' as const, 'data-critical': 'redirect' }]
          : []),
      ],
    };
  });
}
