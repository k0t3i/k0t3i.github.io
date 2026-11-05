import { KEYPAD, KEY_BODY, KEY_PLUNGER, TEST_PADS, TEST_ROW } from './keypad';
import { FRONT_PADS } from './layout';

/**
 * The parts of the front face that the art draws (spec 4.11), for the block of board-wide.svg written
 * by tests/unit/front-copper.spec.ts: the six switches of the test keypad, its TEST row with its
 * marks, its pull-ups RN1, TP5, the ferrite bead and the capacitor of the 5 V, and the serial-number
 * label. Static, integer coordinates, the colours of the parts of the page (tokens.css) fixed for
 * both masks. None of it ships: the page draws the art as a picture.
 */

const GOLD = '#c9a45c';
const TIN = '#6c6f75';
const BODY = '#141518';
const EDGE = '#2a2c31';
const CERAMIC = '#7c6a50';
const DRILL = '#050506';
const SILK = '#a29e95';
const MONO = 'JetBrains Mono,ui-monospace,Consolas,Menlo,monospace';

const pad = (ref: string) => FRONT_PADS.filter((p) => p.ref === ref);
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${extra} fill="${fill}"/>`;
const circle = (cx: number, cy: number, r: number, fill: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const text = (x: number, y: number, size: number, s: string, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="${SILK}" font-family="${MONO}" font-size="${size}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${s}</text>`;
/** A silkscreen line, never a trace: its stroke on the path itself (the copper of the art is a group with a stroke). */
const silk = (d: string) => `<path fill="none" stroke="#e8e4da" stroke-opacity=".35" d="${d}"/>`;
/** A pad as copper: its gold, round or square. */
const gold = (p: { x: number; y: number; w: number; h: number; round?: boolean }) =>
  p.round ? circle(p.x, p.y, p.w / 2, GOLD) : rect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, GOLD);

/** An octagon round a point, half its side `r`, its corners cut by `c`: a silkscreen outline. */
const octagon = (x: number, y: number, r: number, c: number) =>
  `M${x - r + c} ${y - r}H${x + r - c}L${x + r} ${y - r + c}V${y + r - c}L${x + r - c} ${y + r}H${x - r + c}L${x - r} ${y + r - c}V${y - r + c}L${x - r + c} ${y - r}`;

/** Code 39, narrow and wide (1, 2 units): bar, space, bar... for each character, then a narrow gap. */
const CODE39: Readonly<Record<string, string>> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  '*': '010010100',
};

/** The serial-number label: a silkscreen box, the barcode of the serial (Code 39) and its number. */
export const SERIAL = { x: 1076, y: 204, w: 94, h: 38, number: '2611' } as const;

function barcode(): string[] {
  const out: string[] = [];
  const word = `*${SERIAL.number}*`;
  const width = word.length * 13 - 1;
  let x = SERIAL.x + Math.round((SERIAL.w - width) / 2);
  for (const ch of word) {
    const code = CODE39[ch] ?? '';
    [...code].forEach((bit, k) => {
      const w = bit === '1' ? 2 : 1;
      if (k % 2 === 0) out.push(rect(x, SERIAL.y + 5, w, 20, SILK));
      x += w;
    });
    x += 1;
  }
  return out;
}

/** The arrow of a pad of the TEST row (a small filled triangle), or its letter. */
function mark(m: string, x: number): string {
  const y = TEST_ROW.y + 9;
  if (m === '↑') return `<path d="M${x} ${y}L${x + 4} ${y + 7}H${x - 4}"/>`;
  if (m === '↓') return `<path d="M${x - 4} ${y}H${x + 4}L${x} ${y + 7}"/>`;
  if (m === '←') return `<path d="M${x - 4} ${y + 4}L${x + 3} ${y}V${y + 8}"/>`;
  if (m === '→') return `<path d="M${x + 4} ${y + 4}L${x - 3} ${y}V${y + 8}"/>`;
  return text(x, y + 8, 11, m, 'middle');
}

export const BEGIN_PARTS = '<!-- The parts of the front drawn by the art, generated from src/circuit/keypad.ts, layout.ts and frontArt.ts by tests/unit/front-copper.spec.ts: do not edit by hand -->';
export const END_PARTS = '<!-- End of the generated parts -->';

export function frontPartsArt(): string {
  const half = KEY_BODY / 2;
  const switches = KEYPAD.flatMap(({ ref, x, y }) => [
    // The gull wings, the tin plate over them with its four dimples, the round plunger.
    ...pad(ref).map(gold),
    rect(x - half, y - half, KEY_BODY, KEY_BODY, TIN, ' rx="2"'),
    ...[[-7, -7], [7, -7], [-7, 7], [7, 7]].map(([dx = 0, dy = 0]) => circle(x + dx, y + dy, 1, DRILL)),
    circle(x, y, KEY_PLUNGER / 2, BODY),
    circle(x, y, KEY_PLUNGER / 2 - 2, EDGE),
  ]);
  const [up, down, left, right, b, a] = KEYPAD;
  const cross = up && down && left && right ? (() => {
    // The outline of the cross, 16 units round each switch of it.
    const r = 16;
    return `M${up.x - r} ${up.y - r}H${up.x + r}V${right.y - r}H${right.x + r}V${right.y + r}H${down.x + r}V${down.y + r}H${down.x - r}V${left.y + r}H${left.x - r}V${left.y - r}H${up.x - r}V${up.y - r}`;
  })() : '';
  // RN1, a SIP-7 standing on the board: seen from above, the top of its moulded body over its seven
  // leads, the dot of pin 1 (its common) at the left, and its marking.
  const rn = pad('RN1');
  const [first, end] = [rn[0], rn.at(-1)];
  const network = first && end
    ? [rect(first.x - 7, first.y - 6, end.x - first.x + 14, 12, BODY, ' rx="2"'), circle(first.x, first.y, 2, '#e8e4da'), text(first.x + 8, first.y + 4, 10, '4607X', 'start')]
    : [];
  // A lying 0603 between its two pads: tinned ends, its body (a ferrite bead black, a capacitor of ceramic).
  const chip = (ref: string, fill: string) => {
    const [l, r] = [...pad(ref)].sort((p, q) => p.x - q.x);
    if (!l || !r) return [];
    return [rect(l.x - 5, l.y - 6, r.x - l.x + 10, 12, TIN), rect(l.x + 2, l.y - 6, r.x - l.x - 4, 12, fill)];
  };
  const tp5 = pad('TP5')[0];
  return [
    BEGIN_PARTS,
    '<g>',
    ...switches,
    ...TEST_PADS.map((p) => circle(p.x, p.y, TEST_ROW.r, GOLD)),
    ...network,
    ...(tp5 ? [gold(tp5)] : []),
    ...chip('FB1', BODY),
    ...chip('C27', CERAMIC),
    '</g>',
    // The silkscreen: the outline of the cross and the rings of B and A, the marks of the TEST row and its name, TP5, the label.
    silk(cross),
    ...(b && a ? [silk(octagon(b.x, b.y, 16, 6)), silk(octagon(a.x, a.y, 16, 6))] : []),
    `<g fill="${SILK}">`,
    ...TEST_PADS.map((p) => mark(p.mark, p.x)),
    '</g>',
    text(TEST_ROW.label.x, TEST_ROW.label.y, 12, TEST_ROW.label.text),
    ...(tp5 ? [text(tp5.x, tp5.y + 20, 12, 'TP5', 'middle')] : []),
    `<rect x="${SERIAL.x}" y="${SERIAL.y}" width="${SERIAL.w}" height="${SERIAL.h}" fill="none" stroke="#e8e4da" stroke-opacity=".35"/>`,
    ...barcode(),
    text(SERIAL.x + SERIAL.w / 2, SERIAL.y + SERIAL.h - 4, 10, `S/N ${SERIAL.number}`, 'middle'),
    END_PARTS,
  ].join('\n');
}
