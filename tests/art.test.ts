import { describe, expect, it } from 'vitest';
import { hasDrawing } from '../src/art/drawnPieces';
import { BUNDLED } from '../src/core/config';

describe('drawn character', () => {
  it('draws every piece in the catalog', () => {
    for (const f of BUNDLED.fashion) if (f.id !== 'none') expect(hasDrawing(f.slot, f.id), `${f.slot}/${f.id}`).toBe(true);
  });
});
