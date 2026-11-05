import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TestKeypad from '../../src/components/TestKeypad.vue';
import { fr } from '../../src/content/fr';
import { adoptKeypadPlaces } from '../../src/lib/keypadPlaces';

/*
 * An engine without constructed stylesheets (the review of Task 18): the places of the keys cannot be
 * adopted, so the keypad stays a drawing, as without JavaScript: its group of buttons stays hidden,
 * no button is announced where it would not sit on its switch. A file of its own: the places are
 * adopted once per document, and no other test of this module state may have adopted them before.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('the test keypad without constructed stylesheets', () => {
  it('cannot adopt its places, and keeps its group hidden: a drawing only', async () => {
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        constructor() {
          throw new TypeError('Illegal constructor');
        }
      },
    );
    expect(adoptKeypadPlaces(document)).toBe(false);
    const w = mount(TestKeypad, { props: { keypad: fr.display.keypad, game: false }, attachTo: document.body });
    await nextTick();
    expect(w.get('.keypad__keys').attributes('hidden')).toBeDefined();
    expect(w.findAll('.keypad__art use')).toHaveLength(6);
    w.unmount();
  });
});
