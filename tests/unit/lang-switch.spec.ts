import { mount } from '@vue/test-utils';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LangSwitch from '../../src/components/LangSwitch.vue';
import { fr } from '../../src/content/fr';

const page = { render: () => null };

async function routerAt(path: string): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: page },
      { path: '/en/', component: page },
    ],
  });
  await router.push(path);
  await router.isReady();
  return router;
}

/** A stub of document.startViewTransition that keeps the update callbacks, to run them later. */
function stubViewTransitions(): (() => Promise<void> | void)[] {
  const updates: (() => Promise<void> | void)[] = [];
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (update: () => Promise<void> | void) => {
      updates.push(update);
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: () => {} };
    },
  });
  return updates;
}

/** The device asks for reduced motion (or not). */
function prefersReduced(reduce: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

describe('LangSwitch', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition');
    vi.restoreAllMocks();
  });

  it('prerenders two links, the current language marked as the current page', async () => {
    const router = await routerAt('/');
    const app = createSSRApp({ render: () => h(LangSwitch, { nav: fr.langNav }) });
    app.use(router);
    const root = document.createElement('div');
    root.innerHTML = await renderToString(app);
    expect(root.querySelector('nav.lang')?.getAttribute('aria-label')).toBe('Langue');
    const links = [...root.querySelectorAll('nav.lang > a.lang__link')].map((a) =>
      ['href', 'hreflang', 'lang', 'aria-label', 'aria-current'].map((name) => a.getAttribute(name)).concat(a.textContent),
    );
    expect(links).toEqual([
      ['/', 'fr', 'fr', 'FR, Français', 'page', 'FR'],
      ['/en/', 'en', 'en', 'EN, English', null, 'EN'],
    ]);
  });

  it('switches the language in a view transition when motion is welcome', async () => {
    prefersReduced(false);
    const updates = stubViewTransitions();
    const router = await routerAt('/');
    const wrapper = mount(LangSwitch, { props: { nav: fr.langNav }, global: { plugins: [router] } });
    await wrapper.vm.$nextTick();
    await wrapper.get('a[hreflang="en"]').trigger('click');
    expect(localStorage.getItem('k0t3i.lang')).toBe('en');
    // Nothing changes before the transition has captured the page as it was.
    expect(updates).toHaveLength(1);
    expect(router.currentRoute.value.path).toBe('/');
    await updates[0]?.();
    expect(router.currentRoute.value.path).toBe('/en/');
    expect(wrapper.get('a[hreflang="en"]').attributes('aria-current')).toBe('page');
  });

  it('switches at once under reduced motion, or without view transitions', async () => {
    for (const withApi of [true, false]) {
      prefersReduced(withApi);
      const updates = withApi ? stubViewTransitions() : [];
      const router = await routerAt('/');
      const wrapper = mount(LangSwitch, { props: { nav: fr.langNav }, global: { plugins: [router] } });
      await wrapper.vm.$nextTick();
      await wrapper.get('a[hreflang="en"]').trigger('click');
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/en/'));
      expect(updates).toHaveLength(0);
      wrapper.unmount();
      vi.restoreAllMocks();
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  it('leaves a click with a modifier to the browser (new tab), and still remembers it', async () => {
    prefersReduced(false);
    const updates = stubViewTransitions();
    const router = await routerAt('/');
    const wrapper = mount(LangSwitch, { props: { nav: fr.langNav }, global: { plugins: [router] } });
    await wrapper.vm.$nextTick();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    wrapper.get('a[hreflang="en"]').element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(updates).toHaveLength(0);
    expect(router.currentRoute.value.path).toBe('/');
    expect(localStorage.getItem('k0t3i.lang')).toBe('en');
  });
});
