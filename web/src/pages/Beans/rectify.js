// Perspective-correct a bag panel: given the panel's 4 corners in a photo (found by the vision model), produce a
// flat, front-on texture of just that panel. Pure maths + canvas so the maths can be unit tested in node.

/** Solve A·x = b (n×n) by Gaussian elimination with partial pivoting. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Homography H (3x3 row-major, h22 = 1) mapping each `from[i]` to `to[i]`, for 4 point pairs [[x,y],...].
 * Returns null for degenerate input (e.g. collinear corners).
 */
export function homography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Real-world-ish aspect (width/height) of a quad given as [tl, tr, br, bl] in pixels. */
export function quadAspect(q) {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return w / h;
}

/** Quad corners as fractions -> pixels: [tl, tr, br, bl]. */
export function quadToPixels(quad, w, h) {
  return [quad.tl, quad.tr, quad.br, quad.bl].map(p => [p.x * w, p.y * h]);
}

/**
 * Sample `src` (ImageData) through the inverse homography into a new w×h ImageData (bilinear).
 * dstToSrc maps destination pixel coords -> source pixel coords.
 */
export function warp(src, dstToSrc, outW, outH) {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { width: sw, height: sh, data } = src;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = applyHomography(dstToSrc, x + 0.5, y + 0.5);
      const o = (y * outW + x) * 4;
      const fx = sx - 0.5;
      const fy = sy - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      if (x0 < -1 || y0 < -1 || x0 >= sw || y0 >= sh) {
        out[o + 3] = 0;
        continue;
      }
      const tx = fx - x0;
      const ty = fy - y0;
      const px = (xx, yy) => {
        const cx = Math.min(sw - 1, Math.max(0, xx));
        const cy = Math.min(sh - 1, Math.max(0, yy));
        return (cy * sw + cx) * 4;
      };
      const a = px(x0, y0);
      const b = px(x0 + 1, y0);
      const c = px(x0, y0 + 1);
      const d = px(x0 + 1, y0 + 1);
      for (let k = 0; k < 3; k++) {
        out[o + k] =
          data[a + k] * (1 - tx) * (1 - ty) +
          data[b + k] * tx * (1 - ty) +
          data[c + k] * (1 - tx) * ty +
          data[d + k] * tx * ty;
      }
      out[o + 3] = 255;
    }
  }
  return new ImageData(out, outW, outH);
}

/**
 * Flatten the panel at `quad` (fractions, {tl,tr,br,bl}) out of the photo bitmap into a canvas of the requested
 * width; the height follows the panel's real aspect unless `aspect` forces it.
 */
export function rectifyToCanvas(bitmap, quad, { width = 400, aspect } = {}) {
  const src = document.createElement('canvas');
  src.width = bitmap.width;
  src.height = bitmap.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(bitmap, 0, 0);
  const q = quadToPixels(quad, bitmap.width, bitmap.height);
  const ar = aspect || quadAspect(q);
  const outW = width;
  const outH = Math.round(width / ar);
  // destination rectangle corners -> source quad
  const H = homography(
    [
      [0, 0],
      [outW, 0],
      [outW, outH],
      [0, outH],
    ],
    q,
  );
  if (!H) throw new Error('Degenerate bag outline');
  const img = warp(sctx.getImageData(0, 0, src.width, src.height), H, outW, outH);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  out.getContext('2d').putImageData(img, 0, 0);
  return { canvas: out, aspect: ar };
}
