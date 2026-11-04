import { useHead } from '@unhead/vue';
import { toValue, type MaybeRefOrGetter } from 'vue';
import { SITE } from '../content/site';
import type { Locale, SiteContent } from '../content/types';
import { REDIRECT_SNIPPET } from '../lib/langRedirect';
import { THEME_SNIPPET } from '../lib/theme';
// ?url gives the hashed URL of the build, the same one fonts.css points to: the preload is reused.
import hankenUrl from '../assets/fonts/hanken-grotesk.woff2?url';
import monoUrl from '../assets/fonts/jetbrains-mono.woff2?url';
// The art of the wide board: the same hashed file as the background of wide.css.
import artUrl from '../assets/img/board-wide.svg?url';

const KNOWS_ABOUT = ['Front-end development', 'Web accessibility', 'Web performance', 'Software architecture', 'Debugging'];

/** The locale of a link preview (Open Graph): language and territory. */
const OG_LOCALE: Record<Locale, string> = { fr: 'fr_FR', en: 'en_GB' };

/**
 * The preview of a shared link: the green board of this language, captured by scripts/og.mjs.
 * Absolute URLs, as crawlers need them. og:image comes before its structured properties.
 */
function linkPreview(content: SiteContent, url: string): { property?: string; name?: string; content: string }[] {
  const other: Locale = content.locale === 'fr' ? 'en' : 'fr';
  return [
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: content.meta.title },
    { property: 'og:description', content: content.meta.description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: `${SITE.baseUrl}img/og-${content.locale}.jpg` },
    { property: 'og:image:type', content: 'image/jpeg' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: content.meta.ogImageAlt },
    { property: 'og:locale', content: OG_LOCALE[content.locale] },
    { property: 'og:locale:alternate', content: OG_LOCALE[other] },
    // X reads the Open Graph tags above; this one asks for the large image.
    { name: 'twitter:card', content: 'summary_large_image' },
  ];
}

/** `<` is escaped so that no string of the data can close the script element. */
const json = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

/** The page as structured data (JSON-LD): the profile page of a person. */
function profilePage(content: SiteContent, url: string): string {
  const jobTitle = content.meta.title.split(' · ')[1] ?? content.meta.title;
  return json({
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
  });
}

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
 * SEO head of a home page: title, description, link preview (Open Graph, with the Twitter card),
 * canonical, hreflang, JSON-LD and, on the French page only, the language redirect. The icons are
 * in index.html, shared with the 404 page.
 * The link preview and the structured data are in the prerender only (about 450 B less JavaScript):
 * the crawlers and the services that read them fetch each address, and none switches the language in
 * the page. The client leaves these tags as served: after such a switch, they still describe the
 * address that was loaded. The title, the language, the description, the canonical and hreflang follow it.
 */
export function usePageHead(source: MaybeRefOrGetter<SiteContent>): void {
  useHead(() => {
    const content = toValue(source);
    const url = content.locale === 'fr' ? SITE.baseUrl : `${SITE.baseUrl}en/`;
    return {
      htmlAttrs: { lang: content.locale },
      title: content.meta.title,
      meta: [
        { name: 'description', content: content.meta.description },
        ...(import.meta.env.SSR ? linkPreview(content, url) : []),
      ],
      link: [
        // Both faces are on the first screen (title and silkscreen). Fonts are always fetched in CORS mode.
        ...[hankenUrl, monoUrl].map((href) => ({ rel: 'preload', as: 'font', type: 'font/woff2', href, crossorigin: '' }) as const),
        // The board is the first screen from 79rem: its art is fetched with the stylesheet, not after it.
        { rel: 'preload', as: 'image', type: 'image/svg+xml', href: artUrl, media: '(min-width: 79rem)' },
        { rel: 'canonical', href: url },
        { rel: 'alternate', hreflang: 'fr', href: SITE.baseUrl },
        { rel: 'alternate', hreflang: 'en', href: `${SITE.baseUrl}en/` },
        { rel: 'alternate', hreflang: 'x-default', href: SITE.baseUrl },
      ],
      // Prerender only: the structured data, as the link preview; the redirect, as the theme script (see useThemeHead).
      script: import.meta.env.SSR
        ? [
            { type: 'application/ld+json', innerHTML: profilePage(content, url) },
            ...(content.locale === 'fr' ? [{ innerHTML: REDIRECT_SNIPPET, tagPriority: 'critical' as const, 'data-critical': 'redirect' }] : []),
          ]
        : [],
    };
  });
}
