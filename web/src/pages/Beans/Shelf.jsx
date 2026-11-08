import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import './shelf.css';
import { Bag } from './Bag.jsx';
import { beanPalette, beanTitle, statsFor } from './beanUtils.js';

const WINDOW = 7; // bags rendered either side of the centre
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const prefersReducedMotion = () =>
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * iPod-style cover-flow of 3D coffee bags. Drag / swipe / wheel / arrow keys to browse, click the centre bag to
 * flip it over and read the details you logged. Motion is a small spring simulation that writes transforms
 * straight to the DOM, so React only re-renders when the centred bag changes.
 */
export function Shelf({ beans, stats, activeId, initialId, onSetActive, onEdit, onOpen }) {
  const stageRef = useRef(null);
  const items = useRef(new Map()); // index -> { el, body }
  const sim = useRef({
    pos: 0,
    target: 0,
    flipIdx: -1,
    flip: new Map(),
    maxFlip: 0,
    W: 180,
    raf: 0,
    last: 0,
    shown: 0,
    down: null,
    dragging: false,
    vel: 0,
    wheelT: 0,
    count: 0,
  });
  const [center, setCenter] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const count = beans.length;
  sim.current.count = count;
  const idsKey = beans.map(b => b.id).join(',');
  const centerIdRef = useRef(initialId || '');

  // ---- placement of one item from the simulation state
  const place = useCallback(i => {
    const e = items.current.get(i);
    if (!e) return;
    const s = sim.current;
    const W = s.W;
    const d = i - s.pos;
    const ad = Math.abs(d);
    const sg = Math.sign(d);
    const near = Math.min(ad, 1);
    const far = Math.max(0, ad - 1);
    const f = s.flip.get(i) ?? 0;
    const x = sg * (near * W * 0.68 + far * W * 0.3) + sg * near * s.maxFlip * W * 0.46;
    const z = -near * W * 0.8 - far * W * 0.2 + f * W * 0.6;
    const ry = sg * near * 54;
    e.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(-f * W * 0.05).toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) scale(${(1 + f * 0.34).toFixed(3)})`;
    e.el.style.zIndex = String(300 - Math.round(ad * 10) + (f > 0.02 ? 100 : 0));
    e.el.style.setProperty('--dim', clamp(near * 0.16 + far * 0.1, 0, 0.8).toFixed(3));
    e.body.style.transform = f > 0 ? `rotateY(${(f * 180).toFixed(2)}deg)` : '';
  }, []);

  const placeAll = useCallback(() => {
    for (const i of items.current.keys()) place(i);
  }, [place]);

  // ---- animation loop (only runs while something is moving)
  const tick = useCallback(
    t => {
      const s = sim.current;
      const dt = Math.min(0.05, (t - s.last) / 1000 || 0.016);
      s.last = t;
      const reduce = prefersReducedMotion();
      let busy = false;
      if (s.dragging) {
        busy = true;
      } else {
        const diff = s.target - s.pos;
        if (reduce || Math.abs(diff) < 0.0008) {
          s.pos = s.target;
        } else {
          s.pos += diff * (1 - Math.exp(-dt * 9));
          busy = true;
        }
      }
      s.maxFlip = 0;
      for (const i of items.current.keys()) {
        const want = i === s.flipIdx ? 1 : 0;
        let f = s.flip.get(i) ?? 0;
        const df = want - f;
        if (reduce || Math.abs(df) < 0.002) f = want;
        else {
          f += df * (1 - Math.exp(-dt * 7));
          busy = true;
        }
        s.flip.set(i, f);
        s.maxFlip = Math.max(s.maxFlip, f);
      }
      placeAll();
      const nearest = clamp(Math.round(s.dragging ? s.pos : s.target), 0, Math.max(0, s.count - 1));
      if (nearest !== s.shown) {
        s.shown = nearest;
        setCenter(nearest);
      }
      s.raf = busy ? requestAnimationFrame(tick) : 0;
    },
    [placeAll],
  );

  const kick = useCallback(() => {
    const s = sim.current;
    if (!s.raf) {
      s.last = performance.now();
      s.raf = requestAnimationFrame(tick);
    }
  }, [tick]);

  const unflip = useCallback(() => {
    sim.current.flipIdx = -1;
    setFlipped(false);
  }, []);

  const goTo = useCallback(
    (i, { instant = false } = {}) => {
      const s = sim.current;
      const idx = clamp(i, 0, Math.max(0, s.count - 1));
      if (s.flipIdx >= 0 && s.flipIdx !== idx) unflip();
      s.target = idx;
      if (instant) s.pos = idx;
      kick();
    },
    [kick, unflip],
  );

  const toggleFlip = useCallback(() => {
    const s = sim.current;
    const idx = clamp(Math.round(s.target), 0, s.count - 1);
    if (s.flipIdx === idx) {
      unflip();
    } else {
      s.flipIdx = idx;
      setFlipped(true);
    }
    kick();
  }, [kick, unflip]);

  // ---- list changed (filter / sort / data): keep the same bag centred when possible
  useLayoutEffect(() => {
    const s = sim.current;
    let idx = beans.findIndex(b => b.id === centerIdRef.current);
    if (idx < 0)
      idx = Math.max(
        0,
        beans.findIndex(b => b.id === initialId),
      );
    if (idx < 0) idx = 0;
    s.pos = s.target = idx;
    s.shown = idx;
    s.flipIdx = -1;
    s.flip.clear();
    setFlipped(false);
    setCenter(idx);
  }, [idsKey]);

  // remember who is centred so filtering doesn't lose your place
  useEffect(() => {
    if (beans[center]) centerIdRef.current = beans[center].id;
  }, [center, idsKey]);

  // after every render (new bags mounted) put every bag where the simulation says
  useLayoutEffect(() => {
    const first = items.current.values().next().value;
    if (first) sim.current.W = first.el.offsetWidth || sim.current.W;
    placeAll();
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const first = items.current.values().next().value;
      if (first) sim.current.W = first.el.offsetWidth || sim.current.W;
      placeAll();
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, [placeAll]);

  useEffect(() => () => cancelAnimationFrame(sim.current.raf), []);

  // ---- wheel / trackpad (needs a non-passive listener to stop the page scrolling)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onWheel = e => {
      const s = sim.current;
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const delta = horizontal ? e.deltaX : e.deltaY;
      if (!delta) return;
      const atEnd = (delta > 0 && s.pos >= s.count - 1 - 0.01) || (delta < 0 && s.pos <= 0.01);
      if (atEnd && !horizontal) return; // let the page scroll past the ends
      e.preventDefault();
      if (s.flipIdx >= 0) unflip();
      s.pos = clamp(s.pos + delta / 220, -0.25, s.count - 0.75);
      s.target = s.pos;
      clearTimeout(s.wheelT);
      s.wheelT = setTimeout(() => {
        s.target = clamp(Math.round(s.pos), 0, s.count - 1);
        kick();
      }, 110);
      const nearest = clamp(Math.round(s.pos), 0, s.count - 1);
      if (nearest !== s.shown) {
        s.shown = nearest;
        setCenter(nearest);
      }
      kick();
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [kick, unflip]);

  // ---- pointer: drag to browse, tap to pick / flip, hover to tilt the centre bag
  const onPointerDown = e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const s = sim.current;
    s.down = {
      x: e.clientX,
      startPos: s.pos,
      t: performance.now(),
      lastX: e.clientX,
      lastT: performance.now(),
      id: e.pointerId,
    };
    s.vel = 0;
  };
  const onPointerMove = e => {
    const s = sim.current;
    const stage = stageRef.current;
    if (s.down) {
      const dx = e.clientX - s.down.x;
      if (!s.dragging && Math.abs(dx) > 6) {
        s.dragging = true;
        if (s.flipIdx >= 0) unflip();
        stage.setPointerCapture?.(s.down.id);
      }
      if (s.dragging) {
        s.pos = clamp(s.down.startPos - dx / (s.W * 0.5), -0.3, s.count - 0.7);
        const now = performance.now();
        const dt = Math.max(1, now - s.down.lastT);
        s.vel = -(e.clientX - s.down.lastX) / (s.W * 0.5) / dt; // index units per ms
        s.down.lastX = e.clientX;
        s.down.lastT = now;
        kick();
      }
      return;
    }
    // idle hover: tilt + sheen on the centred bag
    const rect = stage.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    const c = items.current.get(clamp(Math.round(s.target), 0, s.count - 1));
    const sway = c?.el.querySelector('.bag-sway');
    if (sway && s.flipIdx < 0) {
      sway.style.setProperty('--ty', `${(nx * 14).toFixed(2)}deg`);
      sway.style.setProperty('--tx', `${(-ny * 8).toFixed(2)}deg`);
      sway.style.setProperty('--sheen', `${(70 - nx * 90).toFixed(1)}%`);
    }
  };
  const onPointerUp = e => {
    const s = sim.current;
    const down = s.down;
    s.down = null;
    if (!down) return;
    if (s.dragging) {
      s.dragging = false;
      stageRef.current.releasePointerCapture?.(down.id);
      s.target = clamp(Math.round(s.pos + s.vel * 220), 0, s.count - 1);
      kick();
      return;
    }
    const hit = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find(n => n.classList?.contains('shelf-item'));
    if (!hit) return;
    const idx = Number(hit.dataset.idx);
    if (idx === clamp(Math.round(s.target), 0, s.count - 1)) toggleFlip();
    else goTo(idx);
  };
  const onPointerLeave = () => {
    const sway = stageRef.current?.querySelector('.is-center .bag-sway');
    if (sway) {
      sway.style.removeProperty('--ty');
      sway.style.removeProperty('--tx');
      sway.style.removeProperty('--sheen');
    }
  };

  const onKeyDown = e => {
    const s = sim.current;
    const at = clamp(Math.round(s.target), 0, s.count - 1);
    if (e.key === 'ArrowRight') goTo(at + 1);
    else if (e.key === 'ArrowLeft') goTo(at - 1);
    else if (e.key === 'Home') goTo(0);
    else if (e.key === 'End') goTo(s.count - 1);
    else if (e.key === 'Enter' || e.key === ' ') toggleFlip();
    else if (e.key === 'Escape') {
      unflip();
      kick();
    } else return;
    e.preventDefault();
  };

  if (count === 0) return null;
  const current = beans[center] || beans[0];
  const currentStats = statsFor(stats, current.id);
  const isActive = current.id === activeId;

  return (
    <div className='flex flex-col gap-4' data-testid='shelf'>
      <div
        ref={stageRef}
        className='shelf-stage'
        style={{ '--glow': beanPalette(current).base }}
        tabIndex={0}
        role='group'
        aria-roledescription='carousel'
        aria-label='Bean shelf'
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        data-testid='shelf-stage'
      >
        <div className='shelf-board' />
        <div className='shelf-floorglow' />
        {beans.map(
          (bean, i) =>
            Math.abs(i - center) <= WINDOW && (
              <div
                key={bean.id}
                data-idx={i}
                data-testid='shelf-bag'
                className={[
                  'shelf-item',
                  i === center && 'is-center',
                  i === center && flipped && 'is-flipped',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden={i === center ? undefined : 'true'}
                ref={el => {
                  if (el) items.current.set(i, { el, body: el.querySelector('.bag-body') });
                  else items.current.delete(i);
                }}
              >
                <Bag bean={bean} stats={statsFor(stats, bean.id)} active={bean.id === activeId} />
              </div>
            ),
        )}
      </div>

      <div className='shelf-caption' aria-live='polite' data-testid='shelf-caption'>
        {current.roaster && <div className='shelf-caption-roaster'>{current.roaster}</div>}
        <div className='shelf-caption-name'>{current.name || beanTitle(current)}</div>
        <div className='text-base-content/60 mt-1 text-sm'>
          {isActive && <span className='badge badge-success badge-sm mr-2'>In the grinder</span>}
          {center + 1} of {count}
          {currentStats.average !== null && ` · ★ ${currentStats.average.toFixed(1)}`}
        </div>
      </div>

      <div className='flex flex-col items-center gap-3'>
        {count > 1 && (
          <input
            className='shelf-scrub text-base-content'
            type='range'
            min={0}
            max={count - 1}
            step={1}
            value={center}
            aria-label='Scroll through beans'
            onInput={e => goTo(Number(e.currentTarget.value))}
          />
        )}
        {flipped ? (
          <div className='flex flex-wrap justify-center gap-2' data-testid='shelf-actions'>
            {isActive ? (
              <span className='btn btn-sm btn-success btn-disabled'>In the grinder</span>
            ) : (
              <button className='btn btn-sm btn-primary' onClick={() => onSetActive(current)}>
                Set as active bean
              </button>
            )}
            <button className='btn btn-sm btn-outline' onClick={() => onOpen(current)}>
              Shots &amp; details
            </button>
            <button className='btn btn-sm btn-ghost' onClick={() => onEdit(current)}>
              Edit
            </button>
            <button
              className='btn btn-sm btn-ghost'
              onClick={() => {
                unflip();
                kick();
              }}
            >
              Flip back
            </button>
          </div>
        ) : (
          <div className='text-base-content/50 text-xs'>
            Click the bag to flip it · drag, scroll or use ← → to browse
          </div>
        )}
      </div>
    </div>
  );
}
