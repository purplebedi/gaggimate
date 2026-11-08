// Turn the user's photos (+ the vision model's panel corners) into the two flat textures a bag is wrapped in.
import { rectifyToCanvas, quadAspect, quadToPixels } from './rectify.js';
import { clampAspect } from './bag3d.js';

const TEX_W = 400;
const MAX_BYTES = 32 * 1024;
const INSET = 0.025;

/** Inset rectangle used when no corners are known (the whole photo, minus a margin). */
export const DEFAULT_QUAD = {
  tl: { x: 0.04, y: 0.04 },
  tr: { x: 0.96, y: 0.04 },
  br: { x: 0.96, y: 0.96 },
  bl: { x: 0.04, y: 0.96 },
};

/** Pull every corner a little towards the centre so a slightly loose outline doesn't include table/background. */
export function insetQuad(q, amount = INSET) {
  const pts = [q.tl, q.tr, q.br, q.bl];
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const k = 1 - amount * 2;
  const f = p => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k });
  return { tl: f(q.tl), tr: f(q.tr), br: f(q.br), bl: f(q.bl) };
}

/** Average colour weighted towards saturated pixels, so a mostly-white label still gives a usable tint. */
export function dominantColor(canvas) {
  const s = 16;
  const tmp = document.createElement('canvas');
  tmp.width = s;
  tmp.height = s;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, s, s);
  const { data } = ctx.getImageData(0, 0, s, s);
  let r = 0;
  let g = 0;
  let b = 0;
  let wsum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const sat = max === 0 ? 0 : (max - min) / max;
    const wt = 0.15 + sat * sat * 4;
    r += data[i] * wt;
    g += data[i + 1] * wt;
    b += data[i + 2] * wt;
    wsum += wt;
  }
  const hex = v =>
    Math.round(v / wsum)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const bitmapOf = file => createImageBitmap(file, { imageOrientation: 'from-image' });

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** JPEG under the size budget: lower the quality first, then the resolution. */
async function encode(canvas) {
  let c = canvas;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const q of [0.82, 0.7, 0.58]) {
      const blob = await toBlob(c, q);
      if (blob.size <= MAX_BYTES) return blob;
    }
    const next = document.createElement('canvas');
    next.width = Math.round(c.width * 0.82);
    next.height = Math.round(c.height * 0.82);
    next.getContext('2d').drawImage(c, 0, 0, next.width, next.height);
    c = next;
  }
  return toBlob(c, 0.5);
}

/** Grow a too-short panel at the top by smearing its top rows (the torn/open end of an opened bag). */
function padTop(canvas, targetH) {
  if (canvas.height >= targetH) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = targetH;
  const ctx = out.getContext('2d');
  const pad = targetH - canvas.height;
  ctx.drawImage(canvas, 0, 0, canvas.width, 6, 0, 0, canvas.width, pad); // stretch the top 6 rows upward
  ctx.drawImage(canvas, 0, pad);
  return out;
}

/**
 * Build the two textures. `front`/`back` are { file, quad?, complete? } (quad = the panel corners as 0-1 fractions).
 * Returns { aspect, color, front: {blob, url}, back: {blob, url} | null }. Object URLs are for previews only.
 */
export async function buildBagImages({ front, back }) {
  const fb = await bitmapOf(front.file);
  const fq = insetQuad(front.quad || DEFAULT_QUAD);
  const rawAspect = quadAspect(quadToPixels(fq, fb.width, fb.height));
  const aspect = clampAspect(rawAspect);
  const fr = rectifyToCanvas(fb, fq, { width: TEX_W, aspect });
  fb.close?.();
  const color = dominantColor(fr.canvas);
  const frontBlob = await encode(fr.canvas);
  const result = {
    aspect,
    color,
    front: { blob: frontBlob, url: URL.createObjectURL(frontBlob) },
    back: null,
  };

  if (back) {
    const bb = await bitmapOf(back.file);
    const bq = insetQuad(back.quad || DEFAULT_QUAD);
    const natural = quadAspect(quadToPixels(bq, bb.width, bb.height));
    // whole panel visible -> it is the same bag, so fit it to the front's proportions; cut-off panel -> keep the
    // printed part undistorted and pad the missing top of the bag
    let canvas;
    if (back.complete === false && natural > aspect * 1.08) {
      const br = rectifyToCanvas(bb, bq, { width: TEX_W, aspect: natural });
      canvas = padTop(br.canvas, Math.round(TEX_W / aspect));
    } else {
      canvas = rectifyToCanvas(bb, bq, { width: TEX_W, aspect }).canvas;
    }
    bb.close?.();
    const backBlob = await encode(canvas);
    result.back = { blob: backBlob, url: URL.createObjectURL(backBlob) };
  }
  return result;
}

/** One panel at a given aspect (used when replacing just the front or just the back of an existing bean). */
export async function buildPanel({ file, quad, aspect, complete = true }) {
  const bm = await bitmapOf(file);
  const q = insetQuad(quad || DEFAULT_QUAD);
  const a = clampAspect(aspect);
  const natural = quadAspect(quadToPixels(q, bm.width, bm.height));
  let canvas;
  if (complete === false && natural > a * 1.08) {
    canvas = padTop(
      rectifyToCanvas(bm, q, { width: TEX_W, aspect: natural }).canvas,
      Math.round(TEX_W / a),
    );
  } else {
    canvas = rectifyToCanvas(bm, q, { width: TEX_W, aspect: a }).canvas;
  }
  bm.close?.();
  const blob = await encode(canvas);
  return { blob, color: dominantColor(canvas), aspect: a };
}

/** Front photo with no corners known (e.g. replaced from the edit screen): aspect follows the photo itself. */
export async function buildFrontOnly(file) {
  const r = await buildBagImages({ front: { file }, back: null });
  URL.revokeObjectURL(r.front.url);
  return { blob: r.front.blob, color: r.color, aspect: r.aspect };
}
