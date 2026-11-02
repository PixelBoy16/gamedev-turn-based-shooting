import { Rng } from './rng';
import { TUNING, Tank, World } from './World';

/**
 * Turns alternate between teams (so 1v2 is fair on tempo), and rotate through
 * each team's living members. Also owns wind, the turn clock, and sudden death.
 */
export class TurnManager {
  turnNumber = 0;
  current = -1;
  timeLeft = TUNING.turnSeconds;
  fuel = TUNING.fuelPerTurn;
  private teamOrder: number[];
  private teamPtr = -1;
  private lastMember = new Map<number, number>();

  constructor(private world: World, private rng: Rng) {
    this.teamOrder = [...new Set(world.tanks.map((t) => t.team))];
  }

  get active(): Tank {
    return this.world.tanks[this.current];
  }

  get suddenDeath(): boolean {
    return this.turnNumber > TUNING.suddenDeathTurn;
  }

  /** Advance to the next team's next living member, roll new wind, and refresh per-turn state. */
  next(): Tank {
    const { tanks } = this.world;
    pick: for (let i = 1; i <= this.teamOrder.length; i++) {
      const p = (this.teamPtr + i) % this.teamOrder.length;
      const team = this.teamOrder[p];
      const members = tanks.filter((t) => t.team === team);
      const last = this.lastMember.get(team) ?? -1;
      for (let j = 1; j <= members.length; j++) {
        const m = (last + j) % members.length;
        if (!members[m].alive) continue;
        this.teamPtr = p;
        this.lastMember.set(team, m);
        this.current = tanks.indexOf(members[m]);
        break pick;
      }
    }
    this.turnNumber++;
    this.timeLeft = TUNING.turnSeconds;
    this.fuel = TUNING.fuelPerTurn;
    this.world.wind = Math.round((this.rng() * 2 - 1) * TUNING.maxWind);
    if (this.suddenDeath) {
      this.world.waterY = Math.min(this.world.waterY, this.world.terrain.height) - TUNING.waterRisePerTurn;
    }
    const t = this.active;
    t.armored = false;
    t.burrowed = false;
    t.skillCooldown = Math.max(0, t.skillCooldown - 1);
    return t;
  }

  /** Team id of the winner, -1 for a draw, or null while the match is still going. */
  winner(): number | null {
    for (const t of this.world.tanks) if (t.hp <= 0) t.alive = false;
    const teams = new Set(this.world.tanks.filter((t) => t.alive).map((t) => t.team));
    if (teams.size > 1) return null;
    return teams.size === 1 ? [...teams][0] : -1;
  }
}
