// Run with: node --test src/pages/Beans/beanUtils.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import { applyScan, beanTitle, daysOffRoast, summarizeShots, EMPTY_BEAN } from './beanUtils.js';

const now = dayjs('2026-11-08T15:00:00');

test('daysOffRoast', () => {
  assert.equal(daysOffRoast('2026-11-08', now), 0);
  assert.equal(daysOffRoast('2026-10-28', now), 11);
  assert.equal(daysOffRoast('2026-12-01', now), null, 'future date');
  assert.equal(daysOffRoast('', now), null);
  assert.equal(daysOffRoast('garbage', now), null);
});

test('summarizeShots ignores unrated and handles empty', () => {
  assert.deepEqual(summarizeShots([]), { count: 0, ratedCount: 0, average: null });
  const s = summarizeShots([{ rating: 4 }, { rating: 5 }, { rating: 0 }, {}]);
  assert.equal(s.count, 4);
  assert.equal(s.ratedCount, 2);
  assert.equal(s.average, 4.5);
});

test('applyScan only takes known non-empty strings and keeps existing values', () => {
  const base = { ...EMPTY_BEAN, name: 'Mine', roaster: 'Kept' };
  const out = applyScan(base, {
    name: ' Scanned ',
    roaster: '',
    origin: 'Kenya',
    evil: 'x',
    region: 5,
  });
  assert.equal(out.name, 'Scanned');
  assert.equal(out.roaster, 'Kept');
  assert.equal(out.origin, 'Kenya');
  assert.equal(out.region, '');
  assert.equal('evil' in out, false);
});

test('applyScan drops invalid roast level and date', () => {
  const out = applyScan(EMPTY_BEAN, { roastLevel: 'espresso-ish', roastDate: 'next tuesday' });
  assert.equal(out.roastLevel, '');
  assert.equal(out.roastDate, '');
});

test('beanTitle', () => {
  assert.equal(beanTitle({ roaster: 'Onyx', name: 'Guji' }), 'Onyx – Guji');
  assert.equal(beanTitle({ name: 'Guji' }), 'Guji');
  assert.equal(beanTitle({}), 'Untitled bean');
});
