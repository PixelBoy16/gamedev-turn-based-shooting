import { FASHION, FashionSlot, Loadout } from '../core/gear';

// File names of the painted dress-up layers in src/art/look/, as listed in the GDD:
// the base body, then <slot>-<id>.png per fashion piece. Hair and the bear set come in two
// parts, one drawn behind the body and one in front. The body is either one body.png or
// cut into BODY_PARTS (they win when both exist), so the lab can move and turn each part.
// Left and right are as seen on screen.

export const BODY = 'body';
/** The base body cut up, back to front. The weapon is held by the right hand. */
export const BODY_PARTS = [
  'body-legs', 'body-foot-left', 'body-foot-right', 'body-upperarm-left', 'body-upperarm-right',
  'body-forearm-left', 'body-forearm-right', 'body-torso', 'body-neck', 'body-hand-left', 'body-hand-right', 'body-head',
];
export const HAND_PART = 'body-hand-right';
export const HEAD_PART = 'body-head';
/** align.json key for where the head sits inside a set's suit (it can need to sit higher than on the bare body). */
export const headInSet = (set: string) => `${HEAD_PART}@set-${set}`;
const TORSO = 'body-torso';

/** What each body part hangs from: moving or turning a part takes the parts below it along. */
const BODY_PARENT: Record<string, string> = {
  'body-foot-left': 'body-legs',
  'body-foot-right': 'body-legs',
  'body-upperarm-left': TORSO,
  'body-upperarm-right': TORSO,
  'body-forearm-left': 'body-upperarm-left',
  'body-forearm-right': 'body-upperarm-right',
  'body-hand-left': 'body-forearm-left',
  'body-hand-right': 'body-forearm-right',
  'body-neck': TORSO,
  'body-head': 'body-neck',
};

/** Where each body part turns and scales, in source px: shoulder, elbow, wrist, hip, ankle, neck, chin. */
export const JOINTS: Record<string, { x: number; y: number }> = {
  'body-legs': { x: 512, y: 689 },
  'body-foot-left': { x: 417, y: 845 },
  'body-foot-right': { x: 607, y: 845 },
  'body-torso': { x: 512, y: 573 },
  'body-upperarm-left': { x: 380, y: 502 },
  'body-upperarm-right': { x: 644, y: 502 },
  'body-forearm-left': { x: 326, y: 614 },
  'body-forearm-right': { x: 698, y: 614 },
  'body-hand-left': { x: 297, y: 667 },
  'body-hand-right': { x: 727, y: 667 },
  'body-neck': { x: 512, y: 492 },
  'body-head': { x: 512, y: 468 },
};

/** Short names for the lab. */
export const PART_NAME: Record<string, string> = {
  'body-legs': 'สะโพกและขา',
  'body-foot-left': 'เท้าซ้าย',
  'body-foot-right': 'เท้าขวา',
  'body-upperarm-left': 'ต้นแขนซ้าย',
  'body-upperarm-right': 'ต้นแขนขวา',
  'body-forearm-left': 'แขนท่อนล่างซ้าย',
  'body-forearm-right': 'แขนท่อนล่างขวา',
  'body-torso': 'ลำตัว',
  'body-neck': 'คอ',
  'body-hand-left': 'มือซ้าย',
  'body-hand-right': 'มือขวา (ถือปืน)',
  'body-head': 'หัว',
};

/** The image files that make up one fashion piece, back to front. Empty for "none". */
export function pieceFiles(slot: FashionSlot, id: string): string[] {
  if (id === 'none') return [];
  if (slot === 'hair') return [`hair-${id}-back`, `hair-${id}-front`];
  if (slot === 'set') return [`set-${id}-body`, `set-${id}-hood`];
  return [`${slot}-${id}`];
}

/** Every file the full wardrobe can use: the body (whole and in parts), then the pieces in wardrobe order. */
export function allLookFiles(): string[] {
  return [BODY, ...BODY_PARTS, ...FASHION.flatMap((f) => pieceFiles(f.slot, f.id))];
}

/** Which slot and piece a file belongs to, or null for the body or an unknown name. */
export function fileOwner(name: string): { slot: FashionSlot; id: string } | null {
  for (const f of FASHION) if (pieceFiles(f.slot, f.id).includes(name)) return { slot: f.slot, id: f.id };
  return null;
}

/**
 * The layers of a look, back to front. Same order as the drawn chibi (drawLook):
 * back item, hair behind the head, body, outfit, eyes, face, hair, glasses, hat.
 * A set replaces the outfit and the hair, and hides the hat; under it only the head shows.
 * Both body forms are listed; the painter leaves out whichever has no files.
 */
export function lookLayers(l: Loadout): string[] {
  const v = l.look;
  const set = v.set !== 'none' ? pieceFiles('set', v.set) : null;
  const hair = pieceFiles('hair', v.hair);
  return [
    ...pieceFiles('back', v.back),
    ...(set ? [] : hair.slice(0, 1)),
    ...(set ? [BODY, HEAD_PART] : [BODY, ...BODY_PARTS]),
    ...(set ? set.slice(0, 1) : pieceFiles('cloth', v.cloth)),
    ...pieceFiles('eyes', v.eyes),
    ...pieceFiles('face', v.face),
    ...(set ? set.slice(1) : hair.slice(1)),
    ...(l.hide.glasses ? [] : pieceFiles('glasses', v.glasses)),
    ...(set || l.hide.hat ? [] : pieceFiles('hat', v.hat)),
  ];
}

/**
 * The layer a layer moves with, or null: body parts hang from each other, things worn on
 * the head (hair, eyes, face, glasses, hat, a set's hood) follow the head, an outfit and a
 * back item follow the torso. A set's suit stands on its own.
 */
export function parentOf(name: string): string | null {
  if (name in BODY_PARENT) return BODY_PARENT[name];
  const owner = fileOwner(name);
  if (!owner) return null;
  if (owner.slot === 'cloth' || owner.slot === 'back') return TORSO;
  if (owner.slot === 'set') return name.endsWith('-hood') ? HEAD_PART : null;
  return HEAD_PART;
}
