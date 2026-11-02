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
  done: boolean;
}

export interface Volley {
  shooter: Tank;
  weapon: WeaponDef;
  shells: Shell[];
  windMul: number; // 0 when the shooter used the "calm" skill
}

export type VolleyEvent =
  | { kind: 'impact'; shell: Shell; x: number; y: number; hitTank: Tank | null }
  | { kind: 'out'; shell: Shell }
  | { kind: 'split'; x: number; y: number }
  | { kind: 'carve'; x: number; y: number; r: number };

export function fireVolley(shooter: Tank, weapon: WeaponDef, power: number, noWind = false): Volley {
  const m = muzzle(shooter);
  const speed = Math.max(0, Math.min(100, power)) * TUNING.launchSpeedPerPower * (weapon.speedMul ?? 1);
  const rad = (shooter.angle * Math.PI) / 180;
  const shell: Shell = {
    x: m.x, y: m.y,
    vx: Math.cos(rad) * speed * shooter.facing, vy: -Math.sin(rad) * speed,
    frames: 0, drilled: 0, sinceCarve: 0, split: false, done: false,
  };
  return { shooter, weapon, shells: [shell], windMul: noWind ? 0 : 1 };
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
    s.x += dx / steps;
    s.y += dy / steps;
    for (const t of world.tanks) {
      if (!t.alive || t.burrowed || (t === v.shooter && s.frames < 8)) continue;
      if (Math.hypot(s.x - t.x, s.y - (t.y - TUNING.tankCentreOffset)) <= tankRadius) {
        s.done = true;
        out.push({ kind: 'impact', shell: s, x: s.x, y: s.y, hitTank: t });
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
      s.done = true;
      out.push({ kind: 'impact', shell: s, x: s.x, y: s.y, hitTank: null });
      return;
    }
  }
  s.frames++;

  if (s.x < -300 || s.x > terrain.width + 300 || s.y > terrain.height + 100) {
    s.done = true;
    out.push({ kind: 'out', shell: s });
    return;
  }

  // Split rocket: burst at the top of the arc.
  if (w.split && !s.split && wasRising && s.vy >= 0) {
    s.split = true;
    const { count, spreadVx } = w.split;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spreadVx;
      if (offset === 0) continue; // the original shell is the middle fragment
      v.shells.push({ ...s, vx: s.vx + offset });
    }
    out.push({ kind: 'split', x: s.x, y: s.y });
  }
}
