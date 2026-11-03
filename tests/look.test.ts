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
    expect(files).toContain('set-bearskull-hood');
  });

  it('stacks a look back to front like the drawn chibi', () => {
    expect(lookLayers(dress({ hat: 'spikecrown', glasses: 'goggles', back: 'ironwings', face: 'warpaint' }))).toEqual([
      'back-ironwings', 'hair-buzz-back', 'body', 'cloth-tank', 'eyes-glare', 'face-warpaint', 'hair-buzz-front', 'glasses-goggles', 'hat-spikecrown',
    ]);
  });

  it('lets a set replace outfit, hair and hat, and respects the hide toggles', () => {
    expect(lookLayers(dress({ set: 'bearskull', hat: 'spikecrown' }))).toEqual(['body', 'set-bearskull-body', 'eyes-glare', 'set-bearskull-hood']);
    expect(lookLayers(dress({ hat: 'spikecrown', glasses: 'shades' }, { hat: true, glasses: true }))).not.toContain('hat-spikecrown');
  });

  it('maps a file back to its piece', () => {
    expect(fileOwner('hair-mohawk-front')).toEqual({ slot: 'hair', id: 'mohawk' });
    expect(fileOwner('body')).toBeNull();
  });
});
