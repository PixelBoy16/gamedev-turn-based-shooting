import Phaser from 'phaser';
import { WeaponId } from '../core/data';
import { EquipSlot, FashionSlot, Loadout, equipDef, lookId } from '../core/gear';
import { LOOK_RES, painted, paintedHand, paintedLook, paintedPiece } from './look';

// Placeholder chibi art drawn with Graphics and baked into textures at 2x
// (displayed at 0.5 scale). Original designs: big head, thick outline, bright
// colours. Everyone is the same plain chibi; fashion pieces are drawn in layers
// (see drawLook) and the whole look is baked into one texture per combination.
// Once painted layers exist (look.ts) they replace the drawn look entirely.

export const ART_SCALE = 0.5;
export const CHIBI_W = 128;
export const CHIBI_H = 148;

const INK = 0x2a1e1a;
const LINE = 5;
const SKIN = 0xf6d1ad;

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

/** Back to front: back item, hair behind the head, outfit, head, eyes, face, hair, glasses, hat. */
function drawLook(g: G, l: Loadout): void {
  const v = l.look;
  const bear = v.set === 'bear';
  BACK[v.back]?.(g);
  if (!bear) HAIR_BACK[v.hair]?.(g);
  if (bear) bearSuit(g);
  else CLOTH[v.cloth](g);
  head(g, SKIN);
  EYES[v.eyes](g);
  mouth(g);
  FACE[v.face]?.(g);
  if (bear) bearHood(g);
  else HAIR[v.hair](g);
  if (!l.hide.glasses) GLASSES[v.glasses]?.(g);
  if (!bear && !l.hide.hat) HAT[v.hat]?.(g);
}

/** One fashion piece on its own, for wardrobe tiles. Null for an empty choice. */
export function pieceTexture(scene: Phaser.Scene, slot: FashionSlot, id: string): string | null {
  if (id === 'none') return null;
  const art = painted() ? paintedPiece(scene, slot, id) : null;
  if (art) return art;
  const key = `piece-${slot}-${id}`;
  bake(scene, key, CHIBI_W, CHIBI_H, (g) => {
    const onHead = slot === 'eyes' || slot === 'face' || slot === 'hair' || slot === 'glasses';
    if (slot === 'hair') HAIR_BACK[id]?.(g);
    if (onHead) head(g, SKIN);
    if (slot === 'face' || slot === 'glasses') EYES.round(g);
    const draw: Record<FashionSlot, Draw | undefined> = {
      hat: HAT[id], glasses: GLASSES[id], hair: HAIR[id], face: FACE[id], cloth: CLOTH[id], eyes: EYES[id], back: BACK[id],
      set: (gg) => { bearSuit(gg); head(gg, SKIN); EYES.round(gg); mouth(gg); bearHood(gg); },
    };
    draw[slot]?.(g);
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

function mouth(g: G): void {
  g.lineStyle(3, INK, 1);
  g.beginPath();
  g.arc(72, 78, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  g.strokePath();
}

// ------------------------------------------------------------------ fashion layers (eyes look right; flipped for left)

type Draw = (g: G) => void;

const EYE_X = [56, 86];
const EYE_Y = 64;

const EYES: Record<string, Draw> = {
  round: (g) => {
    for (const x of EYE_X) {
      g.fillStyle(INK, 1);
      g.fillEllipse(x, EYE_Y, 11, 15);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x - 2, EYE_Y - 4, 3);
    }
  },
  happy: (g) => {
    g.lineStyle(4, INK, 1);
    for (const x of EYE_X) {
      g.beginPath();
      g.arc(x, EYE_Y + 3, 7, 1.1 * Math.PI, 1.9 * Math.PI);
      g.strokePath();
    }
  },
  sharp: (g) => {
    for (const x of EYE_X) {
      g.fillStyle(INK, 1);
      g.fillTriangle(x - 8, EYE_Y - 4, x + 8, EYE_Y - 8, x + 6, EYE_Y + 6);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x + 2, EYE_Y - 3, 2);
    }
  },
  star: (g) => {
    for (const x of EYE_X) {
      g.fillStyle(INK, 1);
      g.fillEllipse(x, EYE_Y, 13, 16);
      g.fillStyle(0xffd23f, 1);
      g.fillTriangle(x - 5, EYE_Y + 2, x + 5, EYE_Y + 2, x, EYE_Y - 7);
      g.fillTriangle(x - 5, EYE_Y - 3, x + 5, EYE_Y - 3, x, EYE_Y + 6);
    }
  },
};

const FACE: Record<string, Draw> = {
  blush: (g) => {
    g.fillStyle(0xff8fa3, 0.7);
    g.fillEllipse(46, 80, 16, 9);
    g.fillEllipse(96, 80, 16, 9);
  },
  bandaid: (g) => {
    g.fillStyle(0xf4c48a, 1);
    g.fillRoundedRect(34, 74, 24, 10, 4);
    g.lineStyle(2, INK, 1);
    g.strokeRoundedRect(34, 74, 24, 10, 4);
    g.lineBetween(46, 74, 46, 84);
  },
  mustache: (g) => {
    g.fillStyle(0x3b2a20, 1);
    g.fillEllipse(64, 74, 22, 8);
    g.fillEllipse(80, 74, 22, 8);
  },
};

function hairCap(g: G, color: number): void {
  g.fillStyle(color, 1);
  g.beginPath();
  g.arc(64, 56, 46, Math.PI * 1.02, Math.PI * 1.98);
  g.closePath();
  g.fillPath();
}

const HAIR_BACK: Record<string, Draw> = {
  ponytail: (g) => {
    g.fillStyle(0x23202b, 1);
    g.fillEllipse(22, 64, 30, 56);
    g.lineStyle(4, INK, 1);
    g.strokeEllipse(22, 64, 30, 56);
  },
  bob: (g) => {
    g.fillStyle(0xff8fb3, 1);
    g.fillRoundedRect(16, 40, 96, 60, 26);
  },
};

const HAIR: Record<string, Draw> = {
  short: (g) => {
    hairCap(g, 0x5b3a29);
    for (const [x, y] of [[34, 18], [52, 8], [72, 6], [92, 14]]) g.fillTriangle(x - 12, 34, x + 14, 30, x, y);
    g.fillTriangle(70, 22, 100, 30, 96, 52);
  },
  spiky: (g) => {
    g.fillStyle(0xff8c42, 1);
    for (const [x, y] of [[24, 6], [44, -4], [66, -8], [88, -2], [106, 14]]) g.fillTriangle(x - 16, 40, x + 16, 36, x, y + 8);
    hairCap(g, 0xff8c42);
  },
  ponytail: (g) => {
    hairCap(g, 0x23202b);
    g.fillStyle(0xe63946, 1);
    g.fillCircle(24, 40, 7); // hair tie
  },
  bob: (g) => {
    hairCap(g, 0xff8fb3);
    g.fillRect(66, 26, 44, 18); // straight fringe
  },
};

const GLASSES: Record<string, Draw> = {
  round: (g) => {
    g.lineStyle(4, 0x8b4513, 1);
    for (const x of EYE_X) g.strokeCircle(x, EYE_Y, 12);
    g.lineBetween(68, EYE_Y, 74, EYE_Y);
    g.lineBetween(44, EYE_Y - 2, 26, EYE_Y - 6);
  },
  shades: (g) => {
    g.fillStyle(0x1b2030, 1);
    for (const x of EYE_X) g.fillRoundedRect(x - 14, EYE_Y - 9, 28, 18, 6);
    g.lineStyle(4, 0x1b2030, 1);
    g.lineBetween(64, EYE_Y - 4, 76, EYE_Y - 4);
    g.fillStyle(0xffffff, 0.5);
    for (const x of EYE_X) g.fillRect(x - 9, EYE_Y - 6, 6, 3);
  },
};

const HAT: Record<string, Draw> = {
  helm: (g) => {
    g.fillStyle(0xa9b4c2, 1);
    g.beginPath();
    g.arc(64, 52, 46, Math.PI, 0);
    g.closePath();
    g.fillPath();
    g.lineStyle(LINE, INK, 1);
    g.strokePath();
    g.fillStyle(0x7d8794, 1);
    g.fillRoundedRect(14, 46, 100, 12, 6);
    g.fillRoundedRect(60, 4, 10, 46, 4);
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(44, 26, 18, 10);
  },
  aviator: (g) => {
    g.fillStyle(0x8b5a2b, 1);
    g.beginPath();
    g.arc(64, 56, 47, Math.PI * 1.05, Math.PI * 1.95);
    g.closePath();
    g.fillPath();
    g.fillRoundedRect(16, 50, 20, 34, 8);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(16, 50, 20, 34, 8);
    g.lineStyle(6, 0x3a2c25, 1);
    g.lineBetween(20, 38, 108, 34);
    for (const x of [56, 86]) {
      g.fillStyle(0x7fd6ff, 1);
      g.fillCircle(x, 34, 12);
      g.lineStyle(4, INK, 1);
      g.strokeCircle(x, 34, 12);
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(x - 4, 30, 3);
    }
  },
  crown: (g) => {
    g.fillStyle(0xffd23f, 1);
    g.fillRect(32, 10, 64, 16);
    for (const x of [32, 52, 72, 92]) g.fillTriangle(x - 2, 12, x + 10, 12, x + 4, -4);
    g.lineStyle(3, INK, 1);
    g.strokeRect(32, 10, 64, 16);
    g.fillStyle(0xe63946, 1);
    g.fillCircle(64, 18, 4);
  },
  beanie: (g) => {
    g.fillStyle(0x3a86ff, 1);
    g.beginPath();
    g.arc(64, 46, 44, Math.PI, 0);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(18, 38, 92, 14, 7);
    g.fillCircle(64, 4, 10);
    g.lineStyle(3, INK, 1);
    g.strokeRoundedRect(18, 38, 92, 14, 7);
  },
};

const CLOTH: Record<string, Draw> = {
  tee: (g) => {
    body(g, 0x5fa8ff, SKIN);
    g.fillStyle(0xffffff, 1);
    g.fillRect(38, 112, 52, 6);
  },
  armor: (g) => {
    body(g, 0xa47148, SKIN);
    g.lineStyle(3, 0x6b4426, 1);
    for (const y of [106, 118, 130]) g.lineBetween(40, y, 88, y);
    g.fillStyle(0xc0c7d1, 1);
    for (const x of [44, 84]) g.fillCircle(x, 100, 3);
  },
  robe: (g) => {
    g.fillStyle(INK, 1);
    g.fillEllipse(48, 142, 26, 10);
    g.fillEllipse(80, 142, 26, 10);
    g.fillStyle(0x7b4bc4, 1);
    g.fillTriangle(30, 144, 98, 144, 64, 92);
    g.fillRoundedRect(38, 92, 52, 30, 14);
    g.lineStyle(LINE, INK, 1);
    g.strokeTriangle(30, 144, 98, 144, 64, 92);
    g.fillStyle(0xffd23f, 1);
    g.fillTriangle(64, 108, 58, 124, 70, 124);
    g.fillTriangle(58, 114, 70, 114, 64, 130);
    hands(g);
  },
  ninja: (g) => {
    body(g, 0x2f3545, SKIN);
    g.fillStyle(0xe63946, 1);
    g.fillRect(36, 118, 56, 8);
    g.fillTriangle(40, 122, 30, 136, 44, 132);
  },
  dress: (g) => {
    g.fillStyle(INK, 1);
    g.fillEllipse(50, 142, 22, 10);
    g.fillEllipse(78, 142, 22, 10);
    g.fillStyle(0xff5d8f, 1);
    g.fillRoundedRect(42, 92, 44, 26, 12);
    g.fillTriangle(28, 138, 100, 138, 64, 104);
    g.lineStyle(4, INK, 1);
    g.strokeTriangle(28, 138, 100, 138, 64, 104);
    g.fillStyle(0xffffff, 1);
    for (const x of [40, 56, 72, 88]) g.fillCircle(x, 134, 3);
    hands(g);
  },
};

function hands(g: G): void {
  for (const x of [32, 96]) {
    g.fillStyle(SKIN, 1);
    g.fillCircle(x, 118, 10);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(x, 118, 10);
  }
}

const BACK: Record<string, Draw> = {
  backpack: (g) => {
    g.fillStyle(0x4f7942, 1);
    g.fillRoundedRect(14, 92, 30, 44, 10);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(14, 92, 30, 44, 10);
    g.fillStyle(0x3b5d31, 1);
    g.fillRoundedRect(18, 112, 22, 12, 4);
  },
  wings: (g) => {
    for (const [x, y, s] of [[22, 96, 1], [30, 84, 0.8]] as const) {
      g.fillStyle(0xbde0fe, 1);
      g.fillEllipse(x, y, 34 * s, 22 * s);
      g.fillEllipse(x - 8 * s, y + 10 * s, 26 * s, 16 * s);
      g.lineStyle(3, INK, 1);
      g.strokeEllipse(x, y, 34 * s, 22 * s);
    }
  },
  cape: (g) => {
    g.fillStyle(0xc1121f, 1);
    g.fillTriangle(40, 92, 10, 144, 60, 144);
    g.lineStyle(4, INK, 1);
    g.strokeTriangle(40, 92, 10, 144, 60, 144);
  },
};

/** "Set" outfits replace the clothes and the hair/hat in one go. */
function bearSuit(g: G): void {
  body(g, 0x9c6b43, 0x9c6b43);
  g.fillStyle(0xe8cba8, 1);
  g.fillEllipse(64, 120, 30, 30);
}

function bearHood(g: G): void {
  for (const x of [26, 102]) {
    g.fillStyle(0x9c6b43, 1);
    g.fillCircle(x, 22, 16);
    g.fillStyle(0xe8cba8, 1);
    g.fillCircle(x, 22, 8);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(x, 22, 16);
  }
  g.lineStyle(14, 0x9c6b43, 1);
  g.beginPath();
  g.arc(64, 60, 46, Math.PI * 0.75, Math.PI * 2.25);
  g.strokePath();
  g.lineStyle(4, INK, 1);
  g.beginPath();
  g.arc(64, 60, 53, Math.PI * 0.78, Math.PI * 2.22);
  g.strokePath();
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
const WEAPON_IDS: WeaponId[] = ['cannon', 'hammer', 'splitter', 'drill'];
export const ICON_IDS = ['double', 'power', 'warp', 'heal', 'armor', 'burrow', 'wall', 'calm'] as const;

/** Queue every generated sprite; call from a preload(). Missing files only log a warning. */
export function loadArt(scene: Phaser.Scene): void {
  const base = 'art/sprites/';
  for (const w of WEAPON_IDS) scene.load.image(`art-gun-${w}`, `${base}gun-${w}.png`);
  for (const i of ICON_IDS) scene.load.image(`art-icon-${i}`, `${base}icon-${i}.png`);
  for (const m of ['hills', 'islands', 'mine']) scene.load.image(`art-bg-${m}`, `${base}bg-${m}.jpg`);
  scene.load.image('art-dirt', `${base}dirt.png`);
  scene.load.image('art-grass', `${base}grass.png`);
}

export const hasArt = (scene: Phaser.Scene, key: string) => scene.textures.exists(key);

/** Texture, scale and grip pivot for a weapon. The generated guns are pistols held at the grip (bottom-left). */
export function gunLook(scene: Phaser.Scene, w: WeaponId): { key: string; scale: number; ox: number; oy: number } {
  const k = `art-gun-${w}`;
  return hasArt(scene, k) ? { key: k, scale: 0.34, ox: 0.18, oy: 0.68 } : { key: gunKey(w), scale: ART_SCALE, ox: GUN_ORIGIN_X, oy: 0.5 };
}

/** Generated icon for an item or skill, or null to show the label alone. */
export function iconTexture(scene: Phaser.Scene, i: string): string | null {
  const k = `art-icon-${i}`;
  return hasArt(scene, k) ? k : null;
}
