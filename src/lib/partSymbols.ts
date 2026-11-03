import type { PartId } from '../content/types';

/** The sprite symbol drawn for each part of the board. */
export const PART_SYMBOLS: Record<PartId, string> = {
  r1: 'part-resistor',
  c1: 'part-capacitor',
  led1: 'part-led',
  d1: 'part-diode',
  u2: 'part-chip',
  j1: 'part-header-6',
  j2: 'part-header-4',
  j3: 'part-usb-c',
};
