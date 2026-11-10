import { FASHION, FashionSlot, Loadout } from '../core/gear';

// File names of the painted dress-up layers in src/art/look/, as listed in the GDD:
// the base body, then <slot>-<id>.png per fashion piece. Hair and the bear set come in two
// parts, one drawn behind the body and one in front. The body is either one body.png or
// cut into BODY_PARTS (they win when both exist), so the lab can fix its proportions.

export const BODY = 'body';
/** The base body cut up, back to front. The weapon is held by the right arm (as seen). */
export const BODY_PARTS = ['body-legs', 'body-torso', 'body-arm-left', 'body-arm-right', 'body-head'];
export const HAND_PART = 'body-arm-right';
export const HEAD_PART = 'body-head';

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
