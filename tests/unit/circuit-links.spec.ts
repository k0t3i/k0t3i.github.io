// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FED_BY, linkedTo, linksOf } from '../../src/circuit/links';
import { NETS, PARTS } from '../../src/circuit/netlist';

/*
 * « Relié à » (spec 4.10), from the netlist: signal links only, the passives looked through, a device
 * of a bus linked to its master and what it serves, the chip to everything it serves; the regulator
 * linked to the connector that feeds it, the one exception to « no power in Relié à » (Anthony's
 * decision of 04/11/2026, spec 4.10).
 */
describe('the links of the parts of the bill of materials', () => {
  it('follow the rules of the spec', () => {
    const expected: Record<string, string> = {
      U10: 'U11 U13 U14 U15 U16 U17 U18 Y1 J6 J7 R1 LED1 D1 U2 J1 J2 J3 J4 DISP1 SW3 SW4 SW5 SW6 SW7 SW8',
      U11: 'U10',
      U12: 'J5',
      U13: 'U10 J5',
      U14: 'U10 SW1 SW2 JP1',
      U15: 'U10 D2 D3 D4 D5',
      U16: 'U10 Y2',
      U17: 'U10 J6',
      U18: 'U10',
      Y1: 'U10',
      J6: 'U10 U17',
    };
    for (const [ref, links] of Object.entries(expected)) expect(linkedTo(ref).join(' '), ref).toBe(links);
  });

  it('look through the passives: LED1 through R1, J7 through the π network, SW1 through its RC', () => {
    expect(linksOf('U10').find((l) => l.to === 'LED1')?.nets.sort()).toEqual(['LED_A', 'LED_DRV']);
    expect(linksOf('U10').find((l) => l.to === 'J7')?.nets.sort()).toEqual(['LNA_IN', 'RF']);
    expect(linksOf('U14').find((l) => l.to === 'SW1')?.nets).toEqual(['BTN']);
    // A device of the I²C bus reaches the chip on it, and not the other devices.
    expect(linksOf('U18').map((l) => [l.to, l.nets.sort()])).toEqual([['U10', ['SCL', 'SDA']]]);
  });

  it('name no power link but the one exception, U12 to J5, the connector that feeds it', () => {
    expect(FED_BY).toEqual({ U12: 'J5' });
    // Through the ferrite bead FB1, a passive looked through like the others.
    expect(linksOf('U12')).toEqual([{ to: 'J5', nets: ['VBUS', 'VBUS_C'] }]);
    const signal = (ref: string) => NETS.some((n) => n.kind === 'signal' && n.pins.some((p) => p.startsWith(`${ref}.`)));
    for (const p of PARTS.filter((q) => q.ref !== 'U12' && !signal(q.ref))) expect(linksOf(p.ref), p.ref).toEqual([]);
  });

  it('name the keys of the keypad, but never their pull-ups nor the pads of the test bed (spec 4.11)', () => {
    expect(linksOf('U10').find((l) => l.to === 'SW3')?.nets).toEqual(['KEY_UP']);
    for (const ref of ['RN1', 'J8', 'TP5', 'FB1', 'C27']) expect(linkedTo('U10'), ref).not.toContain(ref);
    // The TEST row joins none of its nets to another: each key is linked to the chip only.
    expect(linkedTo('SW5')).toEqual(['U10']);
  });

  it('are both ways between the parts of the bill of materials', () => {
    const bom = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6'];
    for (const a of bom) for (const b of linkedTo(a).filter((r) => bom.includes(r))) expect(linkedTo(b), `${b} back to ${a}`).toContain(a);
  });
});
