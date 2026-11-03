import { useHead } from '@unhead/vue';
import { toValue, type MaybeRefOrGetter } from 'vue';
import { SITE } from '../content/site';
import type { SiteContent } from '../content/types';
import { REDIRECT_SNIPPET } from '../lib/langRedirect';

const KNOWS_ABOUT = ['Front-end development', 'Web accessibility', 'Web performance', 'Software architecture', 'Debugging'];

/** `<` is escaped so that no string of the data can close the script element. */
const json = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

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
        { name: 'theme-color', content: '#0c0d0f' },
        { name: 'color-scheme', content: 'dark' },
      ],
      link: [
        { rel: 'canonical', href: url },
        { rel: 'alternate', hreflang: 'fr', href: SITE.baseUrl },
        { rel: 'alternate', hreflang: 'en', href: `${SITE.baseUrl}en/` },
        { rel: 'alternate', hreflang: 'x-default', href: SITE.baseUrl },
      ],
      script: [
        { type: 'application/ld+json', innerHTML: json(jsonLd) },
        // Prerender only: the client bundle is minified, so its copy of the snippet would have another
        // hash than the one in the CSP. scripts/postbuild.mjs moves this script right after the CSP.
        ...(content.locale === 'fr' && import.meta.env.SSR
          ? [{ innerHTML: REDIRECT_SNIPPET, tagPriority: 'critical' as const, 'data-critical': '' }]
          : []),
      ],
    };
  });
}
