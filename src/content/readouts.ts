import type { PartId } from './types';

/** Pixel-font readouts shown on DISP1, the same in both languages. */
export const READOUTS: Record<PartId, string> = {
  r1: '10kΩ',
  c1: '100nF',
  led1: '20mA',
  d1: '1N4148',
  u2: 'SOIC-8',
  j1: 'KIT 72H',
  j2: 'SPLITR',
  j3: 'MAIL',
};
