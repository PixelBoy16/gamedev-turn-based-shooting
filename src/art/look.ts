import Phaser from 'phaser';
import { FashionSlot, Loadout, lookId } from '../core/gear';
import { BODY, lookLayers, pieceFiles } from './lookNames';

// Painted dress-up layers: one PNG per piece in src/art/look/, all drawn by ChatGPT on
// the same 1024 canvas over the same base body (prompts in the GDD). On boot each file
// is trimmed to its opaque pixels; a look is composed from the trims into one texture.
// Painted mode is on once body.png exists; until then the drawn chibi is used. A piece
// can sit a little off in its file, so align.json nudges and scales each layer (the
// look lab, ?lab in dev, edits it).

const FILES = import.meta.glob('./look/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const SAVED = import.meta.glob('./look/align.json', { eager: true, import: 'default' }) as Record<string, Align>;

/** The canvas the pieces are drawn on, and where the base body stands on it. */
const SRC = 1024;
const SRC_X = SRC / 2;
const SRC_FEET = 964;
const SRC_HEAD = 120;

/** Painted looks are baked this many times sharper than the drawn chibi; show them at 1/LOOK_RES. */
export const LOOK_RES = 2;
/** Logical frame: the figure is as tall as the drawn chibi, feet on the bottom row. */
const OUT_W = 160;
const OUT_H = 160;
const FIGURE = 131;
const BASE = FIGURE / (SRC_FEET - SRC_HEAD);
/** Trims are kept at half the source size: still sharper than any place they are shown. */
const KEEP = 0.5;

export interface Nudge {
  dx: number; // source px
  dy: number;
  s: number; // scale about the piece's centre
}

export interface Align {
  /** The body's nudge moves the whole figure (scaled about the feet). */
  layers: Record<string, Nudge>;
  /** Where the fist is on the body, in source px: the weapon is held there. */
  hand: { x: number; y: number };
}

const NO_NUDGE: Nudge = { dx: 0, dy: 0, s: 1 };

interface Layer {
  img: HTMLCanvasElement;
  // opaque bounds in source px
  x: number;
  y: number;
  w: number;
  h: number;
}

const layers = new Map<string, Layer>();
let align: Align = Object.values(SAVED)[0] ?? { layers: {}, hand: { x: 640, y: 560 } };
let version = 0;
const baked = new Set<string>();

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.png'.length);

/** Queue every painted layer; call from a preload(). */
export function loadLook(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(FILES)) scene.load.image(`looksrc-${fileName(path)}`, url);
}

/** Trim the loaded layers and free the full-size originals; call once from create(). */
export function prepareLook(scene: Phaser.Scene): void {
  for (const path of Object.keys(FILES)) {
    const name = fileName(path);
    const key = `looksrc-${name}`;
    if (!scene.textures.exists(key)) continue;
    const layer = trim(name, scene.textures.get(key).getSourceImage() as HTMLImageElement);
    if (layer) layers.set(name, layer);
    scene.textures.remove(key);
  }
}

function trim(name: string, img: HTMLImageElement): Layer | null {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const a = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width;
  let y0 = c.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (a[(y * c.width + x) * 4 + 3] < 16) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) {
    console.warn(`[look] ${name}.png is empty`);
    return null;
  }
  if (a[3] >= 16) console.warn(`[look] ${name}.png has no transparent background`);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const k = SRC / img.width; // in case a file comes back at another size
  const out = document.createElement('canvas');
  out.width = Math.ceil(w * k * KEEP);
  out.height = Math.ceil(h * k * KEEP);
  out.getContext('2d')!.drawImage(img, x0, y0, w, h, 0, 0, out.width, out.height);
  return { img: out, x: x0 * k, y: y0 * k, w: w * k, h: h * k };
}

export const painted = () => layers.has(BODY);
export const hasLayer = (name: string) => layers.has(name);
export const getAlign = (): Align => align;

/** Replace the alignment (the look lab) and drop every texture baked with the old one. */
export function setAlign(scene: Phaser.Scene, next: Align): void {
  align = next;
  version++;
  for (const key of baked) scene.textures.remove(key);
  baked.clear();
}

/** A layer's nudged bounds in source px. */
function nudged(name: string): { x: number; y: number; w: number; h: number } {
  const l = layers.get(name)!;
  const n = name === BODY ? NO_NUDGE : align.layers[name] ?? NO_NUDGE;
  const w = l.w * n.s;
  const h = l.h * n.s;
  return { x: l.x + l.w / 2 + n.dx - w / 2, y: l.y + l.h / 2 + n.dy - h / 2, w, h };
}

/** Source px to the logical frame, through the body's nudge. */
function frame(x: number, y: number): { x: number; y: number } {
  const b = align.layers[BODY] ?? NO_NUDGE;
  const k = BASE * b.s;
  return { x: (x + b.dx - SRC_X) * k + OUT_W / 2, y: (y + b.dy - SRC_FEET) * k + OUT_H - 1 };
}

/** A layer's bounds in the logical frame (feet at the bottom centre). */
export function layerRect(name: string): { x: number; y: number; w: number; h: number } | null {
  if (!layers.has(name)) return null;
  const r = nudged(name);
  const p = frame(r.x, r.y);
  const q = frame(r.x + r.w, r.y + r.h);
  return { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y };
}

export const LOOK_FRAME = { w: OUT_W, h: OUT_H };

function bakeCanvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  draw(ctx);
  scene.textures.addCanvas(key, c);
  baked.add(key);
  return key;
}

/** The painted texture for a look; missing pieces are left out. Only call when painted(). */
export function paintedLook(scene: Phaser.Scene, l: Loadout): string {
  return bakeCanvas(scene, `plook-${version}-${lookId(l)}`, OUT_W * LOOK_RES, OUT_H * LOOK_RES, (ctx) => {
    for (const name of lookLayers(l)) {
      const r = layerRect(name);
      if (r) ctx.drawImage(layers.get(name)!.img, r.x * LOOK_RES, r.y * LOOK_RES, r.w * LOOK_RES, r.h * LOOK_RES);
    }
  });
}

/** A wardrobe tile for a painted piece, cropped to it; null if none of its files exist yet. */
export function paintedPiece(scene: Phaser.Scene, slot: FashionSlot, id: string): string | null {
  const names = pieceFiles(slot, id).filter((n) => layers.has(n));
  if (!names.length) return null;
  const rects = names.map(nudged);
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  const k = 160 / Math.max(x1 - x0, y1 - y0);
  return bakeCanvas(scene, `ppiece-${version}-${slot}-${id}`, (x1 - x0) * k, (y1 - y0) * k, (ctx) => {
    names.forEach((n, i) => {
      const r = rects[i];
      ctx.drawImage(layers.get(n)!.img, (r.x - x0) * k, (r.y - y0) * k, r.w * k, r.h * k);
    });
  });
}

/** A point in the logical frame back to source px (the inverse of frame). */
export function toSource(x: number, y: number): { x: number; y: number } {
  const b = align.layers[BODY] ?? NO_NUDGE;
  const k = BASE * b.s;
  return { x: (x - OUT_W / 2) / k + SRC_X - b.dx, y: (y - (OUT_H - 1)) / k + SRC_FEET - b.dy };
}

/** How many source px one logical px is, for dragging a layer. */
export const sourcePerLogical = () => 1 / (BASE * (align.layers[BODY] ?? NO_NUDGE).s);

/** The fist, relative to the feet in logical px, facing right. */
export function paintedHand(): { x: number; y: number } {
  const p = frame(align.hand.x, align.hand.y);
  return { x: p.x - OUT_W / 2, y: p.y - (OUT_H - 1) };
}
