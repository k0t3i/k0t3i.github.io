import type { PartId } from './types';

/** Pixel-font readouts shown on DISP1, the same in both languages. */
export const READOUTS: Record<PartId, string> = {
  r1: '10kΩ',
  c1: '10µF',
  led1: '20mA',
  d1: 'BAT42W',
  u2: 'SOIC-8',
  j1: 'KIT 72H',
  j2: 'SPLITR',
  j3: 'MYCARD',
  j4: 'SCORE',
  j5: 'MAIL',
};

/** The two lines DISP1 prints while the board powers on, one after the other. */
export const BOOT_LINES: readonly [string, string] = ['BOOT...', 'OK'];

/** The unit after the uptime in large digits (SW1). */
export const UPTIME_UNIT = 'H';

/**
 * The pixel words of the mini-game « Routage » (revision 8), the same in both languages: its title,
 * the key that plays (drawn in a key cap), and the end of a game, a failed design rule check.
 */
export const GAME_WORDS = { title: 'ROUTE', key: 'A', over: 'DRC ERR' } as const;

/** What SW1 sends in Morse code on LED1, its dots and dashes on DISP1. */
export const MORSE_MESSAGE = 'HELLO';
