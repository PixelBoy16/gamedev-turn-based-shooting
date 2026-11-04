import { WeaponDef } from './data';
import { TUNING, Tank, World, muzzle } from './World';

// A volley is everything one trigger pull puts in the air: one shell, or three
// after a split rocket bursts. Stepping never edits the terrain; it reports
// events (impacts, drill carves) and the caller applies them. That keeps the
// same function usable for the bot's dry-run simulation.

export interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  frames: number;
  drilled: number; // px bored through dirt so far
  sinceCarve: number;
  split: boolean; // already burst (or is a fragment)
  bounces: number; // ground hops left (the bouncer)
  frag: boolean; // a mortar bomblet: its own, smaller blast and no further bomblets
  done: boolean;
}

export interface Volley {
  shooter: Tank;
  weapon: WeaponDef;
  shells: Shell[];
  windMul: number; // 0 when the shooter used the "calm" skill
  splitCount: number;
  clusterCount: number;
}

export type VolleyEvent =
  | { kind: 'impact'; shell: Shell; x: number; y: number; hitTank: Tank | null }
  | { kind: 'out'; shell: Shell }
  | { kind: 'split'; x: number; y: number }
  | { kind: 'bounce'; x: number; y: number }
  | { kind: 'carve'; x: number; y: number; r: number };

export function fireVolley(shooter: Tank, weapon: WeaponDef, power: number, noWind = false, splitCount?: number): Volley {
  const m = muzzle(shooter);
  const speed = Math.max(0, Math.min(100, power)) * TUNING.launchSpeedPerPower * (weapon.speedMul ?? 1);
  const rad = (shooter.angle * Math.PI) / 180;
  const shell: Shell = {
    x: m.x, y: m.y,
    vx: Math.cos(rad) * speed * shooter.facing, vy: -Math.sin(rad) * speed,
    frames: 0, drilled: 0, sinceCarve: 0, split: false, bounces: weapon.bounce?.count ?? 0, frag: false, done: false,
  };
  return {
    shooter, weapon, shells: [shell], windMul: noWind ? 0 : 1,
    splitCount: splitCount ?? weapon.split?.count ?? 0, clusterCount: weapon.cluster?.count ?? 0,
  };
}

export function volleyDone(v: Volley): boolean {
  return v.shells.every((s) => s.done);
}

/** Advance every live shell by one fixed step. */
export function stepVolley(world: World, v: Volley): VolleyEvent[] {
  const events: VolleyEvent[] = [];
  for (const s of [...v.shells]) if (!s.done) stepShell(world, v, s, events);
  return events;
}

function stepShell(world: World, v: Volley, s: Shell, out: VolleyEvent[]): void {
  const { dt, gravity, windAccel, maxProjectileSpeed, subStepPx, tankRadius } = TUNING;
  const w = v.weapon;
  const { terrain } = world;
  const boring = !!w.drill && s.drilled > 0 && terrain.isSolid(s.x, s.y);
  const wasRising = s.vy < 0;
  if (!boring) {
    // A drill inside dirt keeps its heading; everything else follows gravity + wind.
    s.vx += world.wind * windAccel * w.windMul * v.windMul * dt;
    s.vy += gravity * w.gravityMul * dt;
  }
  const speed = Math.hypot(s.vx, s.vy);
  if (speed > maxProjectileSpeed) {
    s.vx *= maxProjectileSpeed / speed;
    s.vy *= maxProjectileSpeed / speed;
  }

  const dx = s.vx * dt;
  const dy = s.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / subStepPx));
  const stepLen = Math.hypot(dx, dy) / steps;
  for (let i = 0; i < steps; i++) {
    const px = s.x;
    const py = s.y;
    s.x += dx / steps;
    s.y += dy / steps;
    for (const t of world.tanks) {
      if (!t.alive || t.burrowed || (t === v.shooter && s.frames < 8)) continue;
      if (Math.hypot(s.x - t.x, s.y - (t.y - TUNING.tankCentreOffset)) <= tankRadius) {
        s.done = true;
        out.push({ kind: 'impact', shell: s, x: s.x, y: s.y, hitTank: t });
        burst(v, s, px, py);
        return;
      }
    }
    if (terrain.isSolid(s.x, s.y)) {
      if (w.drill && s.drilled < w.drill.length) {
        s.drilled += stepLen;
        s.sinceCarve += stepLen;
        if (s.sinceCarve >= 6) {
          s.sinceCarve = 0;
          out.push({ kind: 'carve', x: s.x, y: s.y, r: w.drill.carveRadius });
        }
        continue;
      }
      if (s.bounces > 0 && bounce(world, s, px, py, w.bounce!.keep)) {
        out.push({ kind: 'bounce', x: s.x, y: s.y });
        break; // the rest of this step's travel went the old way
      }
      s.done = true;
      out.push({ kind: 'impact', shell: s, x: s.x, y: s.y, hitTank: null });
      burst(v, s, px, py);
      return;
    }
  }
  s.frames++;

  // A shell that never falls (the beam) is gone once it leaves the top of the map.
  const lost = w.gravityMul === 0 && s.y < -200;
  if (lost || s.x < -300 || s.x > terrain.width + 300 || s.y > terrain.height + 100) {
    s.done = true;
    out.push({ kind: 'out', shell: s });
    return;
  }

  // Split rocket: burst at the top of the arc.
  if (w.split && !s.split && wasRising && s.vy >= 0) {
    s.split = true;
    const { spreadVx } = w.split;
    const count = v.splitCount;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spreadVx;
      if (offset === 0) continue; // the original shell is the middle fragment
      v.shells.push({ ...s, vx: s.vx + offset });
    }
    out.push({ kind: 'split', x: s.x, y: s.y });
  }
}

/** Mirror the shell off the ground's slope, back at its last open spot. False when too slow to hop again. */
function bounce(world: World, s: Shell, px: number, py: number, keep: number): boolean {
  // The surface normal points away from the dirt around the hit.
  let nx = 0;
  let ny = 0;
  for (let oy = -5; oy <= 5; oy++) for (let ox = -5; ox <= 5; ox++) {
    if (ox * ox + oy * oy <= 25 && world.terrain.isSolid(s.x + ox, s.y + oy)) {
      nx -= ox;
      ny -= oy;
    }
  }
  const len = Math.hypot(nx, ny);
  if (len === 0) [nx, ny] = [0, -1];
  else [nx, ny] = [nx / len, ny / len];
  const dot = s.vx * nx + s.vy * ny;
  const vx = (s.vx - 2 * dot * nx) * keep;
  const vy = (s.vy - 2 * dot * ny) * keep;
  if (Math.hypot(vx, vy) < 40) return false;
  s.bounces--;
  s.vx = vx;
  s.vy = vy;
  s.x = px;
  s.y = py;
  return true;
}

/** The mortar: scatter bomblets up out of the blast, from the last open spot before the hit. */
function burst(v: Volley, s: Shell, px: number, py: number): void {
  const c = v.weapon.cluster;
  if (!c || s.frag) return;
  const n = v.clusterCount;
  for (let i = 0; i < n; i++) {
    const vx = (i - (n - 1) / 2) * c.spreadVx;
    v.shells.push({ ...s, x: px, y: py - 4, vx, vy: -c.lift * (1 - Math.abs(vx) / (c.spreadVx * n + 1) * 0.5), frag: true, split: true, bounces: 0, done: false });
  }
}
