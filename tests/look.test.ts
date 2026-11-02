import { describe, expect, it } from 'vitest';
import { allLookFiles, fileOwner, lookLayers } from '../src/art/lookNames';
import { DEFAULT_LOADOUT, Loadout } from '../src/core/gear';

const dress = (look: Partial<Loadout['look']>, hide = { hat: false, glasses: false }): Loadout =>
  ({ ...DEFAULT_LOADOUT, look: { ...DEFAULT_LOADOUT.look, ...look }, hide });

describe('painted look layers', () => {
  it('needs the 32 images listed in the GDD', () => {
    const files = allLookFiles();
    expect(files).toHaveLength(32);
    expect(new Set(files).size).toBe(32);
    expect(files).toContain('hair-ponytail-back');
    expect(files).toContain('set-bear-hood');
  });

  it('stacks a look back to front like the drawn chibi', () => {
    expect(lookLayers(dress({ hat: 'crown', glasses: 'round', back: 'wings', face: 'blush' }))).toEqual([
      'back-wings', 'hair-short-back', 'body', 'cloth-tee', 'eyes-round', 'face-blush', 'hair-short-front', 'glasses-round', 'hat-crown',
    ]);
  });

  it('lets a set replace outfit, hair and hat, and respects the hide toggles', () => {
    expect(lookLayers(dress({ set: 'bear', hat: 'crown' }))).toEqual(['body', 'set-bear-body', 'eyes-round', 'set-bear-hood']);
    expect(lookLayers(dress({ hat: 'crown', glasses: 'shades' }, { hat: true, glasses: true }))).not.toContain('hat-crown');
  });

  it('maps a file back to its piece', () => {
    expect(fileOwner('hair-bob-front')).toEqual({ slot: 'hair', id: 'bob' });
    expect(fileOwner('body')).toBeNull();
  });
});
