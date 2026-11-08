import { useEffect, useState } from 'preact/hooks';
import dayjs from 'dayjs';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash';
import { faPen } from '@fortawesome/free-solid-svg-icons/faPen';
import { useConfirmAction } from '../../hooks/useConfirmAction.js';
import { getBeanShots } from '../../services/BeanService.js';
import { beanTitle, daysOffRoast, summarizeShots } from './beanUtils.js';

function Stars({ value }) {
  return (
    <span aria-label={`${value} of 5 stars`} className='text-yellow-400'>
      {'★'.repeat(Math.round(value))}
      <span className='text-base-content/20'>{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  );
}

export function BeanDetail({ apiService, bean, isActive, onEdit, onDelete, onSetActive, onClose }) {
  const [shots, setShots] = useState(null);
  const [error, setError] = useState('');
  const { armed, armOrRun } = useConfirmAction();

  useEffect(() => {
    let cancelled = false;
    setShots(null);
    getBeanShots(apiService, bean.id)
      .then(result => !cancelled && setShots(result))
      .catch(err => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [bean.id]);

  const summary = shots ? summarizeShots(shots) : null;
  const age = daysOffRoast(bean.roastDate);
  const facts = [
    ['Origin', [bean.origin, bean.region].filter(Boolean).join(', ')],
    ['Process', bean.process],
    ['Varietal', bean.varietal],
    ['Roast', [bean.roastLevel, age !== null && `${age}d off roast`].filter(Boolean).join(' · ')],
  ].filter(([, v]) => v);
  const sorted = shots ? [...shots].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : [];

  return (
    <div className='flex flex-col gap-4' data-testid='bean-detail'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div>
          <h2 className='text-xl font-bold'>{beanTitle(bean)}</h2>
          {bean.tastingNotes && (
            <p className='text-base-content/70 text-sm italic'>{bean.tastingNotes}</p>
          )}
        </div>
        <div className='flex items-center gap-1'>
          <button className='btn btn-ghost btn-sm' onClick={onEdit} aria-label='Edit bean'>
            <FontAwesomeIcon icon={faPen} />
          </button>
          <button
            className={`btn btn-sm ${armed ? 'btn-error' : 'btn-ghost text-error'}`}
            onClick={() => armOrRun(onDelete)}
            aria-label={armed ? 'Confirm delete (shots keep their notes)' : 'Delete bean'}
          >
            <FontAwesomeIcon icon={faTrash} />
            {armed && <span>Confirm</span>}
          </button>
        </div>
      </div>

      {facts.length > 0 && (
        <dl className='grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className='text-base-content/60 text-xs uppercase'>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className='flex flex-wrap items-center gap-3'>
        {isActive ? (
          <span className='badge badge-success'>Active — new shots are tagged with this bean</span>
        ) : (
          <button className='btn btn-primary btn-sm' onClick={onSetActive}>
            Set as active bean
          </button>
        )}
      </div>

      <div>
        <h3 className='mb-2 font-semibold'>
          Shots{' '}
          {summary && summary.average !== null && (
            <span className='text-sm font-normal' data-testid='avg-rating'>
              <Stars value={summary.average} /> {summary.average.toFixed(1)} avg (
              {summary.ratedCount} rated)
            </span>
          )}
        </h3>
        {error && <div className='text-error text-sm'>{error}</div>}
        {!shots && !error && <span className='loading loading-spinner loading-sm' />}
        {shots && shots.length === 0 && (
          <p className='text-base-content/60 text-sm'>
            No shots yet. Make this the active bean and pull a shot.
          </p>
        )}
        {shots && shots.length > 0 && (
          <ul className='divide-base-content/10 divide-y' data-testid='bean-shots'>
            {sorted.map(s => (
              <li key={s.id} className='flex flex-wrap items-center justify-between gap-2 py-2'>
                <div className='text-sm'>
                  <a className='link' href={`/analyzer/history/${s.id}`}>
                    #{s.id}
                  </a>{' '}
                  {s.timestamp ? (
                    <span className='text-base-content/60'>
                      {dayjs.unix(s.timestamp).format('D MMM YYYY HH:mm')}
                    </span>
                  ) : null}
                  {s.ratio ? <span className='ml-2'>1:{s.ratio}</span> : null}
                  {s.balanceTaste ? (
                    <span className='ml-2 capitalize'>{s.balanceTaste}</span>
                  ) : null}
                  {s.notes ? <div className='text-base-content/70 text-xs'>{s.notes}</div> : null}
                </div>
                {Number(s.rating) > 0 ? <Stars value={Number(s.rating)} /> : <span>—</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className='flex justify-end'>
        <button className='btn btn-ghost' onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
