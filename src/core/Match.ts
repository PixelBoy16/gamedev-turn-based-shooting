import { TurnMods, shotWeapon } from './Actions';
import { ItemId, WeaponDef } from './data';
import { Loadout } from './gear';
import { MapId, spawnX } from './Maps';
import { Volley, fireVolley, stepVolley, volleyDone } from './Shot';
import { Terrain } from './Terrain';
import { BlastSpec, TUNING, Tank, World, createTank, explode, isSettled, stepTank } from './World';

// Everything that happens between "fire" and "next turn", as plain functions so the
// battle scene (one tick per frame, with effects) and the server (run to the end in
// one go) apply exactly the same rules in the same order.

export interface RosterEntry {
  name: string;
  team: number;
  isBot: boolean;
  loadout: Loadout;
  items: ItemId[];
}

/** Tanks in roster order; each team fills its spawn slots left to right. */
export function buildTanks(map: MapId, terrain: Terrain, roster: RosterEntry[]): Tank[] {
  const slot = new Map<number, number>();
  return roster.map((r, id) => {
    const s = slot.get(r.team) ?? 0;
    slot.set(r.team, s + 1);
    return createTank(id, r.name, r.team, r.isBot, spawnX(map, r.team, s, terrain.width), terrain, r.loadout, r.items);
  });
}

export type ShotEvent =
  | { kind: 'launch' }
  | { kind: 'impact'; x: number; y: number; hitTank: Tank | null; damaged: { tank: Tank; amount: number }[]; ko: Tank[]; frag: boolean }
  | { kind: 'warp'; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: 'carve'; x: number; y: number }
  | { kind: 'split'; x: number; y: number }
  | { kind: 'bounce'; x: number; y: number }
  | { kind: 'volleyEnd' }
  | { kind: 'end' };

/**
 * One trigger pull, including the second volley of "double". The first step
 * launches; later steps fly the shells and apply impacts to the world.
 */
export class ShotRun {
  volley: Volley | null = null;
  done = false;
  /** Impact points of the whole shot, for the miss-distance readout. */
  hits: { x: number; y: number }[] = [];
  /** Damage dealt to the shooter's enemies. */
  damage = 0;
  /** The weapon as fired, with this turn's skill applied. */
  readonly weapon: WeaponDef;
  private shotsLeft: number;
  private refire = 0;

  constructor(
    readonly world: World,
    readonly shooter: Tank,
    weapon: WeaponDef,
    readonly power: number,
    readonly mods: TurnMods,
  ) {
    this.weapon = shotWeapon(weapon, mods);
    this.shotsLeft = mods.shots;
  }

  step(): ShotEvent[] {
    const out: ShotEvent[] = [];
    if (this.done) return out;
    if (!this.volley) {
      // first launch, or the gap between the two shots of "double"
      this.refire -= TUNING.dt;
      if (this.refire > 0) return out;
      this.shotsLeft--;
      this.volley = fireVolley(this.shooter, this.weapon, this.power, this.mods.noWind, this.mods.splitCount);
      out.push({ kind: 'launch' });
      return out;
    }
    const v = this.volley;
    for (const ev of stepVolley(this.world, v)) {
      if (ev.kind === 'impact') this.impact(ev.x, ev.y, ev.hitTank, out, ev.shell.frag);
      else if (ev.kind === 'carve') {
        this.world.terrain.carve(ev.x, ev.y, ev.r);
        out.push({ kind: 'carve', x: ev.x, y: ev.y });
      } else if (ev.kind === 'split') out.push({ kind: 'split', x: ev.x, y: ev.y });
      else if (ev.kind === 'bounce') out.push({ kind: 'bounce', x: ev.x, y: ev.y });
    }
    if (!volleyDone(v)) return out;
    this.volley = null;
    out.push({ kind: 'volleyEnd' });
    if (this.shotsLeft > 0) this.refire = 0.45;
    else {
      this.done = true;
      out.push({ kind: 'end' });
    }
    return out;
  }

  private impact(x: number, y: number, hitTank: Tank | null, out: ShotEvent[], frag: boolean): void {
    this.hits.push({ x, y });
    const s = this.shooter;
    if (this.mods.warp) {
      // Teleport the shooter; no crater, no damage. Remaining fragments fizzle.
      for (const sh of this.volley!.shells) sh.done = true;
      const from = { x: s.x, y: s.y };
      s.x = Math.max(10, Math.min(this.world.terrain.width - 10, x));
      s.y = Math.max(0, Math.floor(y) - 2);
      s.vx = 0;
      s.vy = 0;
      out.push({ kind: 'warp', from, to: { x: s.x, y: s.y } });
      return;
    }
    const res = explode(this.world, x, y, blastOf(this.weapon, frag), this.mods.dmgScale * s.atk);
    for (const d of res.damaged) if (d.tank.team !== s.team) this.damage += d.amount;
    out.push({ kind: 'impact', x, y, hitTank, damaged: res.damaged, ko: knockouts(this.world), frag });
  }
}

/** A shell's blast: a mortar bomblet has its own, smaller one. */
export function blastOf(w: WeaponDef, frag: boolean): BlastSpec {
  return frag && w.cluster ? w.cluster : w;
}

/** Mark tanks at 0 HP as out. Returns the ones that just went out. */
export function knockouts(world: World): Tank[] {
  const out: Tank[] = [];
  for (const t of world.tanks) {
    if (t.alive && t.hp <= 0) {
      t.alive = false;
      out.push(t);
    }
  }
  return out;
}

export interface TankStepEvents {
  falls: { tank: Tank; amount: number }[];
  /** drowned / fell off the map / knocked out by fall damage */
  out: { tank: Tank; how: 'drown' | 'fall' | 'ko' }[];
}

/** Gravity and knockback for every tank, one fixed step. */
export function stepTanks(world: World): TankStepEvents {
  const ev: TankStepEvents = { falls: [], out: [] };
  for (const t of world.tanks) {
    const wasAlive = t.alive;
    const amount = stepTank(world, t);
    if (amount > 0) ev.falls.push({ tank: t, amount });
    if (wasAlive && !t.alive) ev.out.push({ tank: t, how: t.y < world.terrain.height ? 'drown' : 'fall' });
  }
  for (const t of knockouts(world)) ev.out.push({ tank: t, how: 'ko' });
  return ev;
}

/** Seconds the settle phase waits at least, and at most, before the next turn. */
export const SETTLE = { min: 0.7, max: 6 };

/** Headless: fly the whole shot, then let everything land. */
export function runShot(run: ShotRun): void {
  while (!run.done) {
    run.step();
    stepTanks(run.world);
  }
  settle(run.world);
}

export function settle(world: World): void {
  for (let t = 0; t < SETTLE.max; ) {
    t += TUNING.dt;
    stepTanks(world);
    if (t > SETTLE.min && isSettled(world)) return;
  }
}
