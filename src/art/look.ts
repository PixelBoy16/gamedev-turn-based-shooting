import Phaser from 'phaser';
import { FashionSlot, Loadout, lookId } from '../core/gear';
import { BODY, BODY_PARTS, HAND_PART, HEAD_PART, JOINTS, headInSet, lookLayers, parentOf, pieceFiles } from './lookNames';

// Painted dress-up layers: one PNG per piece in src/art/look/, all drawn by ChatGPT on
// the same 1024 canvas over the same base body (prompts in the GDD). On boot each file
// is trimmed to its opaque pixels; a look is composed from the trims into one texture.
// Painted mode is on once the body (body.png or its parts) exists; until then the drawn
// chibi is used. A piece can sit a little off in its file, so align.json moves, scales,
// turns, flips and re-orders each layer (the look lab, ?lab in dev, edits it). With the body
// in parts a layer moves with the one it hangs from (parentOf): a forearm with its upper arm,
// a hat with the head; body parts turn and scale about their joint.

const FILES = import.meta.glob('./look/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const SAVED = import.meta.glob('./look/align.json', { eager: true, import: 'default' }) as Record<string, Align>;

/** The canvas the pieces are drawn on, and where the base body stands on it. */
const SRC = 1024;
const SRC_X = SRC / 2;
const SRC_FEET = 964;
const SRC_HEAD = 120;
/** Below this a whole body.png is hidden under a set's suit (its fists and boots would poke out). */
const SRC_NECK = 470;

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
  s: number; // scale about the body part's joint, or the piece's centre
  r?: number; // degrees clockwise about the same point
  fx?: boolean; // mirrored left-right
  z?: number; // steps forward (+) or back (-) past the neighbouring layers
}

export interface Align {
  /** The "body" nudge moves and scales the whole figure (about the feet). */
  layers: Record<string, Nudge>;
  /** Where the fist is on the body, in source px: the weapon is held there. Follows the right hand's nudges. */
  hand: { x: number; y: number };
}

export const NO_NUDGE: Nudge = { dx: 0, dy: 0, s: 1 };

interface Layer {
  img: HTMLCanvasElement;
  // opaque bounds in source px
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A 2D affine map in source px, canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Mat = [number, number, number, number, number, number];

/** Source px to canvas px: X = x * k + tx. */
interface Mapping {
  k: number;
  tx: number;
  ty: number;
}

const layers = new Map<string, Layer>();
let align: Align = Object.values(SAVED)[0] ?? { layers: {}, hand: { x: 640, y: 560 } };
let version = 0;
const baked = new Set<string>();

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.png'.length);

const ID: Mat = [1, 0, 0, 1, 0, 0];
/** m after n. */
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Mat, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

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

const hasParts = () => BODY_PARTS.some((p) => layers.has(p));
export const painted = () => layers.has(BODY) || hasParts();
export const hasLayer = (name: string) => layers.has(name);
export const getAlign = (): Align => align;
export const nudgeOf = (name: string): Nudge => ({ ...NO_NUDGE, ...align.layers[name] });

/** The align.json key a layer's nudge is kept under: inside a set's suit the head has its own. */
export const nudgeKey = (name: string, set = 'none'): string => (name === HEAD_PART && set !== 'none' ? headInSet(set) : name);

/** Replace the alignment (the look lab) and drop every texture baked with the old one. */
export function setAlign(scene: Phaser.Scene, next: Align): void {
  align = next;
  version++;
  for (const key of baked) scene.textures.remove(key);
  baked.clear();
}

/** Where a layer turns and scales: a body part's joint, else the middle of the piece. */
function pivot(name: string): { x: number; y: number } {
  const l = layers.get(name);
  return JOINTS[name] ?? (l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : { x: SRC_X, y: SRC_FEET });
}

/** A layer's own nudge as a map: mirror, scale and turn about its pivot, then move. */
function local(name: string, set: string): Mat {
  if (name === BODY) return ID;
  const n = nudgeOf(nudgeKey(name, set));
  const p = pivot(name);
  const r = ((n.r ?? 0) * Math.PI) / 180;
  const f = n.fx ? -1 : 1;
  const a = Math.cos(r) * n.s * f;
  const b = Math.sin(r) * n.s * f;
  const c = -Math.sin(r) * n.s;
  const d = Math.cos(r) * n.s;
  return [a, b, c, d, p.x + n.dx - (a * p.x + c * p.y), p.y + n.dy - (b * p.x + d * p.y)];
}

/** A layer's nudge after the nudges of everything it hangs from (only while the body is in parts). */
function world(name: string, set = 'none'): Mat {
  const parent = hasParts() ? parentOf(name) : null;
  const m = local(name, set);
  return parent ? mul(world(parent, set), m) : m;
}

/** The four corners of a layer after its nudges, in source px. */
function corners(name: string, set = 'none'): { x: number; y: number }[] {
  const l = layers.get(name)!;
  const m = world(name, set);
  return [[l.x, l.y], [l.x + l.w, l.y], [l.x + l.w, l.y + l.h], [l.x, l.y + l.h]].map(([x, y]) => apply(m, x, y));
}

/** Source px to the logical frame, through the whole-figure nudge. */
function frameMap(): Mapping {
  const b = align.layers[BODY] ?? NO_NUDGE;
  const k = BASE * b.s;
  return { k, tx: (b.dx - SRC_X) * k + OUT_W / 2, ty: (b.dy - SRC_FEET) * k + OUT_H - 1 };
}

function frame(x: number, y: number): { x: number; y: number } {
  const m = frameMap();
  return { x: x * m.k + m.tx, y: y * m.k + m.ty };
}

/**
 * The layers a look is drawn with, back to front: the files that exist (the body parts
 * replace body.png), re-ordered by each layer's z nudge.
 */
export function lookStack(l: Loadout): string[] {
  const parts = hasParts();
  const names = lookLayers(l).filter((n) => layers.has(n) && !(parts && n === BODY));
  const key = (n: string, i: number) => {
    const z = nudgeOf(nudgeKey(n, l.look.set)).z ?? 0;
    return i + z + (z > 0 ? 0.5 : z < 0 ? -0.5 : 0);
  };
  return names.map((n, i) => ({ n, k: key(n, i) })).sort((a, b) => a.k - b.k).map((e) => e.n);
}

/** A layer's corners in the logical frame (feet at the bottom centre), or null without its file. */
export function layerCorners(name: string, set = 'none'): { x: number; y: number }[] | null {
  if (!layers.has(name)) return null;
  return corners(name, set).map((p) => frame(p.x, p.y));
}

/** Where a body part turns, in the logical frame; null for anything else (it turns about its middle). */
export function layerJoint(name: string, set = 'none'): { x: number; y: number } | null {
  const j = JOINTS[name];
  if (!j || !hasParts()) return null;
  const p = apply(world(name, set), j.x, j.y);
  return frame(p.x, p.y);
}

/** A move in source px, as the dx/dy of a layer that may hang from a turned or scaled parent. */
export function moveInParent(name: string, dx: number, dy: number, set = 'none'): { x: number; y: number } {
  const parent = hasParts() && name !== BODY ? parentOf(name) : null;
  if (!parent) return { x: dx, y: dy };
  const m = invert(world(parent, set));
  return { x: m[0] * dx + m[2] * dy, y: m[1] * dx + m[3] * dy };
}

export const LOOK_FRAME = { w: OUT_W, h: OUT_H };

function drawLayer(ctx: CanvasRenderingContext2D, name: string, m: Mapping, set = 'none', crop = 1): void {
  const l = layers.get(name)!;
  ctx.save();
  ctx.transform(m.k, 0, 0, m.k, m.tx, m.ty);
  ctx.transform(...world(name, set));
  ctx.drawImage(l.img, 0, 0, l.img.width, l.img.height * crop, l.x, l.y, l.w, l.h * crop);
  ctx.restore();
}

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

/** The painted texture for a look, minus any `skip` layers (the lab); missing pieces are left out. Only call when painted(). */
export function paintedLook(scene: Phaser.Scene, l: Loadout, skip: string[] = []): string {
  const key = `plook-${version}-${lookId(l)}${skip.length ? `-${skip.join('.')}` : ''}`;
  return bakeCanvas(scene, key, OUT_W * LOOK_RES, OUT_H * LOOK_RES, (ctx) => {
    const f = frameMap();
    const m = { k: f.k * LOOK_RES, tx: f.tx * LOOK_RES, ty: f.ty * LOOK_RES };
    for (const name of lookStack(l)) {
      if (skip.includes(name)) continue;
      // a set covers a whole body.png but its head, so only that much is drawn
      const l0 = layers.get(name)!;
      const crop = name === BODY && l.look.set !== 'none' ? Math.min(1, (SRC_NECK - l0.y) / l0.h) : 1;
      drawLayer(ctx, name, m, l.look.set, crop);
    }
  });
}

/** A wardrobe tile for a painted piece, cropped to it; null if none of its files exist yet. */
export function paintedPiece(scene: Phaser.Scene, slot: FashionSlot, id: string): string | null {
  const names = pieceFiles(slot, id).filter((n) => layers.has(n));
  if (!names.length) return null;
  const pts = names.flatMap((n) => corners(n));
  const x0 = Math.min(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y));
  const x1 = Math.max(...pts.map((p) => p.x));
  const y1 = Math.max(...pts.map((p) => p.y));
  const k = 160 / Math.max(x1 - x0, y1 - y0);
  return bakeCanvas(scene, `ppiece-${version}-${slot}-${id}`, (x1 - x0) * k, (y1 - y0) * k, (ctx) => {
    for (const n of names) drawLayer(ctx, n, { k, tx: -x0 * k, ty: -y0 * k });
  });
}

/** The hand moves the fist with it (and the arm the hand): a source point through the hand's nudges (or back, with `undo`). */
function throughHand(x: number, y: number, undo = false): { x: number; y: number } {
  if (!hasParts()) return { x, y };
  const m = world(HAND_PART);
  return apply(undo ? invert(m) : m, x, y);
}

/** A point in the logical frame back to the fist's source px (the inverse of paintedHand). */
export function handToSource(x: number, y: number): { x: number; y: number } {
  const m = frameMap();
  return throughHand((x - m.tx) / m.k, (y - m.ty) / m.k, true);
}

/** How many source px one logical px is, for dragging a layer. */
export const sourcePerLogical = () => 1 / frameMap().k;

/** The fist, relative to the feet in logical px, facing right. */
export function paintedHand(): { x: number; y: number } {
  const h = throughHand(align.hand.x, align.hand.y);
  const p = frame(h.x, h.y);
  return { x: p.x - OUT_W / 2, y: p.y - (OUT_H - 1) };
}
