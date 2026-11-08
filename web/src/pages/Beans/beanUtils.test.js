// Run with: node --test src/pages/Beans/beanUtils.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import {
  applyScan,
  beanTitle,
  daysOffRoast,
  summarizeShots,
  EMPTY_BEAN,
  filterBeans,
  sortBeans,
  facets,
  statsFor,
  beanPalette,
  EMPTY_FILTERS,
  activeFilterCount,
} from './beanUtils.js';

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

import { cropRect, COVER_ASPECT } from './cover.js';

const beans = [
  {
    id: 'a',
    name: 'Guji',
    roaster: 'Onyx',
    origin: 'Ethiopia',
    process: 'Natural',
    roastLevel: 'light',
    roastDate: '2026-11-01',
    createdAt: 3,
  },
  {
    id: 'b',
    name: 'Fazenda',
    roaster: 'Counter Culture',
    origin: 'brazil',
    process: 'Washed',
    roastLevel: 'medium',
    roastDate: '2026-09-01',
    createdAt: 2,
  },
  {
    id: 'c',
    name: 'Huila',
    roaster: 'Onyx',
    origin: 'Colombia',
    process: 'washed',
    roastLevel: 'dark',
    createdAt: 1,
  },
];
const stats = { a: { n: 4, r: 2, s: 9 }, b: { n: 1, r: 1, s: 3 } };
const f = over => ({ ...EMPTY_FILTERS, ...over });
const ids = list => list.map(b => b.id).join('');

test('statsFor averages rated shots only', () => {
  assert.deepEqual(statsFor(stats, 'a'), { count: 4, ratedCount: 2, average: 4.5 });
  assert.deepEqual(statsFor(stats, 'zzz'), { count: 0, ratedCount: 0, average: null });
});

test('filters: text, roast, origin (case-insensitive), process, roaster', () => {
  assert.equal(ids(filterBeans(beans, f({ q: 'onyx' }))), 'ac');
  assert.equal(ids(filterBeans(beans, f({ roast: ['light', 'dark'] }))), 'ac');
  assert.equal(ids(filterBeans(beans, f({ origin: ['brazil'] }))), 'b');
  assert.equal(ids(filterBeans(beans, f({ process: ['washed'] }))), 'bc', 'Washed/washed merge');
  assert.equal(ids(filterBeans(beans, f({ roaster: ['onyx'], roast: ['dark'] }))), 'c');
});

test('filters: freshness, rating, active', () => {
  const now = dayjs('2026-11-08');
  assert.equal(ids(filterBeans(beans, f({ fresh: '14' }), { now })), 'a');
  assert.equal(ids(filterBeans(beans, f({ fresh: 'older' }), { now })), 'b');
  assert.equal(ids(filterBeans(beans, f({ rating: '4' }), { stats })), 'a');
  assert.equal(ids(filterBeans(beans, f({ rating: 'unrated' }), { stats })), 'c');
  assert.equal(ids(filterBeans(beans, f({ activeOnly: true }), { activeId: 'b' })), 'b');
});

test('facets merge case and sort by count', () => {
  const p = facets(beans, 'process');
  assert.deepEqual(
    p.map(x => [x.key, x.count]),
    [
      ['washed', 2],
      ['natural', 1],
    ],
  );
  assert.equal(activeFilterCount(f({ roast: ['light'], fresh: '14', activeOnly: true })), 3);
});

test('sorting', () => {
  const now = dayjs('2026-11-08');
  assert.equal(ids(sortBeans(beans, 'newest')), 'abc');
  assert.equal(ids(sortBeans(beans, 'name')), 'bac');
  assert.equal(ids(sortBeans(beans, 'roasted', {}, now)), 'abc');
  assert.equal(ids(sortBeans(beans, 'rating', stats)), 'abc');
  assert.equal(ids(sortBeans(beans, 'shots', stats)), 'abc');
});

test('palette: always valid hex, light text on dark beans', () => {
  assert.match(beanPalette({ roastLevel: 'dark' }).base, /^#[0-9a-f]{6}$/);
  assert.equal(beanPalette({ roastLevel: 'dark' }).ink, '#fbf3e6');
  assert.equal(beanPalette({ color: '#f0e0b0' }).ink, '#2a1a10');
  assert.match(beanPalette({ name: 'x' }).base, /^#[0-9a-f]{6}$/, 'fallback colour');
});

test('cropRect stays tight to the bag, near the cover aspect, inside the image', () => {
  for (const [w, h, bbox] of [
    [1600, 1200, { x: 0.316, y: 0.117, w: 0.368, h: 0.767 }], // typical bag on a table
    [3000, 4000, { x: 0, y: 0, w: 1, h: 1 }],
    [1000, 1000, null],
    [4000, 3000, { x: 0.8, y: 0.5, w: 0.2, h: 0.5 }],
    [1200, 1600, { x: 0.1, y: 0.1, w: 0.8, h: 0.3 }], // very wide box -> trimmed
  ]) {
    const r = cropRect(w, h, bbox);
    const ar = r.sw / r.sh;
    assert.ok(ar >= COVER_ASPECT * 0.879 && ar <= COVER_ASPECT * 1.121, `aspect ${ar}`);
    assert.ok(
      r.sx >= -0.5 && r.sy >= -0.5 && r.sx + r.sw <= w + 0.5 && r.sy + r.sh <= h + 0.5,
      `inside ${JSON.stringify(r)}`,
    );
    if (bbox) {
      assert.ok(
        r.sx >= bbox.x * w - 0.5 && r.sx + r.sw <= (bbox.x + bbox.w) * w + 0.5,
        'never wider than the bag box',
      );
      assert.ok(
        r.sy >= bbox.y * h - 0.5 && r.sy + r.sh <= (bbox.y + bbox.h) * h + 0.5,
        'never taller than the bag box',
      );
    }
  }
});
