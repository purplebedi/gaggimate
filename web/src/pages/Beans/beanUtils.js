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
