import type { Locale } from '../content/types';

export const UPTIME_BASE_HOURS = 34880;
export const UPTIME_BASE_DATE = '2020-03-30';
export const HOURS_PER_YEAR = 1744;

const DAYS_PER_YEAR = 365.2425;
const MS_PER_DAY = 86_400_000;

/** Hours of work since the base date, rounded down to the thousand. */
export function uptimeHours(now: Date): number {
  const days = (now.getTime() - new Date(UPTIME_BASE_DATE).getTime()) / MS_PER_DAY;
  const hours = UPTIME_BASE_HOURS + (days / DAYS_PER_YEAR) * HOURS_PER_YEAR;
  return Math.floor(hours / 1000) * 1000;
}

/** 46000 -> "46 000" (U+202F) in French, "46,000" in English. */
export function formatHours(hours: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB').format(hours);
}
