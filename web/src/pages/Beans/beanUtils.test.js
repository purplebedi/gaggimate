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

// ---------------------------------------------------------------- 3D bag geometry + flattening
import { applyHomography, homography, quadAspect, warp } from './rectify.js';
import { insetQuad } from './makeBag.js';
import { bulge, clampAspect } from './bag3d.js';

test('homography maps each corner onto its target (even for a perspective trapezoid)', () => {
  const from = [
    [0, 0],
    [400, 0],
    [400, 500],
    [0, 500],
  ];
  const to = [
    [228, 322],
    [1395, 335],
    [1490, 1790],
    [12, 1770],
  ]; // a bag photographed from below
  const H = homography(from, to);
  from.forEach((p, i) => {
    const [x, y] = applyHomography(H, p[0], p[1]);
    assert.ok(Math.abs(x - to[i][0]) < 1e-6 && Math.abs(y - to[i][1]) < 1e-6, `corner ${i}`);
  });
  // the centre of the flat panel lands inside the quad, not at the plain average (perspective foreshortening)
  const [cx, cy] = applyHomography(H, 200, 250);
  assert.ok(cx > 300 && cx < 1200 && cy > 600 && cy < 1500);
});

test('homography rejects collinear corners', () => {
  assert.equal(
    homography(
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ),
    null,
  );
});

test('quadAspect is width/height of the panel', () => {
  assert.equal(
    quadAspect([
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
    ]),
    2,
  );
  assert.ok(
    Math.abs(
      quadAspect([
        [10, 0],
        [190, 0],
        [200, 100],
        [0, 100],
      ]) - 1.9,
    ) < 0.01,
  );
});

test('warp with the identity reproduces the source pixels', () => {
  global.ImageData ||= class {
    constructor(data, width, height) {
      Object.assign(this, { data, width, height });
    }
  };
  const w = 4;
  const h = 3;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([i * 20, 255 - i * 10, 7, 255], i * 4);
  const out = warp({ data, width: w, height: h }, [1, 0, 0, 0, 1, 0, 0, 0, 1], w, h);
  for (let i = 0; i < data.length; i++)
    assert.ok(Math.abs(out.data[i] - data[i]) <= 1, `byte ${i}`);
});

test('insetQuad pulls every corner towards the centre and keeps the shape', () => {
  const q = {
    tl: { x: 0.1, y: 0.1 },
    tr: { x: 0.9, y: 0.1 },
    br: { x: 0.9, y: 0.9 },
    bl: { x: 0.1, y: 0.9 },
  };
  const r = insetQuad(q, 0.05);
  assert.ok(r.tl.x > 0.1 && r.tl.y > 0.1 && r.br.x < 0.9 && r.br.y < 0.9);
  assert.ok(Math.abs(r.tr.x - r.tl.x - (r.br.x - r.bl.x)) < 1e-9);
});

test('pouch bulge: sealed at the sides and the top, full in the middle, footprint at the base', () => {
  assert.ok(bulge(0, 0.5) < 1e-9 && bulge(1, 0.5) < 1e-9, 'side seals');
  assert.ok(bulge(0.5, 1) < 1e-9 && bulge(0.5, 0.97) < 1e-9, 'flat heat seal');
  assert.ok(bulge(0.5, 0.5) > 0.9, 'fullest in the middle');
  assert.ok(bulge(0.5, 0) > 0.3 && bulge(0.5, 0) < bulge(0.5, 0.5), 'stands on a base');
  for (let u = 0; u <= 1; u += 0.1)
    for (let v = 0; v <= 1; v += 0.1) assert.ok(bulge(u, v) >= 0 && bulge(u, v) < 1.2);
});

test('clampAspect keeps bags plausible', () => {
  assert.equal(clampAspect(0.82), 0.82);
  assert.equal(clampAspect(0.2), 0.55);
  assert.equal(clampAspect(3), 1);
  assert.equal(clampAspect(NaN), 0.75);
});

// ---------------------------------------------------------------- AI illustration trimming + request plumbing
import { alphaBounds } from './art.js';
import { renderEndpoint } from './renderClient.js';

test('alphaBounds trims to the bag and ignores stray faint pixels', () => {
  const w = 100;
  const h = 100;
  const a = new Uint8ClampedArray(w * h);
  for (let y = 20; y < 80; y++) for (let x = 30; x < 70; x++) a[y * w + x] = 255;
  a[2 * w + 2] = 10; // faint speck below the threshold
  assert.deepEqual(alphaBounds(a, w, h), { x: 30, y: 20, w: 40, h: 60 });
});

test('alphaBounds returns null for an empty or near-empty image', () => {
  assert.equal(alphaBounds(new Uint8ClampedArray(100 * 100), 100, 100), null);
  const a = new Uint8ClampedArray(100 * 100);
  a[5050] = 255;
  assert.equal(alphaBounds(a, 100, 100), null);
});

test('renderEndpoint is the /render sibling of the scan URL', () => {
  assert.equal(
    renderEndpoint({ endpoint: 'https://x.workers.dev/scan' }),
    'https://x.workers.dev/render',
  );
  assert.equal(
    renderEndpoint({ endpoint: 'https://x.workers.dev/scan/' }),
    'https://x.workers.dev/render',
  );
  assert.equal(renderEndpoint({}), '');
});

// ---------------------------------------------------------------- scanner "Test connection"
import { sanitizeToken, statusUrl, testScanner } from './scannerTest.js';

test('sanitizeToken strips the .env prefix, quotes and spaces people paste', () => {
  assert.equal(sanitizeToken('  abc123 '), 'abc123');
  assert.equal(sanitizeToken('SCANNER_TOKEN=abc123'), 'abc123');
  assert.equal(sanitizeToken('scanner_token = abc123'), 'abc123');
  assert.equal(sanitizeToken('"abc123"'), 'abc123');
  assert.equal(sanitizeToken("SCANNER_TOKEN='abc123'\n"), 'abc123');
  assert.equal(sanitizeToken(undefined), '');
});

test('statusUrl points at the scanner root', () => {
  assert.equal(statusUrl('http://localhost:8790/scan'), 'http://localhost:8790/');
  assert.equal(statusUrl('https://x.workers.dev/scan/'), 'https://x.workers.dev/');
});

const reply = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const fake = routes => async (url, init) => routes(url, init);

test('testScanner: unreachable, missing key, bad token, good token', async () => {
  const cfg = { endpoint: 'http://localhost:8790/scan', token: 'tok' };
  let lines = await testScanner(
    cfg,
    fake(() => {
      throw new Error('Failed to fetch');
    }),
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /Can't reach the scanner/);
  assert.equal(lines[0].ok, false);

  lines = await testScanner(
    cfg,
    fake((url, init) => (init ? reply(400) : reply(200, { openaiKeySet: false }))),
  );
  assert.ok(lines.some(l => !l.ok && /no OPENAI_API_KEY/.test(l.text)));
  assert.ok(lines.some(l => l.ok && /Token accepted/.test(l.text)));

  lines = await testScanner(
    cfg,
    fake((url, init) => (init ? reply(401) : reply(200, { openaiKeySet: true }))),
  );
  assert.ok(lines.some(l => !l.ok && /Token rejected.*3 characters/.test(l.text)));

  lines = await testScanner(
    cfg,
    fake((url, init) => (init ? reply(400) : reply(200, { openaiKeySet: true }))),
  );
  assert.ok(
    lines.every(l => l.ok),
    JSON.stringify(lines),
  );
  assert.equal(lines.length, 3);

  assert.match((await testScanner({ endpoint: '', token: 'x' }))[0].text, /Enter the scanner URL/);
  assert.ok(
    (
      await testScanner(
        { endpoint: cfg.endpoint, token: '' },
        fake(() => reply(200, { openaiKeySet: true })),
      )
    ).some(l => /No token/.test(l.text)),
  );
});
