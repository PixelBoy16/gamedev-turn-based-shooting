import type Phaser from 'phaser';
import type { FashionSlot } from '../core/gear';

// The drawn stand-in character, tough cartoon style: a squarish head about 2/5 of the
// height, broad shoulders, thick limbs, frowning brows and a smirk. Drawn on a 128x148
// canvas with the feet on the bottom edge, facing right (flipped for left). Phaser is
// only a type here, so tests can check that every catalog piece has a drawing.

type G = Phaser.GameObjects.Graphics;
export type Draw = (g: G) => void;

export const INK = 0x1b1512;
const LINE = 5;
export const SKIN = 0xe8b48e;
const PANTS = 0x2f3440;

// head box and face
const HX = 32;
const HY = 12;
const HW = 64;
const HH = 60;
const EYE_X = [56, 80];
const EYE_Y = 42;

/** The head: a rounded square. */
export function drawHead(g: G, skin = SKIN): void {
  g.fillStyle(skin, 1);
  g.fillRoundedRect(HX, HY, HW, HH, 22);
  g.lineStyle(LINE, INK, 1);
  g.strokeRoundedRect(HX, HY, HW, HH, 22);
  // ear on the far side
  g.fillStyle(skin, 1);
  g.fillCircle(HX + 2, EYE_Y + 6, 7);
  g.lineStyle(4, INK, 1);
  g.strokeCircle(HX + 2, EYE_Y + 6, 7);
}

/** The default attitude, drawn over the eyes: thick frowning brows and a smirk showing teeth. */
export function drawFace(g: G): void {
  g.lineStyle(6, INK, 1);
  g.lineBetween(45, EYE_Y - 12, 61, EYE_Y - 6);
  g.lineBetween(91, EYE_Y - 12, 75, EYE_Y - 6);
  g.fillStyle(0xffffff, 1);
  g.beginPath();
  g.moveTo(58, 57);
  g.lineTo(82, 54);
  g.lineTo(79, 62);
  g.lineTo(61, 63);
  g.closePath();
  g.fillPath();
  g.lineStyle(3, INK, 1);
  g.strokePath();
  g.lineBetween(66, 56, 67, 63);
  g.lineBetween(73, 55, 73, 62);
}

/** Torso, arms, fists, legs and boots. `sleeve` colours the arms (skin = bare arms). */
export function drawBody(g: G, torso: number, sleeve = SKIN, pants = PANTS): void {
  // legs and boots
  g.fillStyle(pants, 1);
  g.fillRect(42, 116, 19, 22);
  g.fillRect(67, 116, 19, 22);
  g.lineStyle(4, INK, 1);
  g.strokeRect(42, 116, 19, 22);
  g.strokeRect(67, 116, 19, 22);
  g.fillStyle(INK, 1);
  g.fillRoundedRect(36, 134, 30, 13, 5);
  g.fillRoundedRect(64, 134, 32, 13, 5);
  // arms behind the torso
  for (const [sx, fx] of [[34, 24], [94, 104]]) {
    g.lineStyle(18, INK, 1);
    g.lineBetween(sx, 80, fx, 108);
    g.lineStyle(10, sleeve, 1);
    g.lineBetween(sx, 80, fx, 108);
  }
  // torso: wide at the shoulders
  g.fillStyle(torso, 1);
  g.beginPath();
  g.moveTo(24, 76);
  g.lineTo(104, 76);
  g.lineTo(92, 122);
  g.lineTo(36, 122);
  g.closePath();
  g.fillPath();
  g.lineStyle(LINE, INK, 1);
  g.strokePath();
  fists(g, SKIN);
}

function fists(g: G, color: number): void {
  for (const x of [26, 102]) {
    g.fillStyle(color, 1);
    g.fillCircle(x, 112, 12);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(x, 112, 12);
    g.lineBetween(x - 6, 108, x - 6, 116);
  }
}

/** Top of the head, for hair and caps. */
function cap(g: G, color: number, depth = 22): void {
  g.fillStyle(color, 1);
  g.fillRoundedRect(HX - 2, HY - 2, HW + 4, depth, { tl: 22, tr: 22, bl: 4, br: 4 });
  g.lineStyle(4, INK, 1);
  g.strokeRoundedRect(HX - 2, HY - 2, HW + 4, depth, { tl: 22, tr: 22, bl: 4, br: 4 });
}

function rivets(g: G, pts: number[][]): void {
  g.fillStyle(0xd9dee6, 1);
  for (const [x, y] of pts) g.fillCircle(x, y, 2.5);
}

// ------------------------------------------------------------------ pieces

const EYES: Record<string, Draw> = {
  glare: (g) => {
    for (const x of EYE_X) {
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(x, EYE_Y, 14, 8);
      g.fillStyle(INK, 1);
      g.fillCircle(x + 2, EYE_Y + 1, 3.5);
      g.lineStyle(3, INK, 1);
      g.lineBetween(x - 8, EYE_Y - 3, x + 8, EYE_Y - 4);
    }
  },
  squint: (g) => {
    g.lineStyle(5, INK, 1);
    for (const x of EYE_X) g.lineBetween(x - 7, EYE_Y, x + 7, EYE_Y - 1);
  },
  sharp: (g) => {
    for (const x of EYE_X) {
      g.fillStyle(INK, 1);
      g.fillTriangle(x - 8, EYE_Y - 2, x + 8, EYE_Y - 5, x + 6, EYE_Y + 5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x + 2, EYE_Y - 2, 2);
    }
  },
  glow: (g) => {
    for (const x of EYE_X) {
      g.fillStyle(0x3df5ff, 0.35);
      g.fillEllipse(x, EYE_Y, 22, 14);
      g.fillStyle(0x3df5ff, 1);
      g.fillEllipse(x, EYE_Y, 13, 8);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(x + 1, EYE_Y, 6, 3);
    }
  },
};

const FACE: Record<string, Draw> = {
  warpaint: (g) => {
    g.fillStyle(0x2b3a1e, 0.9);
    for (const x of [44, 82]) {
      g.fillRect(x, 48, 12, 3);
      g.fillRect(x + 2, 53, 10, 3);
    }
  },
  scar: (g) => {
    g.lineStyle(3, 0xb0574a, 1);
    g.lineBetween(84, 46, 92, 58);
    g.lineBetween(92, 46, 84, 58);
    g.lineStyle(2, 0xb0574a, 1);
    g.lineBetween(85, 52, 91, 52);
  },
  beard: (g) => {
    g.fillStyle(0x3b2a20, 1);
    g.beginPath();
    g.moveTo(HX + 4, 52);
    g.lineTo(HX + 12, 70);
    g.lineTo(64, 78);
    g.lineTo(HX + HW - 4, 68);
    g.lineTo(HX + HW, 54);
    g.lineTo(84, 66);
    g.lineTo(58, 67);
    g.closePath();
    g.fillPath();
    g.lineStyle(3, INK, 1);
    g.strokePath();
  },
};

const HAIR_BACK: Record<string, Draw> = {
  ponytail: (g) => {
    g.fillStyle(0x23202b, 1);
    g.fillEllipse(20, 50, 22, 50);
    g.lineStyle(4, INK, 1);
    g.strokeEllipse(20, 50, 22, 50);
  },
};

const HAIR: Record<string, Draw> = {
  buzz: (g) => {
    cap(g, 0x4a3426, 18);
    g.fillStyle(0x2e2019, 1);
    for (let x = HX + 6; x < HX + HW; x += 8) g.fillCircle(x, HY + 6, 1.5);
  },
  spiky: (g) => {
    g.fillStyle(0xff6a2b, 1);
    for (const [x, y] of [[36, 2], [52, -4], [68, -6], [84, -2], [98, 8]]) g.fillTriangle(x - 12, 24, x + 12, 22, x, y + 6);
    cap(g, 0xff6a2b, 20);
  },
  ponytail: (g) => {
    cap(g, 0x23202b, 22);
    g.fillStyle(0xc62828, 1);
    g.fillRect(HX - 4, 26, 8, 10);
  },
  mohawk: (g) => {
    cap(g, 0x3a3a44, 12);
    g.fillStyle(0xd62f5a, 1);
    for (const [x, y] of [[46, 0], [58, -6], [70, -6], [82, 0]]) g.fillTriangle(x - 7, 16, x + 7, 16, x, y);
    g.lineStyle(3, INK, 1);
    g.lineBetween(40, 16, 88, 16);
  },
};

const GLASSES: Record<string, Draw> = {
  goggles: (g) => {
    g.lineStyle(5, 0x3a2c25, 1);
    g.lineBetween(HX, EYE_Y - 2, EYE_X[0] - 10, EYE_Y - 2);
    for (const x of EYE_X) {
      g.fillStyle(0xffb020, 0.75);
      g.fillCircle(x, EYE_Y, 10);
      g.lineStyle(5, 0x4a4f5c, 1);
      g.strokeCircle(x, EYE_Y, 10);
    }
    g.lineBetween(EYE_X[0] + 10, EYE_Y, EYE_X[1] - 10, EYE_Y);
  },
  shades: (g) => {
    g.fillStyle(INK, 1);
    g.beginPath();
    g.moveTo(HX + 6, EYE_Y - 7);
    g.lineTo(HX + HW + 2, EYE_Y - 9);
    g.lineTo(HX + HW - 4, EYE_Y + 6);
    g.lineTo(EYE_X[1] - 10, EYE_Y + 7);
    g.lineTo(68, EYE_Y + 1);
    g.lineTo(EYE_X[0] + 8, EYE_Y + 7);
    g.lineTo(HX + 12, EYE_Y + 6);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xffffff, 0.45);
    g.fillRect(EYE_X[1] - 6, EYE_Y - 5, 8, 2);
  },
};

const HAT: Record<string, Draw> = {
  aviator: (g) => {
    cap(g, 0x6b4426, 24);
    g.fillStyle(0x6b4426, 1);
    g.fillRoundedRect(HX - 4, 26, 14, 24, 6);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(HX - 4, 26, 14, 24, 6);
    g.lineStyle(5, 0x2a2420, 1);
    g.lineBetween(HX, 18, HX + HW, 16);
    for (const x of [58, 80]) {
      g.fillStyle(0x7fd6ff, 1);
      g.fillCircle(x, 16, 9);
      g.lineStyle(4, 0x4a4f5c, 1);
      g.strokeCircle(x, 16, 9);
    }
  },
  helm: (g) => {
    g.fillStyle(0x7d8794, 1);
    g.fillRoundedRect(HX - 6, HY - 6, HW + 12, 30, { tl: 26, tr: 26, bl: 0, br: 0 });
    g.lineStyle(LINE, INK, 1);
    g.strokeRoundedRect(HX - 6, HY - 6, HW + 12, 30, { tl: 26, tr: 26, bl: 0, br: 0 });
    g.fillStyle(0x5b6370, 1);
    g.fillRect(HX - 10, HY + 20, HW + 20, 7);
    g.lineStyle(3, INK, 1);
    g.strokeRect(HX - 10, HY + 20, HW + 20, 7);
    rivets(g, [[HX, HY + 23], [64, HY + 23], [HX + HW, HY + 23]]);
  },
  spikecrown: (g) => {
    g.fillStyle(0x3d4450, 1);
    for (const x of [38, 52, 66, 80, 92]) g.fillTriangle(x - 6, 14, x + 6, 14, x, -2);
    g.fillRect(HX - 2, 10, HW + 4, 12);
    g.lineStyle(3, INK, 1);
    g.strokeRect(HX - 2, 10, HW + 4, 12);
    g.fillStyle(0xd62828, 1);
    g.fillCircle(64, 16, 4);
    rivets(g, [[HX + 6, 16], [HX + HW - 6, 16]]);
  },
  bandana: (g) => {
    g.fillStyle(0xc62828, 1);
    g.fillRect(HX - 2, 20, HW + 4, 11);
    g.fillTriangle(HX - 2, 22, HX - 20, 16, HX - 14, 32);
    g.fillTriangle(HX - 2, 26, HX - 18, 38, HX - 6, 36);
    g.lineStyle(3, INK, 1);
    g.strokeRect(HX - 2, 20, HW + 4, 11);
  },
};

const CLOTH: Record<string, Draw> = {
  tank: (g) => {
    drawBody(g, 0x5b6b3a);
    g.lineStyle(3, 0x3f4a28, 1);
    g.lineBetween(46, 78, 50, 92);
    g.lineBetween(82, 78, 78, 92);
  },
  armor: (g) => {
    drawBody(g, 0x8a96a6, 0x5b6370);
    g.lineStyle(3, 0x4a525e, 1);
    for (const y of [92, 106]) g.lineBetween(32, y, 96, y);
    rivets(g, [[36, 84], [92, 84], [40, 99], [88, 99], [44, 113], [84, 113]]);
  },
  trench: (g) => {
    drawBody(g, 0x6b4a2e, 0x6b4a2e);
    g.fillStyle(0x6b4a2e, 1);
    g.fillRect(36, 118, 56, 18);
    g.lineStyle(4, INK, 1);
    g.strokeRect(36, 118, 56, 18);
    g.fillStyle(0x2a1e14, 1);
    g.fillRect(34, 104, 60, 7);
    g.fillStyle(0xc9a227, 1);
    g.fillRect(60, 103, 9, 9);
    g.lineStyle(3, INK, 1);
    g.lineBetween(64, 78, 64, 136);
  },
  ninja: (g) => {
    drawBody(g, 0x23262f, 0x23262f, 0x23262f);
    g.fillStyle(0xc62828, 1);
    g.fillRect(34, 104, 60, 8);
    g.fillTriangle(38, 108, 26, 124, 42, 120);
  },
  vest: (g) => {
    drawBody(g, 0x5b6b3a, 0x5b6b3a);
    g.fillStyle(0x3a3f4a, 1);
    g.fillRect(36, 80, 56, 38);
    g.lineStyle(4, INK, 1);
    g.strokeRect(36, 80, 56, 38);
    g.fillStyle(0x2b2f38, 1);
    for (const x of [40, 56, 72]) g.fillRect(x, 100, 13, 12);
    g.lineStyle(2, INK, 1);
    for (const x of [40, 56, 72]) g.strokeRect(x, 100, 13, 12);
  },
};

const BACK: Record<string, Draw> = {
  ammo: (g) => {
    g.fillStyle(0x4a5a32, 1);
    g.fillRoundedRect(4, 74, 30, 46, 6);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(4, 74, 30, 46, 6);
    g.fillStyle(0xd4a017, 1);
    for (const y of [82, 92, 102]) g.fillRoundedRect(8, y, 6, 8, 2);
  },
  ironwings: (g) => {
    for (const [i, len] of [[0, 52], [1, 44], [2, 34]]) {
      const y = 70 + i * 13;
      g.fillStyle(i === 1 ? 0x9aa4b2 : 0x7d8794, 1);
      g.beginPath();
      g.moveTo(34, y);
      g.lineTo(34 - len, y - 16 + i * 4);
      g.lineTo(34 - len + 10, y + 8);
      g.lineTo(34, y + 12);
      g.closePath();
      g.fillPath();
      g.lineStyle(3, INK, 1);
      g.strokePath();
    }
    rivets(g, [[26, 76], [24, 89], [26, 102]]);
  },
  cape: (g) => {
    g.fillStyle(0x8e1b1b, 1);
    g.beginPath();
    g.moveTo(40, 76);
    g.lineTo(8, 146);
    g.lineTo(18, 136);
    g.lineTo(26, 146);
    g.lineTo(36, 134);
    g.lineTo(46, 146);
    g.lineTo(56, 130);
    g.closePath();
    g.fillPath();
    g.lineStyle(4, INK, 1);
    g.strokePath();
  },
};

/** A set replaces the outfit, hair and hat: the suit goes on the body, the hood over the head. */
export const SETS: Record<string, { suit: Draw; hood: Draw }> = {
  bearskull: {
    suit: (g) => {
      drawBody(g, 0x5a3e2b, 0x5a3e2b, 0x4a3324);
      g.fillStyle(0xe8dcc0, 1);
      for (const y of [86, 96, 106]) g.fillRoundedRect(48, y, 32, 6, 3);
      g.lineStyle(2, INK, 1);
      for (const y of [86, 96, 106]) g.strokeRoundedRect(48, y, 32, 6, 3);
    },
    hood: (g) => {
      // fur hood round the face
      g.lineStyle(12, 0x5a3e2b, 1);
      g.strokeRoundedRect(HX - 4, HY - 4, HW + 8, HH + 6, 26);
      g.lineStyle(4, INK, 1);
      g.strokeRoundedRect(HX - 10, HY - 10, HW + 20, HH + 18, 30);
      for (const x of [HX, HX + HW]) {
        g.fillStyle(0x5a3e2b, 1);
        g.fillCircle(x, HY - 4, 11);
        g.lineStyle(4, INK, 1);
        g.strokeCircle(x, HY - 4, 11);
      }
      // bone skull mask over the brow, with fangs
      g.fillStyle(0xe8dcc0, 1);
      g.fillRoundedRect(HX + 4, HY - 6, HW - 8, 18, 8);
      g.lineStyle(3, INK, 1);
      g.strokeRoundedRect(HX + 4, HY - 6, HW - 8, 18, 8);
      g.fillStyle(INK, 1);
      g.fillCircle(54, HY + 2, 4);
      g.fillCircle(76, HY + 2, 4);
      g.fillStyle(0xe8dcc0, 1);
      for (const x of [48, 60, 70, 82]) g.fillTriangle(x - 4, HY + 12, x + 4, HY + 12, x, HY + 20);
    },
  },
};

/** Drawers per slot and piece id (sets draw the suit; the hood comes from SETS). */
export const DRAWERS: Record<FashionSlot, Record<string, Draw>> = {
  hat: HAT,
  glasses: GLASSES,
  hair: HAIR,
  face: FACE,
  cloth: CLOTH,
  eyes: EYES,
  set: Object.fromEntries(Object.entries(SETS).map(([id, s]) => [id, s.suit])),
  back: BACK,
};

export { HAIR_BACK };

export const hasDrawing = (slot: FashionSlot, id: string): boolean => !!DRAWERS[slot]?.[id];
