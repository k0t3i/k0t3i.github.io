import { DEVICES } from './devices';
import { PARTS, netOf, pinsOf, type Net, type Part } from './netlist';

/**
 * The column « Relié à » of the bill of materials (spec 4.10), computed from the netlist. It runs at
 * test time only: tests/unit/circuit-bom.spec.ts writes its result for the eleven parts of the table
 * into bomLinks.ts, so that the page ships the links and not the whole netlist (the budget of JS).
 */

/** The chip that is the master of the shared buses (Net.bus). */
const MCU = 'U10';

const partOf = (ref: string): Part => {
  const p = PARTS.find((x) => x.ref === ref);
  if (!p) throw new Error(`no part ${ref}`);
  return p;
};
const refOf = (pin: string): string => pin.slice(0, pin.indexOf('.'));
const pinNo = (pin: string): string => pin.slice(pin.indexOf('.') + 1);

/**
 * The parts `ref` is linked to by a signal, in the order of the netlist (PARTS):
 * - signal nets only: power and ground are left out;
 * - resistors, capacitors, inductors, clamps and test points are looked through (a series resistor,
 *   a pull-up, an RC), to the part on their other side; a passive of the front face (R1, D1) is named
 *   all the same, as the spec asks for the parts of the front;
 * - a part with pins joined inside (the flow-through ESD array U13) is named, and looked through too;
 * - on a shared bus (I²C, SPI) a device is linked to the chip only, not to the other devices of the
 *   bus; the chip is linked to all of them.
 */
export function linkedTo(ref: string): string[] {
  const found = new Set<string>();
  const seen = new Set<Net>();
  const queue: Net[] = [];
  const reach = (pin: string): void => {
    const net = netOf(pin);
    if (net && net.kind === 'signal' && !seen.has(net)) {
      seen.add(net);
      queue.push(net);
    }
  };
  for (const pin of pinsOf(ref)) reach(pin);
  while (queue.length) {
    const net = queue.shift() as Net;
    const pins = net.bus && ref !== MCU ? net.pins.filter((p) => refOf(p) === MCU) : net.pins;
    for (const pin of pins) {
      const to = refOf(pin);
      if (to === ref) continue;
      const part = partOf(to);
      const device = DEVICES[part.dev];
      const transparent = 'transparent' in device;
      if (!transparent || part.face === 'front') found.add(to);
      if (transparent) for (const other of pinsOf(to)) reach(other);
      const bridges: readonly (readonly [string, string])[] = 'bridges' in device ? device.bridges : [];
      for (const [a, b] of bridges) {
        if (pinNo(pin) === a) reach(`${to}.${b}`);
        if (pinNo(pin) === b) reach(`${to}.${a}`);
      }
    }
  }
  return PARTS.map((p) => p.ref).filter((r) => found.has(r));
}
