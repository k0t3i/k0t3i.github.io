import { onBeforeUnmount, onMounted, readonly, ref, type Ref } from 'vue';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the visitor asks for reduced motion, kept in sync with the device setting. It is true on
 * the server and until the component mounts: an effect driven by JavaScript stays off until it is
 * known to be welcome. CSS motion does not need this, it lives under the media query itself.
 */
export function useReducedMotion(): Readonly<Ref<boolean>> {
  const reduced = ref(true);
  let media: MediaQueryList | undefined;
  const update = (event: MediaQueryListEvent): void => {
    reduced.value = event.matches;
  };
  onMounted(() => {
    media = matchMedia(QUERY);
    reduced.value = media.matches;
    media.addEventListener('change', update);
  });
  onBeforeUnmount(() => media?.removeEventListener('change', update));
  return readonly(reduced);
}
