import { DELAY } from './config';
import type { ItemId, WeaponId } from './data';
import { Rng } from './rng';
import { TUNING, Tank, World } from './World';

/** What a finished turn did; its cost decides when that character plays again. */
export interface TurnRecord {
  fired: WeaponId | null;
  item: ItemId | null;
  skill: boolean;
  moved: number; // px walked
  seconds: number; // spent before acting
}

export const PASSED: TurnRecord = { fired: null, item: null, skill: false, moved: 0, seconds: 0 };

export function turnCost(r: TurnRecord): number {
  return Math.round(
    (r.fired ? DELAY.shot + DELAY.weapons[r.fired] : DELAY.pass)
    + (r.item ? DELAY.items[r.item] : 0)
    + (r.skill ? DELAY.skill : 0)
    + r.moved * DELAY.perPx
    + r.seconds * DELAY.perSecond,
  );
}

/**
 * Delay turn order: the living character with the lowest delay plays next, ties going
 * to the team that did not just play. A smaller team's costs shrink in proportion
 * (1v2: the solo pays half), so both sides keep an even tempo. Also owns wind, the
 * turn clock, and sudden death.
 */
export class TurnManager {
  turnNumber = 0;
  current = -1;
  timeLeft = TUNING.turnSeconds;
  fuel = TUNING.fuelPerTurn;
  /** The delay the last finished turn added, for the "+N" pop-up. */
  lastCost: { id: number; delay: number } | null = null;
  private lastTeam = -1;
  private scale = new Map<number, number>();

  constructor(private world: World, private rng: Rng) {
    const size = new Map<number, number>();
    for (const t of world.tanks) size.set(t.team, (size.get(t.team) ?? 0) + 1);
    const biggest = Math.max(...size.values());
    // Stagger each team's members by a fraction of a turn so the first round alternates teams.
    const seen = new Map<number, number>();
    for (const t of world.tanks) {
      const m = seen.get(t.team) ?? 0;
      seen.set(t.team, m + 1);
      t.delay = Math.round((m * DELAY.pass) / biggest);
      this.scale.set(t.team, size.get(t.team)! / biggest);
    }
  }

  get active(): Tank {
    return this.world.tanks[this.current];
  }

  get suddenDeath(): boolean {
    return this.turnNumber > TUNING.suddenDeathTurn;
  }

  /** The living, in the order they will play: the active one first, then by delay. */
  order(): Tank[] {
    const rest = this.world.tanks.filter((t) => t.alive && t !== this.active).sort(this.before(this.active?.team ?? -1));
    return this.active?.alive ? [this.active, ...rest] : rest;
  }

  /** Charge the turn that just ended (`done`, default a pass), then pick the lowest delay; rolls new wind. */
  next(done: TurnRecord = PASSED): Tank {
    const prev = this.active;
    if (prev) {
      const delay = Math.round(turnCost(done) * (this.scale.get(prev.team) ?? 1));
      prev.delay += delay;
      this.lastCost = { id: prev.id, delay };
      this.lastTeam = prev.team;
    }
    const pick = this.world.tanks.filter((t) => t.alive).sort(this.before(this.lastTeam))[0] ?? this.world.tanks[0];
    this.current = this.world.tanks.indexOf(pick);
    this.turnNumber++;
    this.timeLeft = TUNING.turnSeconds;
    this.world.wind = Math.round((this.rng() * 2 - 1) * TUNING.maxWind);
    if (this.suddenDeath) {
      this.world.waterY = Math.min(this.world.waterY, this.world.terrain.height) - TUNING.waterRisePerTurn;
    }
    const t = this.active;
    this.fuel = TUNING.fuelPerTurn * t.move;
    t.armored = false;
    t.burrowed = false;
    t.skillCooldown = Math.max(0, t.skillCooldown - 1);
    return t;
  }

  private before(lastTeam: number) {
    return (a: Tank, b: Tank) => a.delay - b.delay || +(a.team === lastTeam) - +(b.team === lastTeam) || a.id - b.id;
  }

  /** Team id of the winner, -1 for a draw, or null while the match is still going. */
  winner(): number | null {
    for (const t of this.world.tanks) if (t.hp <= 0) t.alive = false;
    const teams = new Set(this.world.tanks.filter((t) => t.alive).map((t) => t.team));
    if (teams.size > 1) return null;
    return teams.size === 1 ? [...teams][0] : -1;
  }
}
