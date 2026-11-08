import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  DirectionalLight,
  HemisphereLight,
  NoToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './shelf.css';
import { createBag, createCardBag } from './bag3d.js';
import { loadArtViews, loadBagTextures } from './bagTextures.js';
import { DetailsCard } from './DetailsCard.jsx';
import { beanPalette, beanTitle, statsFor } from './beanUtils.js';

const WINDOW = 6; // bags built either side of the centre
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const prefersReducedMotion = () =>
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let webglOk; // probing creates a throwaway context, so do it once
/** True when this browser can create a WebGL context (the shelf needs it). */
export function webglSupported() {
  if (webglOk === undefined) {
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      webglOk = !!g;
      g?.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context straight away
    } catch {
      webglOk = false;
    }
  }
  return webglOk;
}

const signature = b =>
  [
    b.id,
    b.ar,
    b.finish,
    b.color,
    b.photoV,
    b.hasPhoto,
    b.hasBack,
    b.name,
    b.roaster,
    b.origin,
    b.region,
    b.process,
    b.roastLevel,
  ].join('|');

/**
 * Cover-flow of real 3D coffee bags (three.js). Drag / swipe / wheel / arrow keys to browse, click the centred bag
 * to flip it and see its back plus what you logged. Motion is a small spring simulation; a frame is only rendered
 * while something is moving, so an idle shelf costs nothing.
 */
export function Shelf({ beans, stats, activeId, initialId, onSetActive, onEdit, onOpen }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const gl = useRef(null); // { renderer, scene, camera, raycaster, entries: Map<idx, entry> }
  const sim = useRef({
    pos: 0,
    target: 0,
    flipIdx: -1,
    flip: new Map(),
    maxFlip: 0,
    raf: 0,
    last: 0,
    shown: 0,
    down: null,
    dragging: false,
    vel: 0,
    wheelT: 0,
    count: 0,
    tiltX: 0,
    tiltY: 0,
    tiltTX: 0,
    tiltTY: 0,
    cardShift: 0,
  });
  const [center, setCenter] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [glError, setGlError] = useState('');
  const count = beans.length;
  sim.current.count = count;
  const idsKey = beans.map(signature).join(',');
  const centerIdRef = useRef(initialId || '');
  const beansRef = useRef(beans);
  beansRef.current = beans;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  // ---- put one bag where the simulation says
  const place = useCallback((i, entry) => {
    const s = sim.current;
    const d = i - s.pos;
    const ad = Math.abs(d);
    const sg = Math.sign(d);
    const near = Math.min(ad, 1);
    const far = Math.max(0, ad - 1);
    const f = s.flip.get(i) ?? 0;
    const bag = entry.bag;
    if (!bag) return;
    const g = bag.group;
    g.position.set(
      sg * (near * 1.02 + far * 0.45) + sg * near * s.maxFlip * 0.75 - f * s.cardShift,
      f * 0.03,
      -near * 1.05 - far * 0.32 + f * 0.55,
    );
    const centred = 1 - near; // 1 at the centre, 0 once a full slot away
    const yaw = -sg * near * 0.97 + f * Math.PI + s.tiltY * centred * (1 - f);
    g.rotation.set(s.tiltX * centred * (1 - f), yaw, 0);
    g.scale.setScalar(1 + f * 0.1);
    bag.setDim(clamp(near * 0.1 + far * 0.07, 0, 0.5)); // gentle depth cue
    g.renderOrder = Math.round(100 - ad * 10);
  }, []);

  const renderFrame = useCallback(() => {
    const ctx = gl.current;
    if (!ctx) return;
    for (const [i, e] of ctx.entries) if (e.bag) place(i, e);
    ctx.renderer.render(ctx.scene, ctx.camera);
  }, [place]);

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
        if (reduce || Math.abs(diff) < 0.0008) s.pos = s.target;
        else {
          s.pos += diff * (1 - Math.exp(-dt * 9));
          busy = true;
        }
      }
      s.maxFlip = 0;
      for (const i of gl.current?.entries.keys() ?? []) {
        const want = i === s.flipIdx ? 1 : 0;
        let f = s.flip.get(i) ?? 0;
        const df = want - f;
        if (reduce || Math.abs(df) < 0.002) f = want;
        else {
          f += df * (1 - Math.exp(-dt * 6));
          busy = true;
        }
        s.flip.set(i, f);
        s.maxFlip = Math.max(s.maxFlip, f);
      }
      for (const [cur, tgt] of [
        ['tiltX', 'tiltTX'],
        ['tiltY', 'tiltTY'],
      ]) {
        const diff = s[tgt] - s[cur];
        if (Math.abs(diff) > 0.0005) {
          s[cur] += diff * (1 - Math.exp(-dt * 10));
          busy = true;
        } else s[cur] = s[tgt];
      }
      renderFrame();
      const nearest = clamp(Math.round(s.dragging ? s.pos : s.target), 0, Math.max(0, s.count - 1));
      if (nearest !== s.shown) {
        s.shown = nearest;
        setCenter(nearest);
      }
      s.raf = busy ? requestAnimationFrame(tick) : 0;
      if (stageRef.current) stageRef.current.dataset.moving = busy ? 'true' : 'false';
    },
    [renderFrame],
  );

  const kick = useCallback(() => {
    const s = sim.current;
    if (!s.raf) {
      if (stageRef.current) stageRef.current.dataset.moving = 'true';
      s.last = performance.now();
      s.raf = requestAnimationFrame(tick);
    }
  }, [tick]);

  const unflip = useCallback(() => {
    sim.current.flipIdx = -1;
    setFlipped(false);
  }, []);

  const goTo = useCallback(
    i => {
      const s = sim.current;
      const idx = clamp(i, 0, Math.max(0, s.count - 1));
      if (s.flipIdx >= 0 && s.flipIdx !== idx) unflip();
      s.target = idx;
      kick();
    },
    [kick, unflip],
  );

  const toggleFlip = useCallback(() => {
    const s = sim.current;
    const idx = clamp(Math.round(s.target), 0, s.count - 1);
    if (s.flipIdx === idx) unflip();
    else {
      s.flipIdx = idx;
      setFlipped(true);
    }
    kick();
  }, [kick, unflip]);

  // ---- renderer, scene, lights, camera (once). Layout effect so it exists before the bags are added below.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    let renderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'default',
      });
    } catch {
      setGlError('3D view is not available in this browser.');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = NoToneMapping; // keep the printed colours true to the photo
    renderer.outputColorSpace = SRGBColorSpace;
    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.5; // the room light is the main source; any brighter and printed colours wash out
    scene.add(new HemisphereLight(0xfff1e0, 0x2a1a10, 0.25));
    const key = new DirectionalLight(0xffead0, 0.6);
    key.position.set(-2, 3, 3);
    scene.add(key);
    const rim = new DirectionalLight(0xa9c8ff, 0.4);
    rim.position.set(2.5, 2, -3);
    scene.add(rim);
    const camera = new PerspectiveCamera(28, 1.5, 0.1, 60);
    const raycaster = new Raycaster();
    gl.current = { renderer, scene, camera, raycaster, entries: new Map(), envTex, pmrem };

    const layout = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      let visH = 2.75;
      if (visH * camera.aspect < 2.35) visH = 2.35 / camera.aspect; // keep the centre bag + a peek of neighbours on phones
      const dist = visH / 2 / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, 0.95, dist);
      camera.lookAt(0, 0.62, 0);
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      // stand the bags on the floor line
      const desired = 1 - 2 * 0.7; // world y = 0 sits 70% of the way down the stage
      const p0 = new Vector3(0, 0, 0).project(camera).y;
      const shift = ((p0 - desired) * h) / 2;
      camera.setViewOffset(w, h, 0, shift, w, h);
      camera.updateProjectionMatrix();
      if (Math.abs(new Vector3(0, 0, 0).project(camera).y - desired) > Math.abs(p0 - desired)) {
        camera.setViewOffset(w, h, 0, -shift, w, h);
        camera.updateProjectionMatrix();
      }
      setNarrow(w < 720);
      sim.current.cardShift = w < 720 ? 0 : 0.55;
      renderFrame();
    };
    const ro = new ResizeObserver(layout);
    ro.observe(stage);
    layout();
    const onLost = e => e.preventDefault();
    canvas.addEventListener('webglcontextlost', onLost);
    const onRestored = () => renderFrame();
    canvas.addEventListener('webglcontextrestored', onRestored);

    // test/debug helpers: what is bag i showing (pouch | sprite + which rendered view)?
    stage.__bagInfo = i => {
      const e = gl.current.entries.get(i);
      return e?.bag ? { kind: e.bag.kind } : null;
    };
    // test/debug helper: where is bag i on the page?
    stage.__bagScreen = i => {
      const e = gl.current.entries.get(i);
      if (!e?.bag) return null;
      const r = canvas.getBoundingClientRect();
      const v = new Vector3(0, e.bag.height * 0.5, 0);
      e.bag.group.localToWorld(v);
      v.project(camera);
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };

    return () => {
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      cancelAnimationFrame(sim.current.raf);
      sim.current.raf = 0;
      for (const e of gl.current.entries.values()) {
        if (!e.bag) continue;
        scene.remove(e.bag.group);
        e.bag.dispose();
      }
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      gl.current = null;
    };
  }, [renderFrame]);

  // ---- keep one 3D bag per bean in the window around the centre
  useLayoutEffect(() => {
    const ctx = gl.current;
    if (!ctx) return;
    const list = beansRef.current;
    for (const [i, e] of [...ctx.entries]) {
      const bean = list[i];
      if (!bean || Math.abs(i - center) > WINDOW || e.sig !== signature(bean)) {
        if (e.bag) {
          ctx.scene.remove(e.bag.group);
          e.bag.dispose();
        }
        ctx.entries.delete(i);
      }
    }
    list.forEach((bean, i) => {
      if (Math.abs(i - center) > WINDOW || ctx.entries.has(i)) return;
      const entry = { sig: signature(bean), bag: null, bean };
      ctx.entries.set(i, entry);
      const attach = bag => {
        if (gl.current?.entries.get(i) !== entry) {
          bag.dispose();
          return;
        }
        bag.pickables.forEach(m => (m.userData.idx = i));
        bag.setLed(beansRef.current[i]?.id === activeRef.current);
        entry.bag = bag;
        ctx.scene.add(bag.group);
        kick();
        renderFrame();
      };
      const pouch = async () => {
        const bag = createBag({
          aspect: bean.ar,
          finish: bean.finish,
          color: beanPalette(bean).base,
        });
        attach(bag);
        const tex = await loadBagTextures(bean);
        if (gl.current?.entries.get(i) === entry) {
          bag.setTextures(tex.front, tex.back);
          kick();
          renderFrame();
        }
      };
      if (bean.artFront) {
        // an AI illustration exists: show it as a two-sided 3D card; if it can't be loaded, quietly use the 3D pouch
        loadArtViews(bean.artFront, bean.artBack).then(
          art => attach(createCardBag(art, { color: beanPalette(bean).base })),
          err => {
            console.warn('studio illustration unusable, using 3D pouch:', err.message);
            pouch();
          },
        );
      } else pouch();
    });
    for (const [i, e] of ctx.entries) e.bag?.setLed(list[i]?.id === activeRef.current);
    renderFrame();
  }, [center, idsKey, activeId, kick, renderFrame]);

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
  }, [beans.map(b => b.id).join(',')]);

  useEffect(() => {
    if (beans[center]) centerIdRef.current = beans[center].id;
  }, [center, idsKey]);

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
  const pickAt = e => {
    const ctx = gl.current;
    if (!ctx) return -1;
    const r = canvasRef.current.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -(((e.clientY - r.top) / r.height) * 2 - 1),
    );
    ctx.raycaster.setFromCamera(ndc, ctx.camera);
    const meshes = [];
    for (const en of ctx.entries.values()) if (en.bag) meshes.push(...en.bag.pickables);
    const hit = ctx.raycaster.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.idx : -1;
  };
  const onPointerDown = e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const s = sim.current;
    s.down = {
      x: e.clientX,
      startPos: s.pos,
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
        const unit = Math.min(stage.clientWidth * 0.2, 240);
        s.pos = clamp(s.down.startPos - dx / unit, -0.3, s.count - 0.7);
        const now = performance.now();
        const dt = Math.max(1, now - s.down.lastT);
        s.vel = -(e.clientX - s.down.lastX) / unit / dt;
        s.down.lastX = e.clientX;
        s.down.lastT = now;
        kick();
      }
      return;
    }
    if (e.pointerType === 'touch' || s.flipIdx >= 0) return;
    const rect = stage.getBoundingClientRect();
    s.tiltTY = ((e.clientX - rect.left) / rect.width - 0.5) * 0.3;
    s.tiltTX = ((e.clientY - rect.top) / rect.height - 0.5) * 0.14;
    kick();
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
    const idx = pickAt(e);
    if (idx < 0) return;
    if (idx === clamp(Math.round(s.target), 0, s.count - 1)) toggleFlip();
    else goTo(idx);
  };
  const onPointerLeave = () => {
    const s = sim.current;
    s.tiltTX = 0;
    s.tiltTY = 0;
    kick();
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
  const card = flipped ? (
    <DetailsCard bean={current} stats={currentStats} active={isActive} />
  ) : null;

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
        data-center={center}
        data-flipped={flipped ? 'true' : 'false'}
        data-active={beans.findIndex(b => b.id === activeId)}
      >
        <div className='shelf-ground' />
        <canvas ref={canvasRef} className='shelf-canvas' data-testid='shelf-canvas' />
        {glError && (
          <div className='text-base-100 absolute inset-0 z-10 grid place-items-center p-6 text-center'>
            {glError}
          </div>
        )}
        {!narrow && card && <div className='shelf-card-stage'>{card}</div>}
      </div>
      {narrow && card && <div className='mx-auto w-full max-w-sm'>{card}</div>}

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
