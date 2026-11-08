import { useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass';
import { faSliders } from '@fortawesome/free-solid-svg-icons/faSliders';
import { EMPTY_FILTERS, ROAST_LEVELS, SORTS, activeFilterCount, facets } from './beanUtils.js';

function Chip({ on, onClick, children, testid }) {
  return (
    <button
      type='button'
      aria-pressed={on}
      data-testid={testid}
      onClick={onClick}
      className={`btn btn-xs rounded-full normal-case ${on ? 'btn-primary' : 'btn-outline border-base-content/20'}`}
    >
      {children}
    </button>
  );
}

function Group({ label, children }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='text-base-content/60 text-[0.68rem] font-semibold tracking-wider uppercase'>
        {label}
      </div>
      <div className='flex flex-wrap gap-1.5'>{children}</div>
    </div>
  );
}

const toggle = (list, v) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

export function ShelfFilters({
  beans,
  filters,
  setFilters,
  sort,
  setSort,
  hasRatings,
  shown,
  total,
  view,
  setView,
  canShelf = true,
}) {
  const [open, setOpen] = useState(false);
  const set = patch => setFilters(prev => ({ ...prev, ...patch }));
  const count = activeFilterCount(filters);
  const origins = facets(beans, 'origin');
  const processes = facets(beans, 'process');
  const roasters = facets(beans, 'roaster');
  const roastsPresent = ROAST_LEVELS.filter(l => beans.some(b => b.roastLevel === l));

  return (
    <div className='flex flex-col gap-3' data-testid='filters'>
      <div className='flex flex-wrap items-center gap-2'>
        <label className='input input-bordered input-sm flex min-w-0 flex-1 items-center gap-2 sm:max-w-xs'>
          <FontAwesomeIcon icon={faMagnifyingGlass} className='text-base-content/50' />
          <input
            type='search'
            className='grow'
            placeholder='Search beans'
            aria-label='Search beans'
            value={filters.q}
            onInput={e => set({ q: e.currentTarget.value })}
          />
        </label>
        <select
          className='select select-bordered select-sm'
          aria-label='Sort beans'
          value={sort}
          onChange={e => setSort(e.currentTarget.value)}
        >
          {SORTS.filter(([k]) => hasRatings || (k !== 'rating' && k !== 'shots')).map(
            ([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ),
          )}
        </select>
        <button
          type='button'
          className={`btn btn-sm ${open || count ? 'btn-primary' : 'btn-outline border-base-content/20'}`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          data-testid='filters-toggle'
        >
          <FontAwesomeIcon icon={faSliders} />
          Filters
          {count > 0 && <span className='badge badge-sm badge-neutral'>{count}</span>}
        </button>
        <div className='join ml-auto' role='group' aria-label='View'>
          {[
            ['shelf', 'Shelf'],
            ['list', 'List'],
          ]
            .filter(([k]) => canShelf || k !== 'shelf')
            .map(([k, label]) => (
              <button
                key={k}
                type='button'
                aria-pressed={view === k}
                className={`btn btn-sm join-item ${view === k ? 'btn-neutral' : 'btn-outline border-base-content/20'}`}
                onClick={() => setView(k)}
              >
                {label}
              </button>
            ))}
        </div>
      </div>

      {open && (
        <div
          className='bg-base-100 border-base-content/10 flex flex-col gap-4 rounded-2xl border p-4 shadow-sm'
          data-testid='filters-panel'
        >
          {roastsPresent.length > 0 && (
            <Group label='Roast'>
              {roastsPresent.map(l => (
                <Chip
                  key={l}
                  on={filters.roast.includes(l)}
                  onClick={() => set({ roast: toggle(filters.roast, l) })}
                  testid={`f-roast-${l}`}
                >
                  {l}
                </Chip>
              ))}
            </Group>
          )}
          {origins.length > 0 && (
            <Group label='Origin'>
              {origins.map(o => (
                <Chip
                  key={o.key}
                  on={filters.origin.includes(o.key)}
                  onClick={() => set({ origin: toggle(filters.origin, o.key) })}
                >
                  {o.label} <span className='opacity-60'>{o.count}</span>
                </Chip>
              ))}
            </Group>
          )}
          {processes.length > 0 && (
            <Group label='Process'>
              {processes.map(o => (
                <Chip
                  key={o.key}
                  on={filters.process.includes(o.key)}
                  onClick={() => set({ process: toggle(filters.process, o.key) })}
                >
                  {o.label} <span className='opacity-60'>{o.count}</span>
                </Chip>
              ))}
            </Group>
          )}
          {roasters.length > 1 && (
            <Group label='Roaster'>
              {roasters.map(o => (
                <Chip
                  key={o.key}
                  on={filters.roaster.includes(o.key)}
                  onClick={() => set({ roaster: toggle(filters.roaster, o.key) })}
                >
                  {o.label} <span className='opacity-60'>{o.count}</span>
                </Chip>
              ))}
            </Group>
          )}
          <Group label='Roasted'>
            {[
              ['any', 'Any time'],
              ['14', 'Last 2 weeks'],
              ['30', 'Last month'],
              ['older', 'Older'],
            ].map(([k, label]) => (
              <Chip
                key={k}
                on={filters.fresh === k}
                onClick={() => set({ fresh: k })}
                testid={`f-fresh-${k}`}
              >
                {label}
              </Chip>
            ))}
          </Group>
          {hasRatings && (
            <Group label='Your rating'>
              {[
                ['any', 'Any'],
                ['3', '3★ +'],
                ['4', '4★ +'],
                ['4.5', '4.5★ +'],
                ['unrated', 'Unrated'],
              ].map(([k, label]) => (
                <Chip
                  key={k}
                  on={filters.rating === k}
                  onClick={() => set({ rating: k })}
                  testid={`f-rating-${k}`}
                >
                  {label}
                </Chip>
              ))}
            </Group>
          )}
          <Group label='Status'>
            <Chip
              on={filters.activeOnly}
              onClick={() => set({ activeOnly: !filters.activeOnly })}
              testid='f-active'
            >
              In the grinder
            </Chip>
          </Group>
        </div>
      )}

      {(count > 0 || filters.q) && (
        <div
          className='text-base-content/70 flex items-center gap-3 text-sm'
          data-testid='filter-summary'
        >
          <span>
            Showing {shown} of {total} bean{total === 1 ? '' : 's'}
          </span>
          <button
            type='button'
            className='link link-hover text-primary'
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
