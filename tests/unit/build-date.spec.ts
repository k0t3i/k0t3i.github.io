// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest';

// vite-ssg loads vite.config.ts once for the client build and once for the server one: both, and the
// sitemap of scripts/postbuild.mjs, must read one build date (BUILD_DATE).

const loadConfig = async () => {
  vi.resetModules();
  return (await import('../../vite.config')).default;
};

describe('the build date', () => {
  const given = process.env.BUILD_DATE;

  afterEach(() => {
    vi.useRealTimers();
    if (given === undefined) delete process.env.BUILD_DATE;
    else process.env.BUILD_DATE = given;
  });

  test('every load of the config reads the date set by the first one', async () => {
    delete process.env.BUILD_DATE;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T23:59:59.900Z'));
    const client = await loadConfig();
    // The server build starts later, here on the next day.
    vi.setSystemTime(new Date('2026-11-04T00:00:01.000Z'));
    const server = await loadConfig();
    expect(process.env.BUILD_DATE).toBe('2026-11-03T23:59:59.900Z');
    for (const config of [client, server]) expect(config.define?.__BUILD_DATE__).toBe('"2026-11-03T23:59:59.900Z"');
  });

  test('a date given to the build is kept', async () => {
    process.env.BUILD_DATE = '2026-11-01T12:00:00.000Z';
    expect((await loadConfig()).define?.__BUILD_DATE__).toBe('"2026-11-01T12:00:00.000Z"');
  });
});
