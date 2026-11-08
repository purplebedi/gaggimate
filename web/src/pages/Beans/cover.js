// Turns a bag photo into a small shelf "cover": crop to the bag, fixed aspect, tiny JPEG.
export const COVER_ASPECT = 5 / 7; // width / height, matches the 3D bag face
const TARGET_W = 300;
const MAX_BYTES = 22 * 1024;

const ASPECT_TOLERANCE = 0.12; // bags vary; up to +-12% is absorbed by a (barely visible) stretch

/**
 * Compute the source rectangle (in pixels) for a cover crop, tight to the bag so no background shows.
 * bbox is the bag's box as 0-1 fractions (or null for "the whole photo"). If the bag's own aspect is within
 * tolerance of the cover aspect the whole box is kept (the caller stretches it slightly); otherwise the longer
 * side is trimmed. Never grows beyond the box, so table/background is not pulled in. Pure, so it can be tested.
 */
export function cropRect(imgW, imgH, bbox, aspect = COVER_ASPECT) {
  const inset = bbox ? 0.05 : 0.04; // model boxes run loose; trimming 5% a side keeps background out (labels are never at the very edge)
  const src = bbox || { x: 0, y: 0, w: 1, h: 1 };
  let w = src.w * imgW * (1 - inset * 2);
  let h = src.h * imgH * (1 - inset * 2);
  const cx = (src.x + src.w / 2) * imgW;
  const cy = (src.y + src.h / 2) * imgH;
  const ar = w / h;
  const lo = aspect * (1 - ASPECT_TOLERANCE);
  const hi = aspect * (1 + ASPECT_TOLERANCE);
  if (ar < lo)
    h = w / lo; // too narrow: trim top/bottom
  else if (ar > hi) w = h * hi; // too wide: trim the sides
  return { sx: cx - w / 2, sy: cy - h / 2, sw: w, sh: h };
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

function loadBitmap(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** @returns {Promise<{blob: Blob, color: string, width: number, height: number}>} */
export async function makeCover(file, bbox) {
  const bitmap = await loadBitmap(file);
  try {
    const { sx, sy, sw, sh } = cropRect(bitmap.width, bitmap.height, bbox);
    let width = Math.min(TARGET_W, Math.round(sw));
    let blob;
    let canvas;
    for (let attempt = 0; attempt < 5; attempt++) {
      const height = Math.round(width / COVER_ASPECT);
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
      for (const q of [0.78, 0.66, 0.54]) {
        blob = await toBlob(canvas, q);
        if (blob.size <= MAX_BYTES) break;
      }
      if (blob.size <= MAX_BYTES) break;
      width = Math.round(width * 0.82);
    }
    return { blob, color: dominantColor(canvas), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close?.();
  }
}
