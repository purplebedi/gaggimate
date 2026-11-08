// A coffee pouch as a real 3D mesh (three.js): front and back panels that bulge like a filled pillow bag, sealed
// at the sides, crimped at the top, with a flat base. Each panel wears the flattened photo of the actual bag.
import {
  CanvasTexture,
  Color,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  DoubleSide,
} from 'three';

export const BAG_H = 1.4;
export const MIN_ASPECT = 0.55;
export const MAX_ASPECT = 1.0;

const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** How far a panel stands off the bag's mid-plane at (u,v) in 0..1 across/up the bag, as a fraction of depth/2. */
export function bulge(u, v) {
  const edge = Math.pow(Math.sin(Math.PI * clamp01(u)), 0.6); // 0 at the side seals, fullest in the middle
  const base = 0.4 + 0.6 * smooth(0, 0.22, v); // flat-ish footprint at the bottom
  const top = 1 - smooth(0.84, 0.94, v); // collapses into the flat heat-seal
  const fold = 1 + 0.035 * Math.sin(u * 19 + v * 7) * smooth(0.1, 0.5, v) * top; // soft wrinkles
  return edge * base * top * fold;
}

export function clampAspect(a) {
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, Number.isFinite(a) ? a : 0.75));
}

function panelGeometry(width, height, depth) {
  const g = new PlaneGeometry(width, height, 40, 48);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / width + 0.5;
    const v = pos.getY(i) / height + 0.5;
    pos.setZ(i, (depth / 2) * bulge(u, v));
    pos.setY(i, pos.getY(i) + height / 2); // stand the bag on y = 0
  }
  g.computeVertexNormals();
  return g;
}

/** Horizontal crimp ridges across the top seal + faint grain, as a bump map shared by front and back. */
export function makeBumpTexture() {
  const w = 64;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, w, h);
  const sealBottom = h * 0.07;
  for (let y = 0; y < sealBottom; y += 1) {
    const v = 128 + Math.sin((y / 4) * Math.PI * 2) * 70;
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(0, y, w, 1);
  }
  const g = x.createLinearGradient(0, sealBottom - 3, 0, sealBottom + 3);
  g.addColorStop(0, '#808080');
  g.addColorStop(0.5, '#303030');
  g.addColorStop(1, '#808080');
  x.fillStyle = g;
  x.fillRect(0, sealBottom - 3, w, 6);
  for (let i = 0; i < 700; i++) {
    const v = 128 + (Math.random() - 0.5) * 28;
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function gradientAlpha() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#000'); // far end of the reflection (top of the bag): invisible
  g.addColorStop(0.55, '#000'); // only the part nearest the floor shows, and it fades out before the stage edge
  g.addColorStop(1, '#808080'); // where the bag meets the floor
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 64);
  return new CanvasTexture(c);
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

const FINISH = {
  matte: { roughness: 0.78, clearcoat: 0.1, clearcoatRoughness: 0.6 },
  glossy: { roughness: 0.32, clearcoat: 0.85, clearcoatRoughness: 0.15 },
  kraft: { roughness: 0.96, clearcoat: 0, clearcoatRoughness: 1 },
};

let sharedBump;
let sharedAlpha;
let sharedShadow;

function panelMaterial(finish, map, color) {
  sharedBump ||= makeBumpTexture();
  const f = FINISH[finish] || FINISH.matte;
  const m = new MeshPhysicalMaterial({
    map: map || null,
    color: map ? 0xffffff : new Color(color || '#8a6a4a'),
    bumpMap: sharedBump,
    bumpScale: 1.6,
    metalness: 0.04,
    envMapIntensity: 0.3,
    ...f,
  });
  return m;
}

/**
 * Build one bag. Returns { group, front, back, reflection, setTextures, dispose }.
 * Local space: standing on y = 0, centred on x = 0, front faces +z, height BAG_H.
 */
export function createBag({ aspect = 0.75, finish = 'matte', color = '#8a6a4a' } = {}) {
  const a = clampAspect(aspect);
  const height = BAG_H;
  const width = height * a;
  const depth = width * 0.36;
  sharedAlpha ||= gradientAlpha();
  sharedShadow ||= shadowTexture();

  const group = new Group();
  const geo = panelGeometry(width, height, depth);
  const frontMat = panelMaterial(finish, null, color);
  const backMat = panelMaterial(finish, null, color);
  const front = new Mesh(geo, frontMat);
  const back = new Mesh(geo, backMat);
  back.rotation.y = Math.PI; // same geometry, seen from behind: bulges the other way and reads un-mirrored
  front.name = 'front';
  back.name = 'back';
  group.add(front, back);

  // flat base so the bag "stands": a lens-shaped patch between the two panels' bottom edges
  const lens = new Shape();
  const steps = 24;
  const b0 = i => (depth / 2) * bulge(i / steps, 0);
  lens.moveTo(-width / 2, 0);
  for (let i = 0; i <= steps; i++) lens.lineTo(-width / 2 + (width * i) / steps, b0(i));
  for (let i = steps; i >= 0; i--) lens.lineTo(-width / 2 + (width * i) / steps, -b0(i));
  const baseGeo = new ShapeGeometry(lens);
  baseGeo.rotateX(Math.PI / 2);
  const base = new Mesh(
    baseGeo,
    new MeshBasicMaterial({ color: new Color(color).multiplyScalar(0.3), side: DoubleSide }),
  );
  base.position.y = 0.003;
  group.add(base);

  // soft contact shadow
  const shadow = new Mesh(
    new PlaneGeometry(width * 1.7, depth * 4.2),
    new MeshBasicMaterial({
      map: sharedShadow,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(shadow);

  // mirrored, fading copy under the floor for the glossy-shelf look
  const reflection = new Group();
  const rm = () =>
    new MeshBasicMaterial({
      transparent: true,
      opacity: 0.28,
      alphaMap: sharedAlpha,
      depthWrite: false,
      color: 0x9a9a9a,
    });
  const rFront = new Mesh(geo, rm());
  const rBack = new Mesh(geo, rm());
  rBack.rotation.y = Math.PI;
  reflection.add(rFront, rBack);
  reflection.scale.y = -1;
  reflection.position.y = -0.004;
  group.add(reflection);

  // "in the grinder" indicator on the top seal
  const led = new Mesh(
    new SphereGeometry(0.028, 16, 12),
    new MeshBasicMaterial({ color: 0x4ade80 }),
  );
  led.position.set(width * 0.36, height * 0.965, 0.012);
  led.visible = false;
  group.add(led);

  return {
    kind: 'pouch',
    group,
    front,
    back,
    pickables: [front, back],
    led,
    width,
    height,
    setLed(on) {
      led.visible = on;
    },
    setDim(d) {
      frontMat.color.setScalar(1 - d);
      backMat.color.setScalar(1 - d);
    },
    setTextures(frontTex, backTex) {
      for (const [mesh, tex, refl] of [
        [front, frontTex, rFront],
        [back, backTex, rBack],
      ]) {
        const mat = mesh.material;
        if (tex) {
          tex.colorSpace = SRGBColorSpace;
          tex.minFilter = LinearMipmapLinearFilter;
          tex.anisotropy = 4;
        }
        mat.map = tex || null;
        mat.color.set(tex ? 0xffffff : color);
        mat.needsUpdate = true;
        refl.material.map = tex || null;
        refl.material.needsUpdate = true;
      }
    },
    dispose() {
      geo.dispose();
      baseGeo.dispose();
      for (const m of [
        frontMat,
        backMat,
        base.material,
        shadow.material,
        rFront.material,
        rBack.material,
        led.material,
      ])
        m.dispose();
      shadow.geometry.dispose();
      led.geometry.dispose();
    },
  };
}

/**
 * A bag drawn from the AI illustrations: a thin two-sided card (front on one face, back on the other) that turns in
 * real 3D, so neighbours angle in and the flip shows the illustrated back. Same interface as createBag.
 * `art = { front: {canvas,w,h}, back: {canvas,w,h}|null }` (see art.js).
 */
export function createCardBag(art, { pad = 2, color = '#8a6a4a' } = {}) {
  sharedAlpha ||= gradientAlpha();
  sharedShadow ||= shadowTexture();
  const k = BAG_H / art.front.h; // world units per source pixel
  const fw = art.front.w * k;
  const group = new Group();
  const geo = new PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0); // stand on y = 0

  const tex = canvas => {
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = 4;
    return t;
  };
  const frontTex = tex(art.front.canvas);
  // the back is fitted inside the front's footprint (same height, centred) so the card turns like one object
  const back = art.back;
  const backTex = back ? tex(back.canvas) : null;
  const backScale = back ? Math.min(fw / back.w, BAG_H / back.h) : 1;

  const mk = (map, opacity, extra = {}) =>
    new MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity,
      ...extra,
    });
  const frontMat = mk(frontTex, 1);
  const backMat = backTex
    ? mk(backTex, 1)
    : new MeshBasicMaterial({ color: new Color(color).multiplyScalar(0.55) });
  const front = new Mesh(geo, frontMat);
  front.scale.set(art.front.canvas.width * k, art.front.canvas.height * k, 1);
  front.position.set(0, -pad * k, 0.006);
  const backMesh = new Mesh(geo, backMat);
  if (back) {
    backMesh.scale.set(back.canvas.width * backScale, back.canvas.height * backScale, 1); // backScale is already world units per pixel
    backMesh.position.set(0, -pad * backScale, -0.006);
  } else {
    backMesh.scale.set(fw, BAG_H, 1);
    backMesh.position.set(0, 0, -0.006);
  }
  backMesh.rotation.y = Math.PI;
  group.add(front, backMesh);

  const shadow = new Mesh(
    new PlaneGeometry(fw * 1.5, fw * 0.8),
    new MeshBasicMaterial({
      map: sharedShadow,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(shadow);

  // mirrored fading copies under the floor for the glossy-shelf look
  const reflection = new Group();
  const rm = map =>
    new MeshBasicMaterial({
      map,
      transparent: true,
      opacity: 0.28,
      alphaMap: sharedAlpha,
      depthWrite: false,
      toneMapped: false,
      color: 0x9a9a9a,
    });
  const rFrontMat = rm(frontTex);
  const rFront = new Mesh(geo, rFrontMat);
  rFront.scale.copy(front.scale);
  rFront.position.copy(front.position);
  reflection.add(rFront);
  let rBackMat = null;
  if (backTex) {
    rBackMat = rm(backTex);
    const rBack = new Mesh(geo, rBackMat);
    rBack.scale.copy(backMesh.scale);
    rBack.position.copy(backMesh.position);
    rBack.rotation.y = Math.PI;
    reflection.add(rBack);
  }
  reflection.scale.y = -1;
  reflection.position.y = -0.004;
  group.add(reflection);

  const led = new Mesh(
    new SphereGeometry(0.028, 16, 12),
    new MeshBasicMaterial({ color: 0x4ade80 }),
  );
  led.position.set(fw * 0.34, BAG_H * 0.965, 0.02);
  led.visible = false;
  group.add(led);

  return {
    kind: 'card',
    group,
    front,
    back: backMesh,
    pickables: [front, backMesh],
    led,
    width: fw,
    height: BAG_H,
    setLed(on) {
      led.visible = on;
    },
    setDim(d) {
      frontMat.color.setScalar(1 - d);
      if (backTex) backMat.color.setScalar(1 - d);
    },
    dispose() {
      geo.dispose();
      frontTex.dispose();
      backTex?.dispose();
      for (const m of [frontMat, backMat, shadow.material, rFrontMat, rBackMat, led.material])
        m?.dispose();
      shadow.geometry.dispose();
      led.geometry.dispose();
    },
  };
}
