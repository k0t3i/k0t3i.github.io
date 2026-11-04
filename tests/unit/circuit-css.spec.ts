// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import LIVE from '../../src/circuit/live.json';
import { CIRCUIT } from '../../src/circuit/layout';

/* The stylesheet of the back face places the eleven parts where the circuit does, and lets the art show through them. */
const css = readFileSync(new URL('../../src/styles/back.css', import.meta.url), 'utf8');
const vars = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(-?\d+);/g)].map(([, k, v]) => [k, Number(v)]));

describe('the stylesheet of the back face', () => {
  it('places each part at its box in the layout, and the window of the flowing board on the circuit', () => {
    for (const p of LIVE.parts) {
      const block = css.match(new RegExp(String.raw`\.back-part\[data-ref="${p.ref}"\] \{([^}]*)\}`))?.[1] ?? '';
      const [x, y, w, h] = p.box;
      expect(vars(block), p.ref).toEqual({ x, y, w, h });
    }
    const view = vars(css.match(/\.back__circuit \{([^}]*)\}/)?.[1] ?? '');
    expect(view).toEqual({ 'view-x': CIRCUIT.x, 'view-y': CIRCUIT.y, 'view-w': CIRCUIT.w, 'view-h': CIRCUIT.h });
  });

  it('draws the parts without a body: their bodies and markings are in the art under them', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(/\.back-part \.pcb-body \{\s*fill: none;\s*\}/);
  });
});
