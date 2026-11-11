import { describe, expect, it } from 'vitest';
import { BODY_PARTS, JOINTS, allLookFiles, fileOwner, headInSet, lookLayers, parentOf } from '../src/art/lookNames';
import { DEFAULT_LOADOUT, Loadout } from '../src/core/gear';

const dress = (look: Partial<Loadout['look']>, hide = { hat: false, glasses: false }): Loadout =>
  ({ ...DEFAULT_LOADOUT, look: { ...DEFAULT_LOADOUT.look, ...look }, hide });

describe('painted look layers', () => {
  it('lists the whole body, its 12 parts and the 31 piece images', () => {
    const files = allLookFiles();
    expect(files).toHaveLength(44);
    expect(new Set(files).size).toBe(44);
    expect(files).toContain('body-hand-right');
    expect(files).toContain('hair-ponytail-back');
    expect(files).toContain('set-bearskull-hood');
  });

  it('stacks a look back to front like the drawn chibi', () => {
    expect(lookLayers(dress({ hat: 'spikecrown', glasses: 'goggles', back: 'ironwings', face: 'warpaint' }))).toEqual([
      'back-ironwings', 'hair-buzz-back', 'body', ...BODY_PARTS, 'cloth-tank', 'eyes-glare', 'face-warpaint', 'hair-buzz-front', 'glasses-goggles', 'hat-spikecrown',
    ]);
  });

  it('lets a set replace outfit, hair and hat, and respects the hide toggles', () => {
    expect(lookLayers(dress({ set: 'bearskull', hat: 'spikecrown' }))).toEqual(['body', 'body-head', 'set-bearskull-body', 'eyes-glare', 'set-bearskull-hood']);
    expect(lookLayers(dress({ hat: 'spikecrown', glasses: 'shades' }, { hat: true, glasses: true }))).not.toContain('hat-spikecrown');
  });

  it('maps a file back to its piece', () => {
    expect(fileOwner('hair-mohawk-front')).toEqual({ slot: 'hair', id: 'mohawk' });
    expect(fileOwner('body')).toBeNull();
  });

  it('hangs every body part on one above it, and turns each about a joint', () => {
    for (const part of BODY_PARTS) {
      expect(JOINTS[part]).toBeDefined();
      const chain = [part];
      for (let p = parentOf(part); p; p = parentOf(p)) chain.push(p);
      expect(chain.at(-1)).toMatch(/^body-(torso|legs)$/);
      expect(chain.every((n) => BODY_PARTS.includes(n))).toBe(true);
    }
    expect(parentOf('body-hand-right')).toBe('body-forearm-right');
    expect(parentOf('body-forearm-right')).toBe('body-upperarm-right');
  });

  it('makes worn pieces follow the head or the torso', () => {
    expect(parentOf('hat-aviator')).toBe('body-head');
    expect(parentOf('eyes-glow')).toBe('body-head');
    expect(parentOf('hair-ponytail-back')).toBe('body-head');
    expect(parentOf('set-bearskull-hood')).toBe('body-head');
    expect(parentOf('cloth-vest')).toBe('body-torso');
    expect(parentOf('back-cape')).toBe('body-torso');
    expect(parentOf('set-bearskull-body')).toBeNull();
    expect(parentOf('body')).toBeNull();
    expect(headInSet('bearskull')).toBe('body-head@set-bearskull');
  });
});
