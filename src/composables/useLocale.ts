import { computed, type ComputedRef } from 'vue';
import { useRoute } from 'vue-router';
import { en } from '../content/en';
import { fr } from '../content/fr';
import type { Locale, SiteContent } from '../content/types';

/** The language of the page comes from the route (French when the route has none, as for the 404). */
export function useLocale(): { locale: ComputedRef<Locale>; content: ComputedRef<SiteContent> } {
  const route = useRoute();
  const locale = computed<Locale>(() => route.meta.locale ?? 'fr');
  const content = computed(() => (locale.value === 'en' ? en : fr));
  return { locale, content };
}
