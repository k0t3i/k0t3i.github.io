/** A direction: an arrow key, a swipe on DISP1, a turn of the game. */
export type Dir = 'up' | 'down' | 'left' | 'right';

/** A step of the code: a direction, B, A, or a tap of DISP1 (B or A by touch). */
export type CodeKey = Dir | 'b' | 'a' | 'tap';

/** The code of the easter egg (revision 8): ↑ ↑ ↓ ↓ ← → ← → B A. */
export const CODE: readonly CodeKey[] = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];

const KEYS: Record<string, CodeKey> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', b: 'b', a: 'a' };

/**
 * The key of a keyboard event (event.key) as a step of the code, B and A in either case: the key
 * typed, so the same on AZERTY and QWERTY. Any other key is a wrong step (null); Shift and Caps Lock
 * on their own are no step at all (undefined), so a B typed in capitals still counts.
 */
export function codeKey(key: string): CodeKey | null | undefined {
  if (key === 'Shift' || key === 'CapsLock') return undefined;
  return KEYS[key.length === 1 ? key.toLowerCase() : key] ?? null;
}

/**
 * Follows the steps typed or swiped: true on the step that completes the code. A wrong step sets it
 * back to the start, or to its first step when it is one. A tap stands for B, then for A.
 */
export function codeDetector(): (key: CodeKey | null) => boolean {
  let at = 0;
  const fits = (i: number, key: CodeKey | null): boolean => key === CODE[i] || (key === 'tap' && i >= 8);
  return (key) => {
    if (!fits(at, key)) {
      at = fits(0, key) ? 1 : 0;
      return false;
    }
    at = (at + 1) % CODE.length;
    return at === 0;
  };
}

/** The shortest swipe, in CSS px. */
export const SWIPE_MIN = 24;
/** A finger that moved less than this, in CSS px, tapped. */
export const TAP_SLOP = 10;

/** A touch on DISP1, from where it started to where it is: a swipe along its main axis, a tap, or neither yet. */
export function gesture(dx: number, dy: number): Dir | 'tap' | null {
  const far = Math.max(Math.abs(dx), Math.abs(dy));
  if (far < TAP_SLOP) return 'tap';
  if (far < SWIPE_MIN) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
