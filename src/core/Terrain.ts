// Destructible ground stored as a 1-byte-per-pixel mask (1 = dirt, 0 = air).
// All collision reads this mask; the renderer mirrors it on a canvas by draining `changes`.

export type TerrainChange =
  | { kind: 'carve'; x: number; y: number; r: number }
  | { kind: 'fill'; x: number; y: number; w: number; h: number }
  | { kind: 'mound'; x: number; y: number; r: number };

export class Terrain {
  readonly mask: Uint8Array;
  /** Edits since the renderer last looked. The renderer clears this. */
  readonly changes: TerrainChange[] = [];

  constructor(readonly width: number, readonly height: number) {
    this.mask = new Uint8Array(width * height);
  }

  /** A flat floor at `groundY`, handy for tests. */
  static flat(width: number, height: number, groundY: number): Terrain {
    const t = new Terrain(width, height);
    for (let y = groundY; y < height; y++) t.mask.fill(1, y * width, (y + 1) * width);
    return t;
  }

  isSolid(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return false;
    return this.mask[iy * this.width + ix] === 1;
  }

  /** First solid pixel at or below `fromY` in column x, or null if the column is open to the bottom. */
  surfaceY(x: number, fromY = 0): number | null {
    for (let y = Math.max(0, Math.floor(fromY)); y < this.height; y++) {
      if (this.isSolid(x, y)) return y;
    }
    return null;
  }

  /** Ground a character could stand on: skips a cave ceiling, then finds the floor. */
  standY(x: number): number | null {
    let y = 0;
    while (y < this.height && this.isSolid(x, y)) y++;
    return this.surfaceY(x, y);
  }

  /** Fill one column of dirt from y0 (inclusive) to y1 (exclusive). Used by generators. */
  fillColumn(x: number, y0: number, y1: number): void {
    const ix = Math.floor(x);
    if (ix < 0 || ix >= this.width) return;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.height, Math.ceil(y1)); y++) this.mask[y * this.width + ix] = 1;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    for (let ix = Math.floor(x); ix < x + w; ix++) this.fillColumn(ix, y, y + h);
    this.changes.push({ kind: 'fill', x, y, w, h });
  }

  /** Pile a disc of dirt (the dirt bomb). */
  fillCircle(cx: number, cy: number, r: number): void {
    this.paintCircle(cx, cy, r, 1);
    this.changes.push({ kind: 'mound', x: cx, y: cy, r });
  }

  /** Clear a circle of dirt. */
  carve(cx: number, cy: number, r: number): void {
    this.paintCircle(cx, cy, r, 0);
    this.changes.push({ kind: 'carve', x: cx, y: cy, r });
  }

  private paintCircle(cx: number, cy: number, r: number, v: 0 | 1): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) this.mask[y * this.width + x] = v;
      }
    }
  }
}

/** FNV-1a over the mask: a cheap "are our maps the same?" check between client and server. */
export function terrainHash(t: Terrain): number {
  let h = 0x811c9dc5;
  const m = t.mask;
  for (let i = 0; i < m.length; i++) h = Math.imul(h ^ m[i], 0x01000193);
  return h >>> 0;
}

/** Run-length encode the mask as alternating air/dirt run lengths, starting with air. */
export function encodeMask(t: Terrain): number[] {
  const runs: number[] = [];
  const m = t.mask;
  let cur = 0;
  let n = 0;
  for (let i = 0; i < m.length; i++) {
    if (m[i] === cur) n++;
    else {
      runs.push(n);
      cur = m[i];
      n = 1;
    }
  }
  runs.push(n);
  return runs;
}

export function decodeMask(t: Terrain, runs: number[]): void {
  let i = 0;
  runs.forEach((n, k) => {
    t.mask.fill(k % 2, i, i + n);
    i += n;
  });
}
