import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDate } from '../../scripts/build.mjs';

// One build date for the whole build (scripts/build.mjs): now, or the one given (the deploy gives the
// commit date of the sources), always written the same way, as toISOString() writes it.

test('the build date is now when none is given', () => {
  assert.equal(buildDate(undefined, new Date('2026-11-04T05:06:07.890Z')), '2026-11-04T05:06:07.890Z');
});

test('a given build date is normalised: the same instant, written as toISOString() writes it', () => {
  assert.equal(buildDate('2026-11-04T06:06:07+01:00'), '2026-11-04T05:06:07.000Z');
  assert.equal(buildDate('2026-11-04T05:06:07.890Z'), '2026-11-04T05:06:07.890Z');
});

test('a build date that is no date is refused', () => {
  for (const bad of ['', 'yesterday', 'not a date']) assert.throws(() => buildDate(bad), /BUILD_DATE/);
});
