import Phaser from 'phaser';
import { WEAPON_IDS } from '../core/config';
import { WeaponId } from '../core/data';
import { EquipSlot, FashionSlot, Loadout, equipDef, lookId } from '../core/gear';
import { DRAWERS, HAIR_BACK, SETS, drawFace, drawHead } from './drawnPieces';
import { LOOK_RES, painted, paintedHand, paintedLook, paintedPiece } from './look';

// Placeholder art drawn with Graphics and baked into textures at 2x (displayed at
// 0.5 scale). The character and its pieces are drawn in drawnPieces.ts (tough
// cartoon style); a whole look is baked into one texture per combination.
// Once painted layers exist (look.ts) they replace the drawn look entirely.

export const ART_SCALE = 0.5;
export const CHIBI_W = 128;
export const CHIBI_H = 148;

const INK = 0x2a1e1a;

type G = Phaser.GameObjects.Graphics;

export function makeArt(scene: Phaser.Scene): void {
  guns(scene);
  shells(scene);
}

export const gunKey = (id: WeaponId) => `gun-${id}`;
export const shellKey = (id: WeaponId) => `shell-${id}`;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** The texture for a loadout's look, baked the first time it is needed. */
export function lookTexture(scene: Phaser.Scene, l: Loadout): string {
  if (painted()) return paintedLook(scene, l);
  const key = `look-${lookId(l)}`;
  bake(scene, key, CHIBI_W, CHIBI_H, (g) => drawLook(g, l));
  return key;
}

/** Painted looks are baked sharper: multiply a look image's scale by this. */
export const lookRes = () => (painted() ? 1 / LOOK_RES : 1);

/** Where the weapon is held, relative to the feet in unscaled px facing right; null = the drawn chibi's spot. */
export const lookHand = () => (painted() ? paintedHand() : null);

/** Back to front: back item, hair behind the head, outfit, head, eyes, attitude, face, hair, glasses, hat. */
function drawLook(g: G, l: Loadout): void {
  const v = l.look;
  const set = v.set !== 'none' ? SETS[v.set] : undefined;
  DRAWERS.back[v.back]?.(g);
  if (!set) HAIR_BACK[v.hair]?.(g);
  (set?.suit ?? DRAWERS.cloth[v.cloth])?.(g);
  drawHead(g);
  DRAWERS.eyes[v.eyes]?.(g);
  drawFace(g);
  DRAWERS.face[v.face]?.(g);
  if (set) set.hood(g);
  else DRAWERS.hair[v.hair]?.(g);
  if (!l.hide.glasses) DRAWERS.glasses[v.glasses]?.(g);
  if (!set && !l.hide.hat) DRAWERS.hat[v.hat]?.(g);
}

/** One fashion piece on its own, for wardrobe tiles. Null for an empty choice. */
export function pieceTexture(scene: Phaser.Scene, slot: FashionSlot, id: string): string | null {
  if (id === 'none') return null;
  const art = painted() ? paintedPiece(scene, slot, id) : null;
  if (art) return art;
  const key = `piece-${slot}-${id}`;
  bake(scene, key, CHIBI_W, CHIBI_H, (g) => {
    if (slot === 'set') {
      SETS[id]?.suit(g);
      drawHead(g);
      DRAWERS.eyes.glare(g);
      drawFace(g);
      SETS[id]?.hood(g);
      return;
    }
    const onHead = slot === 'eyes' || slot === 'face' || slot === 'hair' || slot === 'glasses' || slot === 'hat';
    if (slot === 'hair') HAIR_BACK[id]?.(g);
    if (onHead) drawHead(g);
    if (slot !== 'eyes' && onHead) DRAWERS.eyes.glare(g);
    DRAWERS[slot][id]?.(g);
    if (slot === 'eyes') drawFace(g);
  });
  return key;
}

/** Equipment never shows on the body: a small drawn icon instead. */
export function equipTexture(scene: Phaser.Scene, slot: EquipSlot, id: string): string | null {
  const def = equipDef(slot, id);
  if (!def || id === 'none') return null;
  const key = `equip-${slot}-${id}`;
  const [metal, gem] = def.color;
  bake(scene, key, 96, 96, (g) => {
    g.lineStyle(4, INK, 1);
    if (slot === 'necklace') {
      g.lineStyle(6, metal, 1);
      g.beginPath();
      g.arc(48, 30, 30, 0.1 * Math.PI, 0.9 * Math.PI);
      g.strokePath();
      g.fillStyle(gem, 1);
      g.fillCircle(48, 66, 14);
      g.lineStyle(4, INK, 1);
      g.strokeCircle(48, 66, 14);
    } else if (slot === 'ring') {
      g.lineStyle(10, metal, 1);
      g.strokeCircle(48, 58, 24);
      g.fillStyle(gem, 1);
      g.fillCircle(48, 28, 14);
      g.lineStyle(4, INK, 1);
      g.strokeCircle(48, 28, 14);
    } else if (slot === 'bracelet') {
      g.lineStyle(14, metal, 1);
      g.strokeEllipse(48, 50, 70, 46);
      g.fillStyle(gem, 1);
      for (const x of [26, 48, 70]) g.fillCircle(x, 70, 7);
    } else {
      g.lineStyle(3, 0x8b5a2b, 1);
      g.lineBetween(48, 6, 48, 24);
      g.fillStyle(metal, 1);
      g.fillRoundedRect(24, 22, 48, 60, 14);
      g.lineStyle(4, INK, 1);
      g.strokeRoundedRect(24, 22, 48, 60, 14);
      g.fillStyle(gem, 1);
      g.fillCircle(48, 52, 12);
    }
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(slot === 'ring' ? 43 : 43, slot === 'ring' ? 23 : slot === 'necklace' ? 61 : 47, 4);
  });
  return key;
}

// ------------------------------------------------------------------ guns (pivot at x≈10, y=20)

export const GUN_W = 96;
export const GUN_H = 40;
export const GUN_ORIGIN_X = 10 / GUN_W;

function guns(scene: Phaser.Scene): void {
  bake(scene, gunKey('cannon'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0x3d4451, 1);
    g.fillRoundedRect(6, 10, 74, 20, 8);
    g.fillStyle(0x2a2f38, 1);
    g.fillRoundedRect(76, 5, 14, 30, 5);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(6, 10, 74, 20, 8);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(14, 14, 52, 4);
  });
  bake(scene, gunKey('hammer'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0x8b5a2b, 1);
    g.fillRoundedRect(6, 15, 56, 10, 4);
    g.fillStyle(0x9aa0a6, 1);
    g.fillRoundedRect(56, 3, 34, 34, 8);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(56, 3, 34, 34, 8);
    g.lineStyle(2, 0x5c6066, 1);
    g.lineBetween(64, 10, 74, 22);
    g.lineBetween(74, 22, 70, 32);
  });
  bake(scene, gunKey('splitter'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0xd62828, 1);
    g.fillRoundedRect(6, 9, 68, 22, 8);
    g.fillStyle(0xffc233, 1);
    g.fillRect(24, 9, 8, 22);
    g.fillRect(44, 9, 8, 22);
    g.fillTriangle(72, 8, 92, 20, 72, 32);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(6, 9, 68, 22, 8);
  });
  bake(scene, gunKey('shovel'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0x8b5a2b, 1);
    g.fillRoundedRect(6, 16, 54, 8, 4);
    g.fillStyle(0x9aa0a6, 1);
    g.fillRoundedRect(56, 6, 30, 28, 10);
    g.fillTriangle(84, 8, 94, 20, 84, 32);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(56, 6, 30, 28, 10);
    g.fillStyle(0xff8c42, 1);
    g.fillCircle(70, 20, 5); // the charge
  });
  bake(scene, gunKey('drill'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0xf4a259, 1);
    g.fillRoundedRect(6, 11, 36, 18, 5);
    g.fillStyle(0xc0c7d1, 1);
    g.fillTriangle(40, 4, 92, 20, 40, 36);
    g.lineStyle(3, INK, 1);
    g.strokeTriangle(40, 4, 92, 20, 40, 36);
    g.lineStyle(2, 0x7d8590, 1);
    for (let x = 50; x < 84; x += 10) g.lineBetween(x, 20 - (92 - x) * 0.28, x + 6, 20 + (92 - x) * 0.28);
  });
  bake(scene, gunKey('bouncer'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0x2f9e6e, 1);
    g.fillRoundedRect(6, 12, 60, 16, 7);
    g.fillStyle(0x1f6b4a, 1);
    g.fillCircle(76, 20, 15); // the drum
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(6, 12, 60, 16, 7);
    g.strokeCircle(76, 20, 15);
    g.lineStyle(3, 0xffd23f, 1);
    g.beginPath();
    g.arc(76, 20, 8, Math.PI * 0.2, Math.PI * 1.6);
    g.strokePath();
  });
  bake(scene, gunKey('beam'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0x2a2f38, 1);
    g.fillRoundedRect(6, 11, 72, 18, 6);
    g.fillStyle(0x47c6ff, 1);
    for (const x of [22, 36, 50]) g.fillRect(x, 13, 6, 14); // coils
    g.fillStyle(0x9aa0a6, 1);
    g.fillTriangle(76, 9, 92, 20, 76, 31);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(6, 11, 72, 18, 6);
    g.fillStyle(0xd8f6ff, 1);
    g.fillCircle(88, 20, 3);
  });
  bake(scene, gunKey('mortar'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0x6b7280, 1);
    g.fillRoundedRect(6, 14, 30, 12, 5);
    g.fillStyle(0x4b5563, 1);
    g.fillRoundedRect(32, 5, 54, 30, 6); // fat, short tube
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(32, 5, 54, 30, 6);
    g.fillStyle(0xff7a1a, 1);
    g.fillRect(44, 5, 6, 30);
    g.fillRect(62, 5, 6, 30);
  });
  bake(scene, gunKey('magnet'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0x3d4451, 1);
    g.fillRoundedRect(6, 14, 44, 12, 5);
    // a horseshoe magnet pointing forward
    g.lineStyle(12, 0xd63a2a, 1);
    g.beginPath();
    g.arc(64, 20, 12, Math.PI * 0.5, Math.PI * 1.5);
    g.strokePath();
    g.fillStyle(0xd63a2a, 1);
    g.fillRect(62, 2, 16, 12);
    g.fillRect(62, 26, 16, 12);
    g.fillStyle(0xe5e7eb, 1);
    g.fillRect(76, 2, 12, 12);
    g.fillRect(76, 26, 12, 12);
    g.lineStyle(3, INK, 1);
    g.strokeRect(62, 2, 26, 12);
    g.strokeRect(62, 26, 26, 12);
  });
  bake(scene, gunKey('dirtbomb'), GUN_W, GUN_H, (g) => {
    g.fillStyle(0x8b5a2b, 1);
    g.fillRoundedRect(6, 12, 62, 16, 6);
    g.fillStyle(0x5c3b1e, 1);
    g.fillRoundedRect(62, 6, 26, 28, 8);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(6, 12, 62, 16, 6);
    g.strokeRoundedRect(62, 6, 26, 28, 8);
    g.fillStyle(0xa47148, 1);
    for (const [x, y] of [[70, 14], [80, 22], [72, 27]]) g.fillCircle(x, y, 3);
  });
}

// ------------------------------------------------------------------ shells (drawn pointing right)

function shells(scene: Phaser.Scene): void {
  bake(scene, shellKey('cannon'), 28, 28, (g) => {
    g.fillStyle(INK, 1);
    g.fillCircle(14, 14, 12);
    g.fillStyle(0x4b5563, 1);
    g.fillCircle(14, 14, 9);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(10, 10, 3);
  });
  bake(scene, shellKey('hammer'), 32, 32, (g) => {
    g.fillStyle(INK, 1);
    g.fillRoundedRect(2, 2, 28, 28, 7);
    g.fillStyle(0x9aa0a6, 1);
    g.fillRoundedRect(5, 5, 22, 22, 5);
  });
  bake(scene, shellKey('splitter'), 40, 20, (g) => {
    g.fillStyle(0xffc233, 1);
    g.fillTriangle(0, 4, 10, 10, 0, 16);
    g.fillStyle(INK, 1);
    g.fillRoundedRect(6, 3, 30, 14, 6);
    g.fillStyle(0xd62828, 1);
    g.fillRoundedRect(8, 5, 26, 10, 5);
  });
  bake(scene, shellKey('shovel'), 30, 30, (g) => {
    g.fillStyle(INK, 1);
    g.fillCircle(15, 15, 13);
    g.fillStyle(0xff8c42, 1);
    g.fillCircle(15, 15, 10);
    g.fillStyle(0xffd23f, 1);
    g.fillCircle(11, 11, 4);
  });
  bake(scene, shellKey('bouncer'), 28, 28, (g) => {
    g.fillStyle(INK, 1);
    g.fillCircle(14, 14, 12);
    g.fillStyle(0x2f9e6e, 1);
    g.fillCircle(14, 14, 9);
    g.lineStyle(3, 0xffd23f, 1);
    g.lineBetween(6, 14, 22, 14);
  });
  bake(scene, shellKey('beam'), 44, 14, (g) => {
    g.fillStyle(0x47c6ff, 0.45);
    g.fillRoundedRect(0, 1, 44, 12, 6);
    g.fillStyle(0xd8f6ff, 1);
    g.fillRoundedRect(8, 4, 34, 6, 3);
  });
  bake(scene, shellKey('mortar'), 30, 30, (g) => {
    g.fillStyle(INK, 1);
    g.fillCircle(15, 15, 13);
    g.fillStyle(0x4b5563, 1);
    g.fillCircle(15, 15, 10);
    g.fillStyle(0xff7a1a, 1);
    for (const a of [0, 1, 2, 3]) g.fillCircle(15 + Math.cos(a * 1.57) * 5, 15 + Math.sin(a * 1.57) * 5, 2.5);
  });
  bake(scene, shellKey('magnet'), 30, 30, (g) => {
    g.fillStyle(INK, 1);
    g.fillCircle(15, 15, 13);
    g.fillStyle(0xd63a2a, 1);
    g.slice(15, 15, 10, Math.PI * 0.5, Math.PI * 1.5);
    g.fillPath();
    g.fillStyle(0x3b5ba8, 1);
    g.slice(15, 15, 10, Math.PI * 1.5, Math.PI * 0.5);
    g.fillPath();
  });
  bake(scene, shellKey('dirtbomb'), 30, 30, (g) => {
    g.fillStyle(INK, 1);
    g.fillCircle(15, 15, 13);
    g.fillStyle(0x8b5a2b, 1);
    g.fillCircle(15, 15, 10);
    g.fillStyle(0x5c3b1e, 1);
    g.fillCircle(11, 17, 3);
    g.fillCircle(19, 11, 2.5);
  });
  bake(scene, shellKey('drill'), 40, 22, (g) => {
    g.fillStyle(0xf4a259, 1);
    g.fillRect(2, 6, 12, 10);
    g.fillStyle(0xc0c7d1, 1);
    g.fillTriangle(12, 1, 38, 11, 12, 21);
    g.lineStyle(2, INK, 1);
    g.strokeTriangle(12, 1, 38, 11, 12, 21);
  });
}

// ------------------------------------------------------------------ generated art (public/art/sprites)
// Produced by tools/prepare_art.py. Each lookup falls back to the drawn placeholder above if a file is missing.

export type Pose = 'idle' | 'walk' | 'aim' | 'shoot' | 'hurt' | 'dead';
export const ICON_IDS = ['double', 'power', 'warp', 'heal', 'armor', 'burrow', 'wall', 'calm'] as const;

/** Queue every generated sprite; call from a preload(). Missing files only log a warning. */
export function loadArt(scene: Phaser.Scene): void {
  const base = 'art/sprites/';
  for (const w of WEAPON_IDS) scene.load.image(`art-gun-${w}`, `${base}gun-${w}.png`);
  for (const i of ICON_IDS) scene.load.image(`art-icon-${i}`, `${base}icon-${i}.png`);
  for (const m of ['hills', 'islands', 'mine']) scene.load.image(`art-bg-${m}`, `${base}bg-${m}.jpg`);
  scene.load.image('art-dirt', `${base}dirt.png`);
  scene.load.image('art-grass', `${base}grass.png`);
  // first screen, cut from the designer's mockup by tools/prepare_menu_ui.py
  scene.load.image('art-menu-bg', 'art/ui/menu-bg.jpg');
  for (const f of MENU_UI) scene.load.image(`ui-${f}`, `art/ui/${f}.webp`);
}

/** Pieces of the first screen in public/art/ui/, loaded as `ui-<name>`. */
export const MENU_UI = [
  'logo', 'slogan', 'char-scout', 'char-hero', 'char-bear', 'trail', 'status', 'arrow', 'plus',
  'btn-bot', 'btn-friends', 'btn-ranked', 'btn-shop', 'btn-pass', 'btn-settings',
  'ico-bot', 'ico-friends', 'ico-ranked', 'ico-shop', 'ico-pass', 'ico-settings', 'ico-coin', 'ico-gem',
  'cur-coins', 'cur-gems',
] as const;

export const hasArt = (scene: Phaser.Scene, key: string) => scene.textures.exists(key);

/**
 * Texture, scale and grip pivot for a weapon. The generated guns are pistols held by the middle
 * of the grip (bottom-left); next to a painted look they are kept smaller, about half its height.
 */
export function gunLook(scene: Phaser.Scene, w: WeaponId): { key: string; scale: number; ox: number; oy: number } {
  const k = `art-gun-${w}`;
  if (!hasArt(scene, k)) return { key: gunKey(w), scale: ART_SCALE, ox: GUN_ORIGIN_X, oy: 0.5 };
  return { key: k, scale: painted() ? 0.22 : 0.34, ox: 0.12, oy: 0.8 };
}

/** Generated icon for an item or skill, or null to show the label alone. */
export function iconTexture(scene: Phaser.Scene, i: string): string | null {
  const k = `art-icon-${i}`;
  return hasArt(scene, k) ? k : null;
}
