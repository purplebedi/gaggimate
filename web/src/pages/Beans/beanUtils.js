import dayjs from 'dayjs';

export const ROAST_LEVELS = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'];

export const EMPTY_BEAN = {
  name: '',
  roaster: '',
  origin: '',
  region: '',
  process: '',
  varietal: '',
  roastLevel: '',
  roastDate: '',
  tastingNotes: '',
};

/** Whole days between the roast date and today, or null if unknown/invalid. */
export function daysOffRoast(roastDate, now = dayjs()) {
  if (!roastDate) return null;
  const d = dayjs(roastDate);
  if (!d.isValid()) return null;
  const days = now.startOf('day').diff(d.startOf('day'), 'day');
  return days < 0 ? null : days;
}

/** Average of the non-zero star ratings; null when nothing has been rated. */
export function summarizeShots(shots) {
  const rated = shots.map(s => Number(s.rating) || 0).filter(r => r > 0);
  return {
    count: shots.length,
    ratedCount: rated.length,
    average: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
  };
}

/** Merge scanner output over a bean, only taking known string fields. */
export function applyScan(bean, scan) {
  const next = { ...bean };
  for (const key of Object.keys(EMPTY_BEAN)) {
    const value = scan?.[key];
    if (typeof value === 'string' && value.trim()) next[key] = value.trim();
  }
  if (next.roastLevel && !ROAST_LEVELS.includes(next.roastLevel)) next.roastLevel = '';
  if (next.roastDate && !dayjs(next.roastDate).isValid()) next.roastDate = '';
  return next;
}

export function beanTitle(bean) {
  return [bean.roaster, bean.name].filter(Boolean).join(' – ') || 'Untitled bean';
}

// ---------------------------------------------------------------- stats & palette

/** stats entry from the machine ({n, r, s}) -> {count, ratedCount, average} */
export function statsFor(stats, id) {
  const e = stats?.[id];
  if (!e) return { count: 0, ratedCount: 0, average: null };
  return { count: e.n || 0, ratedCount: e.r || 0, average: e.r ? e.s / e.r : null };
}

const ROAST_COLORS = {
  light: '#d8b57a',
  'medium-light': '#c99a5b',
  medium: '#a9703b',
  'medium-dark': '#74482a',
  dark: '#3d2a1f',
};
const FALLBACK_COLORS = [
  '#b5651d',
  '#7a8b5c',
  '#a14a3b',
  '#5d7a8a',
  '#c28b2c',
  '#8a5a7a',
  '#4f6b5a',
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = rgb =>
  `#${rgb
    .map(v =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Colours for a bag: base, shaded edges, highlight and legible text colours. */
export function beanPalette(bean) {
  const base =
    hexToRgb(bean.color) ||
    hexToRgb(ROAST_COLORS[bean.roastLevel]) ||
    hexToRgb(FALLBACK_COLORS[hash(`${bean.roaster}${bean.name}`) % FALLBACK_COLORS.length]);
  const luminance = (0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]) / 255;
  return {
    base: toHex(base),
    dark: toHex(mix(base, [20, 12, 8], 0.55)),
    light: toHex(mix(base, [255, 248, 235], 0.35)),
    ink: luminance > 0.62 ? '#2a1a10' : '#fbf3e6',
  };
}

export function roastDots(level) {
  const i = ROAST_LEVELS.indexOf(level);
  return i < 0 ? 0 : i + 1;
}

// ---------------------------------------------------------------- filters

export const EMPTY_FILTERS = {
  q: '',
  roast: [],
  origin: [],
  process: [],
  roaster: [],
  fresh: 'any', // any | 14 | 30 | older
  rating: 'any', // any | 3 | 4 | 4.5 | unrated
  activeOnly: false,
};

export const SORTS = [
  ['newest', 'Recently added'],
  ['name', 'Name A–Z'],
  ['roasted', 'Freshest roast'],
  ['rating', 'Highest rated'],
  ['shots', 'Most shots'],
];

const norm = v => (v || '').trim().toLowerCase();

export function activeFilterCount(f) {
  return (
    f.roast.length +
    f.origin.length +
    f.process.length +
    f.roaster.length +
    (f.fresh !== 'any' ? 1 : 0) +
    (f.rating !== 'any' ? 1 : 0) +
    (f.activeOnly ? 1 : 0)
  );
}

/** Distinct values (with counts) for the filter chips, most common first. */
export function facets(beans, field) {
  const map = new Map();
  for (const b of beans) {
    const key = norm(b[field]);
    if (!key) continue;
    const e = map.get(key) || { key, label: b[field].trim(), count: 0 };
    e.count++;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function filterBeans(beans, f, { stats = {}, activeId = '', now = dayjs() } = {}) {
  const q = norm(f.q);
  return beans.filter(b => {
    if (
      q &&
      !norm(
        `${b.name} ${b.roaster} ${b.origin} ${b.region} ${b.process} ${b.varietal} ${b.tastingNotes}`,
      ).includes(q)
    )
      return false;
    if (f.roast.length && !f.roast.includes(b.roastLevel)) return false;
    if (f.origin.length && !f.origin.includes(norm(b.origin))) return false;
    if (f.process.length && !f.process.includes(norm(b.process))) return false;
    if (f.roaster.length && !f.roaster.includes(norm(b.roaster))) return false;
    if (f.activeOnly && b.id !== activeId) return false;
    if (f.fresh !== 'any') {
      const age = daysOffRoast(b.roastDate, now);
      if (age === null) return false;
      if (f.fresh === '14' && age > 14) return false;
      if (f.fresh === '30' && age > 30) return false;
      if (f.fresh === 'older' && age <= 30) return false;
    }
    if (f.rating !== 'any') {
      const { average } = statsFor(stats, b.id);
      if (f.rating === 'unrated') {
        if (average !== null) return false;
      } else if (average === null || average < Number(f.rating)) return false;
    }
    return true;
  });
}

export function sortBeans(beans, sort, stats = {}, now = dayjs()) {
  const by = {
    newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    name: (a, b) => beanTitle(a).localeCompare(beanTitle(b)),
    roasted: (a, b) =>
      (daysOffRoast(a.roastDate, now) ?? 9999) - (daysOffRoast(b.roastDate, now) ?? 9999),
    rating: (a, b) => (statsFor(stats, b.id).average ?? -1) - (statsFor(stats, a.id).average ?? -1),
    shots: (a, b) => statsFor(stats, b.id).count - statsFor(stats, a.id).count,
  };
  return [...beans].sort(by[sort] || by.newest);
}
