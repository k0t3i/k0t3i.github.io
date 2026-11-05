// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEYPAD_FLOW } from '../../src/circuit/keypad';

/*
 * The stylesheet of the test keypad (styles/keypad.css): the places of its keys come from
 * circuit/keypad.ts (set by TestKeypad.vue); it writes only the cell of the flowing board, the one
 * of the module, and no coordinate of its own.
 */
const css = readFileSync(new URL('../../src/styles/keypad.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the stylesheet of the test keypad', () => {
  it('sizes the block of the flowing board in the cells of the module', () => {
    const block = css.match(/\.keypad \{([^}]*)\}/)?.[1] ?? '';
    expect(block).toContain(`--cell: ${KEYPAD_FLOW.cell};`);
    expect(block).toContain(`--cols: ${KEYPAD_FLOW.w};`);
  });

  it('places the keys from the custom properties set from the module only', () => {
    const wide = css.slice(css.indexOf('@layer wide'), css.indexOf('@layer motion'));
    // Front units: --kx, --ky, --kw, --kh, --x, --y, --hit, and the origin of DISP1 (wide.css).
    expect(wide.match(/\b\d{3,4}\b/g)).toBeNull();
    for (const v of ['--kx', '--ky', '--kw', '--kh', '--x', '--y', '--hit', '--disp-x', '--disp-y']) expect(wide).toContain(`var(${v})`);
  });
});
