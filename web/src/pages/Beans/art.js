// The AI illustration comes back as a 1024x1024 image with a transparent background and the bag somewhere in it.
// Trim it to the bag so the 3D card is the right size and sits on the shelf. alphaBounds is pure (unit tested).

const ALPHA_MIN = 24;
const MAX_SIDE = 700; // texture size cap: plenty for a ~300px shelf bag, keeps video memory small

/**
 * Bounding box of the visible (non-transparent) pixels.
 * @param {Uint8ClampedArray|number[]} alpha one byte per pixel (w*h)
 * @returns {{x:number,y:number,w:number,h:number}|null} null when the image is (almost) empty
 */
export function alphaBounds(alpha, w, h) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > ALPHA_MIN) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count < w * h * 0.03) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Load one illustration URL and return its bag, trimmed: { canvas, w, h }. Rejects if there is no usable bag. */
export async function loadArt(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const alpha = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  const box = alphaBounds(alpha, c.width, c.height);
  if (!box) throw new Error('the illustration is empty');
  const pad = 2;
  const scale = Math.min(1, MAX_SIDE / Math.max(box.w, box.h));
  const out = document.createElement('canvas');
  out.width = Math.round(box.w * scale) + pad * 2;
  out.height = Math.round(box.h * scale) + pad * 2;
  out
    .getContext('2d')
    .drawImage(c, box.x, box.y, box.w, box.h, pad, pad, out.width - pad * 2, out.height - pad * 2);
  return { canvas: out, w: out.width - pad * 2, h: out.height - pad * 2 };
}
