import { describe, expect, it } from 'vitest';
import { platePoints } from '../src/ui/theme';

describe('steel plates', () => {
  it('cuts the corners of a plate', () => {
    const p = platePoints(200, 100, 16);
    expect(p).toHaveLength(8);
    expect(p[0]).toEqual({ x: -84, y: -50 });
    for (const q of p) {
      expect(Math.abs(q.x)).toBeLessThanOrEqual(100);
      expect(Math.abs(q.y)).toBeLessThanOrEqual(50);
    }
  });

  it('never cuts more than a third of the short side', () => {
    expect(platePoints(60, 30, 40)[0]).toEqual({ x: -20, y: -15 });
  });
});
