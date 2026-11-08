import { beanPalette, daysOffRoast, roastDots } from './beanUtils.js';
import { coverUrl } from '../../services/BeanService.js';

const ROAST_LABEL = {
  light: 'Light roast',
  'medium-light': 'Medium-light roast',
  medium: 'Medium roast',
  'medium-dark': 'Medium-dark roast',
  dark: 'Dark roast',
};

function Stars({ value }) {
  const full = Math.round(value);
  return (
    <span className='bag-stars' aria-label={`${value.toFixed(1)} of 5 stars`}>
      {'★'.repeat(full)}
      <span className='bag-stars-off'>{'★'.repeat(5 - full)}</span>
    </span>
  );
}

/** Printed-looking label for beans without a photo. */
function GeneratedFront({ bean }) {
  const dots = roastDots(bean.roastLevel);
  const initial = (bean.roaster || bean.name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className='bag-label'>
      {bean.roaster && <div className='bag-label-roaster'>{bean.roaster}</div>}
      <div className='bag-label-emblem' aria-hidden='true'>
        <svg viewBox='0 0 64 64' width='100%' height='100%'>
          <circle cx='32' cy='32' r='29' fill='none' stroke='currentColor' strokeWidth='1.5' />
          <circle
            cx='32'
            cy='32'
            r='24'
            fill='none'
            stroke='currentColor'
            strokeWidth='0.75'
            strokeDasharray='2 3'
          />
          <ellipse
            cx='32'
            cy='33'
            rx='10'
            ry='14'
            fill='currentColor'
            opacity='0.16'
            transform='rotate(28 32 33)'
          />
          <path
            d='M25 43c8-3 14-12 14-24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
          />
        </svg>
        <span>{initial}</span>
      </div>
      <div className='bag-label-name'>{bean.name}</div>
      {(bean.origin || bean.region) && (
        <div className='bag-label-origin'>
          {[bean.origin, bean.region].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className='bag-label-foot'>
        {dots > 0 && (
          <div className='bag-label-dots' aria-hidden='true'>
            {[1, 2, 3, 4, 5].map(i => (
              <i key={i} className={i <= dots ? 'on' : ''} />
            ))}
          </div>
        )}
        {bean.process && <div className='bag-label-process'>{bean.process}</div>}
      </div>
    </div>
  );
}

function Details({ bean, stats, active }) {
  const age = daysOffRoast(bean.roastDate);
  const rows = [
    ['Origin', [bean.origin, bean.region].filter(Boolean).join(', ')],
    ['Process', bean.process],
    ['Varietal', bean.varietal],
    [
      'Roast',
      [ROAST_LABEL[bean.roastLevel], age !== null && `${age}d off roast`]
        .filter(Boolean)
        .join(' · '),
    ],
  ].filter(([, v]) => v);
  return (
    <div className='bag-details'>
      <div className='bag-details-kicker'>{active ? '● In the grinder' : 'Logged beans'}</div>
      <div className='bag-details-name'>{bean.name}</div>
      {bean.roaster && <div className='bag-details-roaster'>{bean.roaster}</div>}
      <div className='bag-details-rule' />
      <dl className='bag-details-rows'>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {bean.tastingNotes && <p className='bag-details-notes'>“{bean.tastingNotes}”</p>}
      <div className='bag-details-rule' />
      <div className='bag-details-shots'>
        {stats.average !== null ? (
          <>
            <Stars value={stats.average} />
            <span>
              {stats.average.toFixed(1)} · {stats.count} shot{stats.count === 1 ? '' : 's'}
            </span>
          </>
        ) : (
          <span>
            {stats.count > 0
              ? `${stats.count} shot${stats.count === 1 ? '' : 's'} · not rated yet`
              : 'No shots yet'}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A stand-up coffee pouch built from CSS 3D planes (front cover, details label on the back, gusset sides,
 * crimped top and bottom). The shelf drives its transforms; this only renders the geometry.
 */
export function Bag({ bean, stats, active }) {
  const p = beanPalette(bean);
  const url = coverUrl(bean);
  return (
    <div
      className='bag'
      style={{ '--bag': p.base, '--bag-dark': p.dark, '--bag-light': p.light, '--bag-ink': p.ink }}
    >
      <div className='bag-sway'>
        <div className='bag-body'>
          <div className='bag-face bag-front'>
            {url ? (
              <img className='bag-cover' src={url} alt='' draggable={false} decoding='async' />
            ) : (
              <GeneratedFront bean={bean} />
            )}
            <div className='bag-seal' />
            <div className='bag-shade' />
            <div className='bag-sheen' />
            {active && <div className='bag-led' title='In the grinder' />}
            <div className='bag-dim' />
          </div>
          <div className='bag-face bag-back'>
            <Details bean={bean} stats={stats} active={active} />
            <div className='bag-seal' />
            <div className='bag-shade' />
            <div className='bag-dim' />
          </div>
          <div className='bag-side bag-left' />
          <div className='bag-side bag-right' />
          <div className='bag-cap bag-top' />
          <div className='bag-cap bag-bottom' />
        </div>
      </div>
    </div>
  );
}
