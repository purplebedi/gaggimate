import { daysOffRoast } from './beanUtils.js';

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

/** The paper spec-sheet for a bean: what you logged about it. Shown beside the flipped bag. */
export function DetailsCard({ bean, stats, active }) {
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
    <div className='shelf-card' data-testid='details-card'>
      <div className='shelf-card-paper'>
        <div className='shelf-card-inner'>
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
      </div>
    </div>
  );
}
