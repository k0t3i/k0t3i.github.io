// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOM_REFS, bomRows, capitalize, refRanges } from '../../src/circuit/bom';
import { BOM_LINKS } from '../../src/circuit/bomLinks';
import { linkedTo } from '../../src/circuit/links';
import { DEVICES } from '../../src/circuit/devices';
import { NETS, PARTS } from '../../src/circuit/netlist';
import { en } from '../../src/content/en';
import { fr } from '../../src/content/fr';

/*
 * The column « Relié à » of the bill of materials (spec 4.10), computed from the netlist: the real
 * signal links of a part, power and ground left out, the passives looked through, a device of a bus
 * linked to the chip only, the parts of the front face included.
 */

describe('the parts a part is linked to', () => {
  it('lists the eleven parts of the bill of materials, in the order of the table', () => {
    expect([...BOM_REFS]).toEqual(['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6']);
    for (const ref of BOM_REFS) expect(PARTS.find((p) => p.ref === ref)?.face, ref).toBe('back');
  });

  it('follows the signals of the netlist, power and ground left out (links.ts)', () => {
    expect(Object.fromEntries(BOM_REFS.map((ref) => [ref, linkedTo(ref)]))).toEqual({
      // J5 is reached through U13, a part of its own: the chip is linked to U13.
      U10: ['U11', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6', 'J7', 'R1', 'LED1', 'D1', 'U2', 'J1', 'J2', 'J3', 'J4', 'DISP1'],
      U11: ['U10'],
      // The regulator has only power pins: it is linked to the connector that feeds it.
      U12: ['J5'],
      // Through the flow-through ESD array to the receptacle.
      U13: ['U10', 'J5'],
      // The spec's own example: the chip, then the three inputs it reads.
      U14: ['U10', 'SW1', 'SW2', 'JP1'],
      U15: ['U10', 'D2', 'D3', 'D4', 'D5'],
      U16: ['U10', 'Y2'],
      U17: ['U10', 'J6'],
      U18: ['U10'],
      Y1: ['U10'],
      J6: ['U10', 'U17'],
    });
  });

  it('never names a passive of the back face, a power rail or the part itself', () => {
    for (const ref of BOM_REFS) {
      const linked = linkedTo(ref);
      expect(linked, ref).not.toContain(ref);
      expect(new Set(linked).size, ref).toBe(linked.length);
      for (const to of linked) {
        const p = PARTS.find((x) => x.ref === to);
        expect(p, to).toBeDefined();
        // A passive is looked through, unless it is a part of the front face (spec 4.10, R1 and D1).
        if (p && 'transparent' in DEVICES[p.dev]) expect(p.face, `${ref} names ${to}`).toBe('front');
      }
    }
  });

  it('links each pair of the table both ways, and a device of a bus to the chip only', () => {
    for (const a of BOM_REFS) for (const b of BOM_REFS) expect(linkedTo(a).includes(b), `${a} ${b}`).toBe(linkedTo(b).includes(a));
    // Every device of the I²C bus but the chip: the chip, never another device of the bus.
    const sda = NETS.find((n) => n.name === 'SDA');
    const onBus = [...new Set(sda?.pins.map((p) => p.split('.')[0] ?? ''))].filter((r) => r !== 'U10' && !r.startsWith('R'));
    expect(onBus.length).toBeGreaterThan(4);
    for (const ref of onBus) for (const other of onBus) expect(linkedTo(ref), `${ref} ${other}`).not.toContain(other);
  });

  it('follows the order of the parts in the netlist', () => {
    const order = PARTS.map((p) => p.ref);
    for (const ref of BOM_REFS) {
      const at = linkedTo(ref).map((r) => order.indexOf(r));
      expect(at, ref).toEqual([...at].sort((x, y) => x - y));
    }
  });
});

/** bomLinks.ts as it must be: the result of linkedTo() for each part of the table. */
const BOM_LINKS_FILE = new URL('../../src/circuit/bomLinks.ts', import.meta.url);
const bomLinksSource = (): string =>
  [
    '// Written by tests/unit/circuit-bom.spec.ts (UPDATE_BOM_LINKS=1 npx vitest run tests/unit/circuit-bom.spec.ts): never by hand.',
    '// The parts each part of the bill of materials is linked to, computed from the netlist (links.ts): the',
    '// page ships this, not the netlist.',
    "import type { BomRef } from './bom';",
    '',
    'export const BOM_LINKS: Readonly<Record<BomRef, readonly string[]>> = {',
    ...BOM_REFS.map((ref) => `  ${ref}: [${linkedTo(ref).map((r) => `'${r}'`).join(', ')}],`),
    '};',
    '',
  ].join('\n');

describe('the links the page ships', () => {
  it('are the links computed from the netlist, written by this test', () => {
    if (process.env.UPDATE_BOM_LINKS) writeFileSync(BOM_LINKS_FILE, bomLinksSource());
    expect(readFileSync(BOM_LINKS_FILE, 'utf8'), 'run UPDATE_BOM_LINKS=1 npx vitest run tests/unit/circuit-bom.spec.ts').toBe(bomLinksSource());
    for (const ref of BOM_REFS) expect(BOM_LINKS[ref]).toEqual(linkedTo(ref));
  });
});

describe('the ranges of references', () => {
  it('groups three references or more that follow each other', () => {
    expect(refRanges(['U11', 'U13', 'U14', 'U15', 'Y1', 'J6', 'J7', 'J1', 'J2', 'J3', 'DISP1'])).toEqual(['U11', 'U13–U15', 'Y1', 'J6', 'J7', 'J1–J3', 'DISP1']);
    expect(refRanges(['U10', 'D2', 'D3', 'D4', 'D5'])).toEqual(['U10', 'D2–D5']);
    expect(refRanges(['J1', 'J2'])).toEqual(['J1', 'J2']);
    expect(refRanges(['D1', 'DISP1', 'LED1'])).toEqual(['D1', 'DISP1', 'LED1']);
    expect(refRanges([])).toEqual([]);
  });
});

describe('the rows of the bill of materials', () => {
  it('capitalizes the first letter only', () => {
    expect(capitalize('régulateur 3,3 V')).toBe('Régulateur 3,3 V');
    expect(capitalize('équipe')).toBe('Équipe');
    expect(capitalize('Vue.js')).toBe('Vue.js');
    expect(capitalize('')).toBe('');
  });

  for (const content of [fr, en]) {
    it(`gives each row its two lines, its links and its accessible name from the same data (${content.locale})`, () => {
      const { bom } = content.back;
      const rows = bomRows(bom.rows);
      expect(rows.map((r) => r.ref)).toEqual([...BOM_REFS]);
      for (const [i, row] of rows.entries()) {
        const src = bom.rows[i];
        if (!src) throw new Error('no row');
        expect(row.part).toBe(capitalize(src.part));
        expect(row.skill).toBe(capitalize(src.skill));
        // In plain text: the soft hyphens and word joiners of the visible table are not read.
        expect(row.name).toBe(`${src.ref}, ${src.part}, ${src.skill}`.replace(/[­⁠]/g, ''));
        expect(row.name).not.toMatch(/[­⁠]/);
        expect(row.links).toEqual(linkedTo(src.ref));
        expect(row.linked).toEqual(refRanges(linkedTo(src.ref)));
      }
    });
  }

  it('fails loudly on a row that is not a part of the bill of materials', () => {
    expect(() => bomRows([{ ref: 'U99', part: 'x', value: 'x', skill: 'x', details: 'x' }])).toThrow(/U99/);
  });
});
