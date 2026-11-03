import { describe, expect, it } from 'vitest';
import { formatHours, uptimeHours } from '../../src/lib/uptime';

describe('uptimeHours', () => {
  it.each([
    ['2026-11-03', 46000],
    ['2020-03-30', 34000],
    ['2027-06-01', 47000],
  ])('rounds down to the thousand on %s', (date, expected) => {
    expect(uptimeHours(new Date(date))).toBe(expected);
  });
});

describe('formatHours', () => {
  it('uses a narrow no-break space in French', () => {
    expect(formatHours(46000, 'fr')).toBe('46 000');
  });
  it('uses a comma in English', () => {
    expect(formatHours(46000, 'en')).toBe('46,000');
  });
});
