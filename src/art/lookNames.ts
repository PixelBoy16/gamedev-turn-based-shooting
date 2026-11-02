import { FASHION, FashionSlot, Loadout } from '../core/gear';

// File names of the painted dress-up layers in src/art/look/, as listed in the GDD:
// body.png, then <slot>-<id>.png per fashion piece. Hair and the bear set come in two
// parts, one drawn behind the body and one in front.

export const BODY = 'body';

/** The image files that make up one fashion piece, back to front. Empty for "none". */
export function pieceFiles(slot: FashionSlot, id: string): string[] {
  if (id === 'none') return [];
  if (slot === 'hair') return [`hair-${id}-back`, `hair-${id}-front`];
  if (slot === 'set') return [`set-${id}-body`, `set-${id}-hood`];
  return [`${slot}-${id}`];
}

/** Every file the full wardrobe needs: the body first, then the pieces in wardrobe order. */
export function allLookFiles(): string[] {
  return [BODY, ...FASHION.flatMap((f) => pieceFiles(f.slot, f.id))];
}

/** Which slot and piece a file belongs to, or null for the body or an unknown name. */
export function fileOwner(name: string): { slot: FashionSlot; id: string } | null {
  for (const f of FASHION) if (pieceFiles(f.slot, f.id).includes(name)) return { slot: f.slot, id: f.id };
  return null;
}

/**
 * The layers of a look, back to front. Same order as the drawn chibi (drawLook):
 * back item, hair behind the head, body, outfit, eyes, face, hair, glasses, hat.
 * A set replaces the outfit and the hair, and hides the hat.
 */
export function lookLayers(l: Loadout): string[] {
  const v = l.look;
  const set = v.set !== 'none' ? pieceFiles('set', v.set) : null;
  const hair = pieceFiles('hair', v.hair);
  return [
    ...pieceFiles('back', v.back),
    ...(set ? [] : hair.slice(0, 1)),
    BODY,
    ...(set ? set.slice(0, 1) : pieceFiles('cloth', v.cloth)),
    ...pieceFiles('eyes', v.eyes),
    ...pieceFiles('face', v.face),
    ...(set ? set.slice(1) : hair.slice(1)),
    ...(l.hide.glasses ? [] : pieceFiles('glasses', v.glasses)),
    ...(set || l.hide.hat ? [] : pieceFiles('hat', v.hat)),
  ];
}
