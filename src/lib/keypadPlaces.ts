import { KEYPAD, KEYPAD_FLOW, KEYPAD_SLOT, KEY_HIT, KEY_PLUNGER } from '../circuit/keypad';

const pct = (n: number): string => `${+(n * 100).toFixed(3)}%`;

/**
 * The places of the test keypad, from circuit/keypad.ts, as custom properties for styles/keypad.css:
 * on the wide board its slot (--kx, --ky, --kw, --kh) and each key's top left in it (--x, --y), in
 * front units, with the side of a hit area (--hit); on the flowing board each key's top left (--fx,
 * --fy) and size (--fw, --fh) in shares of its block; the plunger of a switch, a share of its key.
 * A stylesheet of their own (TestKeypad.vue adopts it once mounted): no style attribute in the page.
 */
export function keypadPlaces(): string {
  const keys = KEYPAD.map((k) => {
    const [cx, cy] = KEYPAD_FLOW.centres[k.key];
    const x = k.x - KEY_HIT / 2 - KEYPAD_SLOT.x;
    const y = k.y - KEY_HIT / 2 - KEYPAD_SLOT.y;
    return `.keypad__key[data-key="${k.key}"]{--x:${x};--y:${y};--fx:${pct((cx - 0.5) / KEYPAD_FLOW.w)};--fy:${pct((cy - 0.5) / KEYPAD_FLOW.h)}}`;
  });
  const group = `.keypad__keys{--kx:${KEYPAD_SLOT.x};--ky:${KEYPAD_SLOT.y};--kw:${KEYPAD_SLOT.w};--kh:${KEYPAD_SLOT.h};--hit:${KEY_HIT};--fw:${pct(1 / KEYPAD_FLOW.w)};--fh:${pct(1 / KEYPAD_FLOW.h)};--plunger:${pct(KEY_PLUNGER / KEY_HIT)}}`;
  return `@layer board{${group}${keys.join('')}}`;
}

const adopted = new WeakSet<Document>();

/**
 * The stylesheet of the places, adopted once by the document (a language switch mounts the keypad
 * again). False where the engine has no constructed stylesheets: the keypad then stays a drawing.
 */
export function adoptKeypadPlaces(doc: Document): boolean {
  if (adopted.has(doc)) return true;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(keypadPlaces());
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    adopted.add(doc);
    return true;
  } catch {
    return false;
  }
}
