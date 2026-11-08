// Runtime textures for the 3D shelf: the real flattened photos when the bean has them, otherwise a label drawn
// from the bean's text fields so every bag still looks like a bag.
import { CanvasTexture, TextureLoader } from 'three';
import { bagTextureUrl } from '../../services/BeanService.js';
import { beanPalette, roastDots } from './beanUtils.js';
import { clampAspect } from './bag3d.js';
import { loadArt } from './art.js';

const loader = new TextureLoader();
const cache = new Map(); // key -> { promise, textures[] }
const MAX_CACHED = 40;

const SERIF = "ui-serif, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif";
const SANS = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';

function speckle(ctx, w, h, alpha = 0.06, n = 900) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * alpha})`;
    ctx.fillRect(
      Math.random() * w,
      Math.random() * h,
      1 + Math.random() * 2,
      1 + Math.random() * 2,
    );
  }
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function spaced(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

/** A printed-looking front for beans without a photo. */
export function drawFront(bean, w, h) {
  const p = beanPalette(bean);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(w / 2, 0, 10, w / 2, h * 0.2, h);
  g.addColorStop(0, p.light);
  g.addColorStop(0.6, p.base);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h);
  ctx.strokeStyle = p.ink;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.07, h * 0.13, w * 0.86, h * 0.82);
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (bean.roaster) {
    ctx.font = `700 ${w * 0.05}px ${SANS}`;
    spaced(ctx, w * 0.012);
    ctx.globalAlpha = 0.85;
    ctx.fillText(String(bean.roaster).toUpperCase(), w / 2, h * 0.2, w * 0.8);
    ctx.globalAlpha = 1;
    spaced(ctx, 0);
  }
  // emblem
  const ey = h * 0.36;
  const er = w * 0.14;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, ey, er, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([3, 5]);
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(w / 2, ey, er * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = `italic 700 ${w * 0.15}px ${SERIF}`;
  ctx.fillText((bean.roaster || bean.name || '?').trim().charAt(0).toUpperCase(), w / 2, ey + 2);
  // name
  ctx.font = `700 ${w * 0.115}px ${SERIF}`;
  const lines = wrap(ctx, bean.name || '', w * 0.74, 3);
  const lh = w * 0.125;
  const y0 = h * 0.56 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, y0 + i * lh, w * 0.78));
  const origin = [bean.origin, bean.region].filter(Boolean).join(' · ');
  if (origin) {
    ctx.font = `600 ${w * 0.04}px ${SANS}`;
    spaced(ctx, w * 0.008);
    ctx.globalAlpha = 0.8;
    ctx.fillText(origin.toUpperCase(), w / 2, h * 0.74, w * 0.8);
    ctx.globalAlpha = 1;
    spaced(ctx, 0);
  }
  const dots = roastDots(bean.roastLevel);
  for (let i = 0; dots > 0 && i < 5; i++) {
    ctx.beginPath();
    ctx.arc(w / 2 + (i - 2) * w * 0.045, h * 0.83, w * 0.012, 0, Math.PI * 2);
    ctx.globalAlpha = i < dots ? 0.95 : 0.35;
    if (i < dots) ctx.fill();
    else ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (bean.process) {
    ctx.font = `600 ${w * 0.036}px ${SANS}`;
    spaced(ctx, w * 0.01);
    ctx.globalAlpha = 0.75;
    ctx.fillText(String(bean.process).toUpperCase(), w / 2, h * 0.89, w * 0.8);
    ctx.globalAlpha = 1;
    spaced(ctx, 0);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; // heat-seal band
  ctx.fillRect(0, 0, w, h * 0.07);
  return c;
}

/** A plain branded back for beans without a back photo. */
export function drawBack(bean, w, h) {
  const p = beanPalette(bean);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, p.base);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 0.05);
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${w * 0.075}px ${SANS}`;
  spaced(ctx, w * 0.014);
  ctx.globalAlpha = 0.9;
  ctx.fillText(
    String(bean.roaster || 'Whole bean coffee').toUpperCase(),
    w / 2,
    h * 0.45,
    w * 0.82,
  );
  spaced(ctx, 0);
  ctx.font = `italic ${w * 0.05}px ${SERIF}`;
  ctx.globalAlpha = 0.7;
  ctx.fillText('Whole bean coffee', w / 2, h * 0.53);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, w, h * 0.07);
  return c;
}

const canvasTexture = canvas => new CanvasTexture(canvas);
const photoTexture = url => loader.loadAsync(url);

/**
 * Textures for a bean. Resolves { aspect, front, back } (three.js Textures). Cached per bean+photo version;
 * old entries are disposed so a long shelf doesn't hold every bag's pixels in video memory.
 */
export function loadBagTextures(bean) {
  const key = `${bean.id}:${bean.photoV || 0}:${bean.hasPhoto ? 1 : 0}${bean.hasBack ? 1 : 0}:${bean.name}:${bean.roastLevel}:${bean.color}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // LRU touch
    return hit.promise;
  }
  const aspect = clampAspect(bean.ar);
  const W = 400;
  const H = Math.round(W / aspect);
  const entry = { textures: [] };
  entry.promise = (async () => {
    const front = bean.hasPhoto
      ? await photoTexture(bagTextureUrl(bean, 'front')).catch(() =>
          canvasTexture(drawFront(bean, W, H)),
        )
      : canvasTexture(drawFront(bean, W, H));
    const back = bean.hasBack
      ? await photoTexture(bagTextureUrl(bean, 'back')).catch(() =>
          canvasTexture(drawBack(bean, W, H)),
        )
      : canvasTexture(drawBack(bean, W, H));
    entry.textures = [front, back];
    return { aspect, front, back };
  })();
  cache.set(key, entry);
  while (cache.size > MAX_CACHED) {
    const [oldKey, old] = cache.entries().next().value;
    cache.delete(oldKey);
    old.textures.forEach(t => t.dispose());
  }
  return entry.promise;
}

const artCache = new Map(); // url -> Promise<{canvas,w,h}>
function cachedArt(url) {
  if (!artCache.has(url)) {
    const p = loadArt(url);
    p.catch(() => artCache.delete(url));
    artCache.set(url, p);
    while (artCache.size > 48) artCache.delete(artCache.keys().next().value);
  }
  return artCache.get(url);
}

/**
 * The AI illustrations for a bean: { front, back|null }, each { canvas, w, h } trimmed to the bag.
 * A missing/broken back is fine (the card gets a plain back); a broken front rejects so the caller can fall back.
 */
export async function loadArtViews(frontUrl, backUrl) {
  const [front, back] = await Promise.all([
    cachedArt(frontUrl),
    backUrl ? cachedArt(backUrl).catch(() => null) : null,
  ]);
  return { front, back };
}
