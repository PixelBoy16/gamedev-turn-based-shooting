import { Rng, randRange } from './rng';
import { Terrain } from './Terrain';

export type MapId = 'hills' | 'islands' | 'mine';

export const MAPS: Record<MapId, { name: string; desc: string }> = {
  hills: { name: 'เนินหญ้า', desc: 'เนินกลางเตี้ย ดินหนา ฝึกเล็งสู้ลม' },
  islands: { name: 'เกาะลอย', desc: 'เกาะลอยฟ้า ยิงให้ตกได้' },
  mine: { name: 'เหมืองถ้ำ', desc: 'เพดานต่ำ ต้องยิงมุมต่ำ' },
};

export const MAP_IDS = Object.keys(MAPS) as MapId[];
export const MAP_W = 2560;
export const MAP_H = 1080;

/**
 * Spawn x for a team slot. Teams start on opposite sides, 1200–1800 px apart
 * (closer in the mine, where the low ceiling caps how far a shell can fly).
 */
export function spawnX(map: MapId, team: number, slot: number, width = MAP_W): number {
  const x = (map === 'mine' ? [640, 860] : [460, 680])[slot % 2];
  return team === 0 ? x : width - x;
}

export function generateMap(id: MapId, rng: Rng, width = MAP_W, height = MAP_H): Terrain {
  const t = new Terrain(width, height);
  if (id === 'hills') hills(t, rng);
  else if (id === 'islands') islands(t, rng);
  else mine(t, rng);
  t.changes.length = 0; // generation is painted in one go, not replayed as edits
  return t;
}

function waves(rng: Rng, n: number, ampMin: number, ampMax: number) {
  const ws = Array.from({ length: n }, () => ({
    amp: randRange(rng, ampMin, ampMax),
    freq: randRange(rng, 0.0015, 0.006),
    phase: randRange(rng, 0, Math.PI * 2),
  }));
  return (x: number) => ws.reduce((h, w) => h + Math.sin(x * w.freq + w.phase) * w.amp, 0);
}

/** Rolling hills with a low ridge in the middle so shots must arc. */
function hills(t: Terrain, rng: Rng): void {
  const wave = waves(rng, 3, 15, 40);
  const ridge = randRange(rng, 110, 170);
  for (let x = 0; x < t.width; x++) {
    const d = (x - t.width / 2) / (t.width * 0.12);
    const top = t.height * 0.64 + wave(x) - ridge * Math.exp(-d * d);
    t.fillColumn(x, Math.max(60, top), t.height);
  }
}

/** Two big floating islands and a small high one between them. Below is the void. */
function islands(t: Terrain, rng: Rng): void {
  const wave = waves(rng, 2, 6, 16);
  const defs = [
    { cx: 575, half: 440, top: 600, thick: 280 },
    { cx: t.width - 575, half: 440, top: 600, thick: 280 },
    { cx: t.width / 2, half: 160, top: 430, thick: 120 },
  ];
  for (const d of defs) {
    for (let x = Math.ceil(d.cx - d.half); x < d.cx + d.half; x++) {
      const k = (x - d.cx) / d.half;
      const edge = Math.sqrt(1 - k * k);
      const top = d.top + wave(x) + (1 - edge) * 50; // shoulders droop toward the cliff
      const bottom = d.top + d.thick * edge;
      if (bottom > top + 4) t.fillColumn(x, top, bottom);
    }
  }
}

/** A cave: low ceiling, a stalactite in the middle, and a few old tunnels. */
function mine(t: Terrain, rng: Rng): void {
  const floor = waves(rng, 2, 10, 30);
  const ceil = waves(rng, 3, 8, 28);
  const floorBase = t.height * 0.7;
  for (let x = 0; x < t.width; x++) {
    const d = (x - t.width / 2) / 90;
    const stalactite = 200 * Math.exp(-d * d);
    t.fillColumn(x, 0, 190 + ceil(x) + stalactite);
    t.fillColumn(x, floorBase + floor(x), t.height);
  }
  // Old tunnels under each side: places to hide or to drop into.
  for (const cx of [1060, t.width - 1060]) {
    const y = floorBase + 120;
    for (let i = 0; i < 6; i++) t.carve(cx + (i - 2.5) * 22, y + Math.sin(i) * 8, 26);
  }
}
