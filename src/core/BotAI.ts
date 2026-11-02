import { Rng, randRange } from './rng';
import { ITEM_VALUES, ItemId, SkillId, WeaponDef } from './data';
import { fireVolley, stepVolley, volleyDone } from './Shot';
import { Tank, World, blastDamage, tankCentre } from './World';

export type Difficulty = 'easy' | 'normal' | 'hard';

const AIM_ERROR: Record<Difficulty, { angle: number; power: number }> = {
  easy: { angle: 8, power: 12 },
  normal: { angle: 4, power: 6 },
  hard: { angle: 1.5, power: 2 },
};

export interface Shot {
  angle: number;
  power: number;
  facing: 1 | -1;
}

export interface ShotOptions {
  weapon: WeaponDef;
  noWind?: boolean;
  dmgScale?: number;
}

/**
 * Where every shell of a shot would land, using the exact same step function as
 * the real volley (so wind, hills and split rockets are accounted for). Dry run:
 * the terrain is not touched.
 */
export function simulateShot(world: World, shooter: Tank, shot: Shot, opts: ShotOptions, maxFrames = 600): { x: number; y: number }[] {
  const saved = { angle: shooter.angle, facing: shooter.facing };
  shooter.angle = shot.angle;
  shooter.facing = shot.facing;
  const v = fireVolley(shooter, opts.weapon, shot.power, opts.noWind);
  shooter.angle = saved.angle;
  shooter.facing = saved.facing;
  const hits: { x: number; y: number }[] = [];
  for (let f = 0; f < maxFrames && !volleyDone(v); f++) {
    for (const ev of stepVolley(world, v)) if (ev.kind === 'impact') hits.push({ x: ev.x, y: ev.y });
  }
  return hits;
}

/**
 * Score a set of impacts: damage to enemies (plus a kill bonus) minus damage to
 * ourselves and allies. A shot that hurts no one scores by how close it got, so
 * any damaging shot beats any miss.
 */
export function scoreImpacts(world: World, bot: Tank, hits: { x: number; y: number }[], opts: ShotOptions): number {
  const spec = opts.weapon;
  const scale = opts.dmgScale ?? 1;
  const taken = new Map<Tank, number>();
  for (const h of hits) {
    for (const t of world.tanks) {
      if (!t.alive || t.burrowed) continue;
      const dmg = blastDamage(t, h.x, h.y, spec) * scale * (t.armored ? ITEM_VALUES.armorScale : 1);
      if (dmg > 0) taken.set(t, (taken.get(t) ?? 0) + dmg);
    }
  }
  let score = 0;
  let enemyDamage = 0;
  for (const [t, dmg] of taken) {
    if (t.team !== bot.team) {
      enemyDamage += Math.min(dmg, t.hp);
      score += Math.min(dmg, t.hp) + (dmg >= t.hp ? 300 : 0);
    } else {
      score -= dmg * 1.5;
    }
  }
  if (enemyDamage > 0) return 1000 + score;
  const enemies = world.tanks.filter((t) => t.alive && t.team !== bot.team);
  let closest = Infinity;
  for (const h of hits) for (const e of enemies) closest = Math.min(closest, Math.hypot(h.x - e.x, h.y - tankCentre(e).y));
  return score - (Number.isFinite(closest) ? closest : 5000);
}

/**
 * Random search spread over several frames: `work(n)` tries n more shots and
 * returns true when the sample budget is spent. Facing mostly points at the
 * nearest enemy, sometimes the other way (a high lob can curve back in wind).
 */
export class ShotPlanner {
  private tried = 0;
  private best: Shot;
  bestScore = -Infinity;

  constructor(
    private world: World,
    private bot: Tank,
    private rng: Rng,
    private opts: ShotOptions,
    private samples = 220,
  ) {
    const bc = tankCentre(bot);
    const nearest = world.tanks
      .filter((t) => t.alive && t.team !== bot.team)
      .sort((a, b) => Math.abs(a.x - bc.x) - Math.abs(b.x - bc.x))[0];
    const facing: 1 | -1 = !nearest || nearest.x >= bc.x ? 1 : -1;
    this.best = { angle: 45, power: 60, facing };
  }

  get done(): boolean {
    return this.tried >= this.samples;
  }

  work(n: number): boolean {
    const toward = this.best.facing;
    for (let i = 0; i < n && !this.done; i++, this.tried++) {
      const facing: 1 | -1 = this.rng() < 0.85 ? toward : (-toward as 1 | -1);
      const shot: Shot = { angle: randRange(this.rng, 10, 85), power: randRange(this.rng, 25, 100), facing };
      const score = scoreImpacts(this.world, this.bot, simulateShot(this.world, this.bot, shot, this.opts), this.opts);
      if (score > this.bestScore) {
        this.bestScore = score;
        this.best = shot;
      }
    }
    return this.done;
  }

  /** Best shot plus human-like error. `missStreak` shrinks the error so the bot looks like it is adjusting. */
  result(difficulty: Difficulty, missStreak = 0): Shot {
    const err = AIM_ERROR[difficulty];
    const shrink = Math.pow(0.8, missStreak);
    return {
      facing: this.best.facing,
      angle: clamp(this.best.angle + randRange(this.rng, -err.angle, err.angle) * shrink, 0, 90),
      power: clamp(this.best.power + randRange(this.rng, -err.power, err.power) * shrink, 5, 100),
    };
  }
}

export function chooseShot(world: World, bot: Tank, rng: Rng, difficulty: Difficulty, opts: ShotOptions, missStreak = 0, samples = 220): Shot {
  const p = new ShotPlanner(world, bot, rng, opts, samples);
  p.work(samples);
  return p.result(difficulty, missStreak);
}

export type BotAction = { kind: 'item'; slot: number; item: ItemId } | { kind: 'skill'; skill: SkillId };

/**
 * Pre-shot decisions (FSM "think" state). Easy bots never use items or skills;
 * normal bots use them when clearly useful; hard bots use them freely.
 */
export function chooseSupport(world: World, bot: Tank, skill: SkillId, difficulty: Difficulty): BotAction[] {
  if (difficulty === 'easy') return [];
  const actions: BotAction[] = [];
  const has = (id: ItemId) => bot.items.indexOf(id);
  const hard = difficulty === 'hard';

  if (bot.skillCooldown === 0) {
    if (skill === 'burrow' && hard && bot.hp < 300) return [{ kind: 'skill', skill }];
    if (skill === 'calm' && Math.abs(world.wind) >= (hard ? 2 : 4)) actions.push({ kind: 'skill', skill });
    if (skill === 'wall' && bot.hp < (hard ? 700 : 450)) actions.push({ kind: 'skill', skill });
  }
  const heal = has('heal');
  const armor = has('armor');
  if (heal >= 0 && bot.hp < (hard ? 600 : 450)) actions.push({ kind: 'item', slot: heal, item: 'heal' });
  else if (armor >= 0 && bot.hp < (hard ? 700 : 400)) actions.push({ kind: 'item', slot: armor, item: 'armor' });
  return actions;
}

/** After planning: spend an attack item if the best shot is expected to hit. */
export function chooseAttackItem(bot: Tank, expectedHit: boolean, difficulty: Difficulty): BotAction | null {
  if (difficulty === 'easy' || !expectedHit) return null;
  for (const item of ['power', 'double'] as ItemId[]) {
    const slot = bot.items.indexOf(item);
    if (slot >= 0) return { kind: 'item', slot, item };
  }
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
