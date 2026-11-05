// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEVICES, type PinType } from '../../src/circuit/devices';
import { KEYPAD, TEST_PADS, TEST_ROW } from '../../src/circuit/keypad';
import { NC, NETS, PARTS, deviceOf, netOf, pinsOf, type Net } from '../../src/circuit/netlist';
import { en } from '../../src/content/en';
import { fr } from '../../src/content/fr';

/*
 * The electrical rules check of the circuit of the board (spec 4.10): the netlist is data, and these
 * are the checks a schematic tool would run on it, plus the rules of the datasheets of its parts.
 */

const at = (pin: string): { ref: string; pin: string } => {
  const [ref = '', p = ''] = pin.split('.');
  return { ref, pin: p };
};
const typeOf = (pin: string): PinType => {
  const { ref, pin: p } = at(pin);
  const t = deviceOf(ref).pins[p]?.[1];
  if (!t) throw new Error(`no pin ${pin}`);
  return t;
};
const nameOf = (pin: string): string => {
  const { ref, pin: p } = at(pin);
  return deviceOf(ref).pins[p]?.[0] ?? '?';
};
const net = (name: string): Net => {
  const n = NETS.find((x) => x.name === name);
  if (!n) throw new Error(`no net ${name}`);
  return n;
};
/** The net on the other pin of a two-pin part (a resistor, a capacitor...). */
const other = (ref: string, from: string): string | undefined => {
  const pins = Object.keys(deviceOf(ref).pins);
  const there = pins.find((p) => `${ref}.${p}` !== from);
  return there ? netOf(`${ref}.${there}`)?.name : undefined;
};
/** The parts of a kind (by the letters of their reference) between a net and another one. */
const between = (letters: RegExp, a: string, b: string): string[] =>
  net(a)
    .pins.filter((p) => letters.test(at(p).ref) && Object.keys(deviceOf(at(p).ref).pins).length === 2)
    .filter((p) => other(at(p).ref, p) === b)
    .map((p) => at(p).ref);

describe('the netlist of the board', () => {
  it('every part is a real part of the library, with a manufacturer part number and its datasheet', () => {
    for (const part of PARTS) {
      const dev = DEVICES[part.dev];
      expect(dev, part.ref).toBeDefined();
      expect(dev?.mpn, part.ref).toMatch(/\S/);
      expect(dev?.datasheet, part.ref).toMatch(/\S/);
    }
  });

  it('references are unique across both faces, and the front face holds the parts of the page', () => {
    const refs = PARTS.map((p) => p.ref);
    expect(new Set(refs).size).toBe(refs.length);
    const front = PARTS.filter((p) => p.face === 'front').map((p) => p.ref);
    for (const content of [fr, en]) {
      for (const p of [...content.principles, ...content.connectors]) expect(front, p.ref).toContain(p.ref);
      expect(front).toEqual(expect.arrayContaining([content.display.switchRef, content.back.ref, content.theme.ref, 'DISP1']));
    }
  });

  it('every pin of a net is a real pin of its part, and every net joins two pins at least', () => {
    for (const n of NETS) {
      expect(n.pins.length, n.name).toBeGreaterThanOrEqual(2);
      for (const p of n.pins) {
        const { ref, pin } = at(p);
        expect(PARTS.some((x) => x.ref === ref), `${n.name}: ${p}`).toBe(true);
        expect(deviceOf(ref).pins[pin], `${n.name}: ${p}`).toBeDefined();
      }
    }
    const names = NETS.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every pin is on one net, or left open as its datasheet allows', () => {
    for (const part of PARTS) {
      for (const pin of Object.keys(deviceOf(part.ref).pins)) {
        const id = `${part.ref}.${pin}`;
        const on = NETS.filter((n) => n.pins.includes(id));
        expect(on.length, `${id} on ${on.map((n) => n.name).join(', ')}`).toBeLessThanOrEqual(1);
        if (on.length) {
          expect(NC[id], `${id} is on a net and said open`).toBeUndefined();
          continue;
        }
        const type = typeOf(id);
        // Open: a pin the datasheet marks NC, an output, or an I/O left unused (with its reason).
        expect(['nc', 'out', 'od', 'io'], `${id} (${nameOf(id)}, ${type}) is left open`).toContain(type);
        if (type !== 'nc') expect(NC[id], `${id} (${nameOf(id)}): no reason to leave it open`).toMatch(/\S/);
      }
    }
    // Every reason names a real pin left open.
    for (const id of Object.keys(NC)) expect(netOf(id), id).toBeUndefined();
  });

  it('power pins sit on their rails, ground pins on the ground', () => {
    for (const part of PARTS) {
      for (const [pin, [name, type]] of Object.entries(deviceOf(part.ref).pins)) {
        const n = netOf(`${part.ref}.${pin}`);
        if (type === 'ground') expect(n?.name, `${part.ref}.${pin} ${name}`).toBe('GND');
        if (type === 'power') expect(n?.kind, `${part.ref}.${pin} ${name} on ${n?.name}`).toBe('power');
      }
    }
    // Each rail has its source: the 5 V of USB-C, the regulator, the flash supply of the chip.
    expect(net('VBUS_C').pins).toEqual(expect.arrayContaining(['J5.A4', 'J5.B4', 'J5.A9', 'J5.B9']));
    expect(net('VBUS').pins).toContain('U12.1');
    expect(net('+3V3').pins).toContain('U12.5');
    expect(net('VDD_SPI').pins).toEqual(expect.arrayContaining(['U10.29', 'U11.8']));
    // The flash runs at 3.3 V: VDD_SPI comes from VDD3P3_RTC while GPIO45 (VDD_SPI voltage) reads low,
    // so GPIO45 is on no net, left to its weak pull-down (below, with the other strapping pins).
    expect(nameOf('U10.51')).toBe('GPIO45');
    expect(netOf('U10.51')).toBeUndefined();
  });

  it('every power pin of a chip has its decoupling capacitor to ground', () => {
    for (const part of PARTS.filter((p) => /^U\d/.test(p.ref))) {
      for (const [pin, [name, type]] of Object.entries(deviceOf(part.ref).pins)) {
        if (type !== 'power') continue;
        const rail = netOf(`${part.ref}.${pin}`)?.name ?? '';
        const caps = part.decoupling?.[pin] ?? [];
        expect(caps.length, `${part.ref}.${pin} ${name}`).toBeGreaterThan(0);
        for (const c of caps) expect(between(/^C\d/, rail, 'GND'), `${c} decouples ${part.ref}.${pin}`).toContain(c);
      }
    }
  });

  it('no input floats: every input is tied to a rail, driven by an output or a supply, or pulled by a resistor to a rail', () => {
    // A capacitor alone is no driver: it holds a level it never sets.
    const drivers: PinType[] = ['out', 'od', 'io', 'supply'];
    const rails = NETS.filter((n) => n.kind !== 'signal').map((n) => n.name);
    for (const n of NETS) {
      const inputs = n.pins.filter((p) => typeOf(p) === 'in');
      if (!inputs.length) continue;
      const tied = n.kind !== 'signal';
      const driven = n.pins.some((p) => drivers.includes(typeOf(p)));
      const pulled = rails.some((rail) => between(/^R\d/, n.name, rail).length > 0);
      expect(tied || driven || pulled, `${n.name}: ${inputs.join(', ')} undriven`).toBe(true);
    }
  });

  it('every open-drain line has its pull-up', () => {
    for (const n of NETS) {
      if (n.kind !== 'signal' || !n.pins.some((p) => typeOf(p) === 'od')) continue;
      // An LED sunk by an open-drain output is its load: its anode resistor is on the other side.
      if (n.pins.some((p) => /^D\d+\.K$/.test(p))) continue;
      expect(between(/^(R|RN)\d/, n.name, '+3V3').length, `${n.name}`).toBeGreaterThan(0);
    }
  });

  it('the I²C bus has its two pull-ups, and its devices their own addresses', () => {
    for (const name of ['SDA', 'SCL']) expect(between(/^R\d/, name, '+3V3'), name).toHaveLength(1);
    const devices = PARTS.filter((p) => net('SDA').pins.some((q) => at(q).ref === p.ref) && p.address !== undefined);
    const addresses = devices.map((p) => p.address);
    expect(new Set(addresses).size, addresses.join(' ')).toBe(addresses.length);
    expect(devices.map((p) => p.ref).sort()).toEqual(['U14', 'U15', 'U16', 'U18', 'U2'].sort());
    // Every device of the bus has its SDA and SCL on the bus.
    for (const d of devices) {
      const pins = pinsOf(d.ref);
      expect(pins.map((p) => netOf(p)?.name)).toEqual(expect.arrayContaining(['SDA', 'SCL']));
    }
  });

  it('the 40 MHz crystal has its two load capacitors, on XTAL_P and XTAL_N of the chip, of 2 (CL − Cstray)', () => {
    expect(net('XTAL_P').pins).toEqual(expect.arrayContaining(['U10.54', 'Y1.1']));
    expect(net('XTAL_N').pins).toEqual(expect.arrayContaining(['U10.53', 'Y1.3']));
    // Each load capacitor C = 2 (CL − Cstray): the CL of the crystal, a stray capacitance of the pins and
    // the traces of 2 to 5 pF; the nearest value of the E12 series, the same on both sides.
    const cl = DEVICES.xtal40m.load ?? 0;
    expect(cl).toBeGreaterThan(0);
    const pf = (ref: string) => Number.parseFloat(PARTS.find((p) => p.ref === ref)?.value ?? '');
    const caps = ['XTAL_P', 'XTAL_N'].map((name) => between(/^C\d/, name, 'GND'));
    for (const c of caps) expect(c).toHaveLength(1);
    const [a, b] = caps.map((c) => pf(c[0] ?? ''));
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(2 * (cl - 5));
    expect(a).toBeLessThanOrEqual(2 * (cl - 2));
    expect(netOf('Y1.2')?.name).toBe('GND');
    expect(netOf('Y1.4')?.name).toBe('GND');
    // The RTC keeps its own 32.768 kHz crystal (its oscillator capacitors are integrated).
    expect(netOf('U16.1')?.pins).toContain('Y2.1');
    expect(netOf('U16.2')?.pins).toContain('Y2.2');
  });

  it('the USB pair runs from J5 through the ESD protection U13 to the native USB of the chip', () => {
    // Each line of the receptacle (both rows of contacts) reaches the protection only.
    expect(net('USB_DP_C').pins.sort()).toEqual(['J5.A6', 'J5.B6', 'U13.3']);
    expect(net('USB_DN_C').pins.sort()).toEqual(['J5.A7', 'J5.B7', 'U13.1']);
    // Through the protection (its pins 1/6 and 3/4 are one line), on to GPIO20 (D+) and GPIO19 (D−).
    expect(DEVICES.usblc6.bridges).toEqual([['1', '6'], ['3', '4']]);
    expect(net('USB_DP').pins.sort()).toEqual(['U10.26', 'U13.4']);
    expect(net('USB_DN').pins.sort()).toEqual(['U10.25', 'U13.6']);
    expect(nameOf('U10.26')).toBe('GPIO20');
    expect(nameOf('U10.25')).toBe('GPIO19');
    expect(netOf('U13.5')?.name).toBe('VBUS');
    // A sink: 5.1 kΩ on CC1 and CC2.
    for (const cc of ['J5.A5', 'J5.B5']) {
      const n = netOf(cc);
      expect(n, cc).toBeDefined();
      const rs = between(/^R\d/, n?.name ?? '', 'GND');
      expect(rs, cc).toHaveLength(1);
      expect(PARTS.find((p) => p.ref === rs[0])?.value).toBe('5.1 kΩ');
    }
  });

  it('the strapping pins and CHIP_PU start the chip from its flash', () => {
    // CHIP_PU: the RC of the datasheet (10 kΩ, 1 µF), the open-drain reset of U17 and EN of J6.
    expect(net('EN').pins).toEqual(expect.arrayContaining(['U10.4', 'U17.2', 'J6.2']));
    const up = between(/^R\d/, 'EN', '+3V3');
    const down = between(/^C\d/, 'EN', 'GND');
    expect(up.map((r) => PARTS.find((p) => p.ref === r)?.value)).toEqual(['10 kΩ']);
    expect(down.map((c) => PARTS.find((p) => p.ref === c)?.value)).toEqual(['1 µF']);
    // GPIO0 pulled up (boot from flash), down only by IO0 of J6.
    expect(net('IO0').pins).toEqual(expect.arrayContaining(['U10.5', 'J6.3']));
    expect(between(/^R\d/, 'IO0', '+3V3')).toHaveLength(1);
    expect(between(/^R\d/, 'IO0', 'GND')).toHaveLength(0);
    // GPIO3, GPIO45 and GPIO46 left to their defaults (floating, weak pull-down, weak pull-down): on no
    // net, and in the list of the pins left open, nothing pulling them.
    for (const [p, gpio] of [['U10.8', 'GPIO3'], ['U10.51', 'GPIO45'], ['U10.52', 'GPIO46']] as const) {
      expect(nameOf(p), p).toBe(gpio);
      expect(netOf(p), p).toBeUndefined();
      expect(Object.keys(NC), p).toContain(p);
    }
    // The UART0 of the boot ROM on J6.
    expect(netOf('J6.4')?.pins).toContain('U10.49');
    expect(netOf('J6.5')?.pins).toContain('U10.50');
    expect(netOf('J6.1')?.name).toBe('+3V3');
    expect(netOf('J6.6')?.name).toBe('GND');
  });

  it('the antenna goes out through the π matching network to J7', () => {
    const rf = netOf('U10.1');
    expect(rf?.name).toBe('LNA_IN');
    const l = rf?.pins.filter((p) => /^L\d/.test(at(p).ref)) ?? [];
    expect(l, 'one series inductor').toHaveLength(1);
    const out = other(at(l[0] ?? '').ref, l[0] ?? '') ?? '';
    expect(net(out).pins).toContain('J7.1');
    expect(between(/^C\d/, 'LNA_IN', 'GND'), 'shunt on the chip side').toHaveLength(1);
    expect(between(/^C\d/, out, 'GND'), 'shunt on the antenna side').toHaveLength(1);
  });

  it('the clamp of the 1-Wire line holds it within the 3.6 V the ESP32-S3 allows, and C1 is the bulk of the 3.3 V rail', () => {
    // D1, from the line (anode) to +3V3 (cathode): the line rises at most 3.3 V plus its forward voltage
    // at 1 mA, the current of a fault the 4.7 kΩ pull-up and the port see.
    expect([netOf('D1.A')?.name, netOf('D1.K')?.name]).toEqual(['ONEWIRE', '+3V3']);
    const vf = deviceOf('D1').vf;
    expect(vf, 'the forward voltage of D1 at 1 mA').toBeDefined();
    expect(3.3 + (vf ?? 1)).toBeLessThanOrEqual(3.6);
    // C1, far from any chip, is no decoupling capacitor: a bulk one, of microfarads.
    expect([netOf('C1.1')?.name, netOf('C1.2')?.name]).toEqual(['+3V3', 'GND']);
    expect(PARTS.find((p) => p.ref === 'C1')?.value).toMatch(/^\d+ µF$/);
  });

  it('the parts of the front face have a real role', () => {
    // LED1 lit by the chip through R1.
    const drive = netOf('R1.1');
    expect(drive?.pins.some((p) => at(p).ref === 'U10'), 'R1 from the chip').toBe(true);
    expect(netOf('R1.2')?.pins).toContain('LED1.A');
    expect(netOf('LED1.K')?.name).toBe('GND');
    // C1 bypasses the 3.3 V rail.
    expect([netOf('C1.1')?.name, netOf('C1.2')?.name].sort()).toEqual(['+3V3', 'GND']);
    // D1 clamps the 1-Wire line of J4 to the 3.3 V rail.
    expect(netOf('D1.A')?.pins).toEqual(expect.arrayContaining(['J4.1']));
    expect(netOf('D1.K')?.name).toBe('+3V3');
    // U2 is a temperature sensor on the I²C bus.
    expect(pinsOf('U2').map((p) => netOf(p)?.name)).toEqual(expect.arrayContaining(['SDA', 'SCL', '+3V3', 'GND']));
    // DISP1 on the SPI bus, J3 too; SW1 (debounced), SW2 and JP1 read by U14.
    for (const [pin, name] of [['DISP1.3', 'SPI_SCK'], ['DISP1.4', 'SPI_MOSI'], ['J3.5', 'SPI_SCK'], ['J3.3', 'SPI_MOSI'], ['J3.7', 'SPI_MISO']]) {
      expect(netOf(pin ?? '')?.name, pin).toBe(name);
    }
    expect(netOf('SW1.1')?.pins).toContain('U14.6');
    expect(between(/^C\d/, netOf('SW1.1')?.name ?? '', 'GND'), 'SW1 debounced').toHaveLength(1);
    expect(netOf('SW2.2')?.pins).toContain('U14.5');
    expect(netOf('JP1.2')?.pins).toContain('U14.4');
  });

  it('the test keypad: six switches on free GPIOs of the chip, each pulled up by 10 kΩ, its TEST pads on its net (spec 4.11)', () => {
    for (const k of KEYPAD) {
      const part = PARTS.find((p) => p.ref === k.ref);
      expect([part?.dev, part?.face], k.ref).toEqual(['b3fs', 'front']);
      // One side of the switch on the key, the other on the ground: a press pulls the line low.
      expect([netOf(`${k.ref}.1`)?.name, netOf(`${k.ref}.2`)?.name, netOf(`${k.ref}.3`)?.name, netOf(`${k.ref}.4`)?.name], k.ref).toEqual([k.net, k.net, 'GND', 'GND']);
      // Read by a GPIO of the chip: no strap, no pin of the quad flash (the octal pins GPIO33 to GPIO37
      // and SPICLK_P / SPICLK_N, GPIO47 / GPIO48, are free with a quad flash).
      const gpio = net(k.net).pins.filter((p) => at(p).ref === 'U10');
      expect(gpio, k.net).toHaveLength(1);
      expect(nameOf(gpio[0] ?? ''), k.net).toMatch(/^(GPIO3[3-7]|SPICLK_[PN])$/);
      // Its pull-up, 10 kΩ to +3V3: an element of the bussed network RN1, its common on the rail.
      const rn = net(k.net).pins.filter((p) => /^RN\d/.test(at(p).ref));
      expect(rn, k.net).toHaveLength(1);
      const ref = at(rn[0] ?? '').ref;
      expect(deviceOf(ref).bussed, k.net).toBe(true);
      expect(netOf(`${ref}.1`)?.name, k.net).toBe('+3V3');
      expect(PARTS.find((p) => p.ref === ref)?.value, k.net).toBe('10 kΩ');
    }
    // Every element of RN1 is used: six keys on pins 2 to 7.
    expect(pinsOf('RN1').map((p) => netOf(p)?.name)).toEqual(['+3V3', ...KEYPAD.map((k) => k.net)]);
    // J8: the ten pads of the test bed, in the order of their marks, each on the net of its key.
    expect(TEST_PADS.map((p) => netOf(`${TEST_ROW.ref}.${p.pin}`)?.name)).toEqual(TEST_PADS.map((p) => p.net));
    expect(deviceOf(TEST_ROW.ref).probe).toBe(true);
  });

  it('the 5 V input runs through a ferrite bead and its capacitor, and TP5 is a ground for the test bed', () => {
    // J5 brings VBUS_C; FB1 (a ferrite bead) passes it on to VBUS, filtered by C27 to ground.
    expect(netOf('J5.A4')?.name).toBe('VBUS_C');
    expect(between(/^FB\d/, 'VBUS_C', 'VBUS')).toEqual(['FB1']);
    expect(between(/^C\d/, 'VBUS', 'GND')).toContain('C27');
    expect(netOf('TP5.1')?.name).toBe('GND');
  });
});
