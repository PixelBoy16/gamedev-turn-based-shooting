import Phaser from 'phaser';
import { CharacterId, WeaponId } from '../core/data';

// Placeholder chibi art drawn with Graphics and baked into textures at 2x
// (displayed at 0.5 scale). Original designs: big head, thick outline, bright
// colours. Swap these keys for real sprite sheets later; nothing else needs to change.

export const ART_SCALE = 0.5;
export const CHIBI_W = 128;
export const CHIBI_H = 148;

const INK = 0x2a1e1a;
const LINE = 5;

type G = Phaser.GameObjects.Graphics;

export function makeArt(scene: Phaser.Scene): void {
  chibi(scene, 'mole', drawMole);
  chibi(scene, 'mason', drawMason);
  chibi(scene, 'sparky', drawSparky);
  guns(scene);
  shells(scene);
}

export const chibiKey = (id: CharacterId) => `chibi-${id}`;
export const gunKey = (id: WeaponId) => `gun-${id}`;
export const shellKey = (id: WeaponId) => `shell-${id}`;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function chibi(scene: Phaser.Scene, id: CharacterId, draw: (g: G) => void): void {
  bake(scene, chibiKey(id), CHIBI_W, CHIBI_H, draw);
}

// ------------------------------------------------------------------ shared parts

function filled(g: G, color: number, shape: () => void, stroke = true): void {
  g.fillStyle(color, 1);
  shape();
  if (stroke) {
    g.lineStyle(LINE, INK, 1);
  }
}

function body(g: G, cloth: number, hand: number): void {
  // feet
  g.fillStyle(INK, 1);
  g.fillEllipse(48, 140, 28, 14);
  g.fillEllipse(80, 140, 28, 14);
  // torso
  filled(g, cloth, () => g.fillRoundedRect(36, 94, 56, 46, 16));
  g.strokeRoundedRect(36, 94, 56, 46, 16);
  // hands
  for (const x of [32, 96]) {
    g.fillStyle(hand, 1);
    g.fillCircle(x, 118, 10);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(x, 118, 10);
  }
}

function head(g: G, skin: number, cy = 60, r = 44): void {
  g.fillStyle(skin, 1);
  g.fillCircle(64, cy, r);
  g.lineStyle(LINE, INK, 1);
  g.strokeCircle(64, cy, r);
}

/** Eyes look right (the sprite is flipped for facing left). */
function face(g: G, eyeY = 64, mouth: 'smile' | 'grin' | 'o' = 'smile'): void {
  for (const x of [56, 86]) {
    g.fillStyle(INK, 1);
    g.fillEllipse(x, eyeY, 11, 15);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x - 2, eyeY - 4, 3);
  }
  g.fillStyle(0xff8fa3, 0.55);
  g.fillEllipse(46, eyeY + 16, 14, 8);
  g.fillEllipse(96, eyeY + 16, 14, 8);
  g.lineStyle(3, INK, 1);
  g.beginPath();
  if (mouth === 'o') {
    g.strokeCircle(72, eyeY + 20, 4);
    return;
  }
  g.arc(72, eyeY + 14, mouth === 'grin' ? 9 : 6, 0.15 * Math.PI, 0.85 * Math.PI);
  g.strokePath();
}

// ------------------------------------------------------------------ characters

function drawMole(g: G): void {
  body(g, 0xf4a259, 0xf0d2b0);
  // overall straps + pocket
  g.lineStyle(4, 0xc47a2c, 1);
  g.lineBetween(48, 96, 52, 116);
  g.lineBetween(80, 96, 76, 116);
  g.fillStyle(0xc47a2c, 1);
  g.fillRoundedRect(54, 118, 20, 12, 3);
  // claws
  g.fillStyle(0xffffff, 1);
  for (const x of [26, 90]) for (let i = 0; i < 3; i++) g.fillTriangle(x + i * 6, 124, x + 4 + i * 6, 124, x + 2 + i * 6, 132);
  // ears behind the head
  for (const x of [26, 102]) {
    g.fillStyle(0x7a5638, 1);
    g.fillCircle(x, 34, 12);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(x, 34, 12);
  }
  head(g, 0x9a7150);
  // muzzle + nose
  g.fillStyle(0xf0d2b0, 1);
  g.fillEllipse(74, 84, 44, 28);
  face(g, 62, 'smile');
  g.fillStyle(0xff7a93, 1);
  g.fillCircle(76, 76, 7);
  g.lineStyle(3, INK, 1);
  g.strokeCircle(76, 76, 7);
  // goggles pushed up on the forehead
  g.lineStyle(6, 0x3a2c25, 1);
  g.lineBetween(22, 36, 106, 30);
  for (const x of [52, 84]) {
    g.fillStyle(0x7fd6ff, 1);
    g.fillCircle(x, 32, 12);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(x, 32, 12);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(x - 4, 28, 3);
  }
}

function drawMason(g: G): void {
  body(g, 0x6c7a89, 0xf3c89e);
  // hi-vis stripe + brick badge
  g.fillStyle(0xff8c42, 1);
  g.fillRect(38, 112, 52, 8);
  g.fillStyle(0xb5543c, 1);
  g.fillRect(58, 124, 14, 8);
  head(g, 0xf3c89e, 64);
  face(g, 70, 'grin');
  // thick brows
  g.fillStyle(0x4a3426, 1);
  g.fillRoundedRect(46, 52, 20, 6, 3);
  g.fillRoundedRect(76, 52, 20, 6, 3);
  // hard hat: dome + brim
  g.fillStyle(0xffc933, 1);
  g.beginPath();
  g.arc(64, 46, 42, Math.PI, 0);
  g.closePath();
  g.fillPath();
  g.lineStyle(LINE, INK, 1);
  g.strokePath();
  g.fillStyle(0xffd966, 1);
  g.fillRoundedRect(56, 6, 16, 40, 6);
  g.fillStyle(0xffc933, 1);
  g.fillRoundedRect(14, 40, 104, 14, 7);
  g.lineStyle(4, INK, 1);
  g.strokeRoundedRect(14, 40, 104, 14, 7);
}

function drawSparky(g: G): void {
  body(g, 0xe63946, 0xffd9b8);
  // lightning badge
  g.fillStyle(0xffd23f, 1);
  g.fillTriangle(66, 100, 56, 120, 66, 118);
  g.fillTriangle(62, 116, 72, 116, 60, 136);
  // flame hair behind the head
  const spikes = [[20, 46], [34, 14], [56, 2], [80, 6], [100, 18], [112, 44]];
  for (const [x, y] of spikes) {
    g.fillStyle(0xff5a36, 1);
    g.fillTriangle(x - 16, 50, x + 16, 50, x, y);
    g.fillStyle(0xffc233, 1);
    g.fillTriangle(x - 7, 48, x + 7, 48, x, y + 16);
  }
  head(g, 0xffd9b8, 64);
  face(g, 70, 'o');
  // goggle band
  g.fillStyle(0x2f2a3a, 1);
  g.fillRect(22, 40, 84, 12);
  for (const x of [56, 86]) {
    g.fillStyle(0xff9f1c, 1);
    g.fillCircle(x, 46, 10);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(x, 46, 10);
  }
  // bangs over the band
  g.fillStyle(0xff5a36, 1);
  g.fillTriangle(30, 30, 52, 30, 38, 52);
  g.fillTriangle(70, 28, 94, 30, 88, 50);
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
const POSES: Pose[] = ['idle', 'walk', 'aim', 'shoot', 'hurt', 'dead'];
const CHARS: CharacterId[] = ['mole', 'mason', 'sparky'];
const WEAPON_IDS: WeaponId[] = ['cannon', 'hammer', 'splitter', 'drill'];
export const ICON_IDS = ['double', 'power', 'warp', 'heal', 'armor', 'burrow', 'wall', 'calm'] as const;
export type IconId = (typeof ICON_IDS)[number];

/** Queue every generated sprite; call from a preload(). Missing files only log a warning. */
export function loadArt(scene: Phaser.Scene): void {
  const base = 'art/sprites/';
  for (const c of CHARS) for (const p of POSES) scene.load.image(`art-${c}-${p}`, `${base}${c}-${p}.png`);
  for (const w of WEAPON_IDS) scene.load.image(`art-gun-${w}`, `${base}gun-${w}.png`);
  for (const i of ICON_IDS) scene.load.image(`art-icon-${i}`, `${base}icon-${i}.png`);
  for (const m of ['hills', 'islands', 'mine']) scene.load.image(`art-bg-${m}`, `${base}bg-${m}.jpg`);
  scene.load.image('art-dirt', `${base}dirt.png`);
  scene.load.image('art-grass', `${base}grass.png`);
}

export const hasArt = (scene: Phaser.Scene, key: string) => scene.textures.exists(key);

export function poseTexture(scene: Phaser.Scene, c: CharacterId, p: Pose): string {
  const k = `art-${c}-${p}`;
  return hasArt(scene, k) ? k : chibiKey(c);
}

/** Texture, scale and grip pivot for a weapon. The generated guns are pistols held at the grip (bottom-left). */
export function gunLook(scene: Phaser.Scene, w: WeaponId): { key: string; scale: number; ox: number; oy: number } {
  const k = `art-gun-${w}`;
  return hasArt(scene, k) ? { key: k, scale: 0.34, ox: 0.18, oy: 0.68 } : { key: gunKey(w), scale: ART_SCALE, ox: GUN_ORIGIN_X, oy: 0.5 };
}

export function iconTexture(scene: Phaser.Scene, i: IconId): string | null {
  const k = `art-icon-${i}`;
  return hasArt(scene, k) ? k : null;
}
