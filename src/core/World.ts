import { Terrain } from './Terrain';
import { CharacterId, DRILL_USES, ITEM_VALUES, ItemId } from './data';

// Core tunables. Weapon numbers live in data.ts.
export const TUNING = {
  dt: 1 / 60, // fixed simulation step (s)
  gravity: 420, // px/s²
  windAccel: 18, // px/s² per wind unit
  maxWind: 5,
  launchSpeedPerPower: 9.5, // power 100 → 950 px/s
  maxProjectileSpeed: 1600,
  subStepPx: 2, // collision check spacing for projectiles (prevents tunneling)

  tankRadius: 20, // hit circle around the character's centre
  tankCentreOffset: 22, // centre is this far above the feet
  muzzleLength: 30,
  walkSpeed: 70, // px/s
  fuelPerTurn: 150, // px of walking per turn
  maxClimb: 8, // px step-up while walking
  safeFall: 120, // px fallen before fall damage starts
  fallDamagePerPx: 1.5,

  maxHp: 1000,
  turnSeconds: 20,
  chargeSeconds: 1.5,

  wall: { height: 80, width: 24, gap: 30 },
  suddenDeathTurn: 30,
  waterRisePerTurn: 40,
};

export interface Tank {
  id: number;
  name: string;
  team: number;
  isBot: boolean;
  char: CharacterId;
  x: number;
  y: number; // feet: the first pixel below the character
  vx: number;
  vy: number;
  airborne: boolean;
  fallStartY: number;
  hp: number;
  facing: 1 | -1;
  angle: number; // degrees above horizontal, 0..90, mirrored by facing
  alive: boolean;
  armored: boolean; // takes half damage until its next turn
  burrowed: boolean; // immune until its next turn
  skillCooldown: number; // own turns until the skill is ready
  items: (ItemId | null)[]; // null = used
  drillLeft: number;
}

export interface BlastSpec {
  damage: number;
  radius: number;
  knockback: number;
}

export interface World {
  terrain: Terrain;
  tanks: Tank[];
  wind: number;
  /** Sudden-death water line; anything whose centre sinks below it drowns. */
  waterY: number;
}

export function createWorld(terrain: Terrain, tanks: Tank[] = []): World {
  return { terrain, tanks, wind: 0, waterY: Infinity };
}

export function createTank(
  id: number, name: string, team: number, isBot: boolean, x: number, terrain: Terrain,
  char: CharacterId = 'mole', items: ItemId[] = [],
): Tank {
  const y = terrain.standY(x) ?? terrain.height;
  return {
    id, name, team, isBot, char, x, y,
    vx: 0, vy: 0, airborne: false, fallStartY: y,
    hp: TUNING.maxHp,
    facing: x < terrain.width / 2 ? 1 : -1,
    angle: 45,
    alive: true,
    armored: false,
    burrowed: false,
    skillCooldown: 0,
    items: [...items],
    drillLeft: DRILL_USES,
  };
}

export function tankCentre(t: Tank): { x: number; y: number } {
  return { x: t.x, y: t.y - TUNING.tankCentreOffset };
}

export function muzzle(t: Tank): { x: number; y: number } {
  const c = tankCentre(t);
  const rad = (t.angle * Math.PI) / 180;
  return { x: c.x + Math.cos(rad) * TUNING.muzzleLength * t.facing, y: c.y - Math.sin(rad) * TUNING.muzzleLength };
}

/** Raw blast damage to a tank (before armor and item scaling). 0 if out of range. */
export function blastDamage(t: Tank, x: number, y: number, spec: BlastSpec): number {
  const c = tankCentre(t);
  const d = Math.max(0, Math.hypot(c.x - x, c.y - y) - TUNING.tankRadius);
  const falloff = Math.max(0, 1 - d / spec.radius);
  return falloff <= 0 ? 0 : Math.round(spec.damage * Math.pow(falloff, 0.7));
}

export interface ExplosionResult {
  damaged: { tank: Tank; amount: number }[];
}

/** Carve the crater, then damage and knock back every tank in range. */
export function explode(world: World, x: number, y: number, spec: BlastSpec, dmgScale = 1): ExplosionResult {
  world.terrain.carve(x, y, spec.radius);
  const damaged: ExplosionResult['damaged'] = [];
  for (const t of world.tanks) {
    if (!t.alive || t.burrowed) continue;
    const raw = blastDamage(t, x, y, spec);
    if (raw <= 0) continue;
    const amount = Math.round(raw * dmgScale * (t.armored ? ITEM_VALUES.armorScale : 1));
    t.hp = Math.max(0, t.hp - amount);
    damaged.push({ tank: t, amount });
    // Knock away from the blast, always with some lift so tanks hop instead of sliding.
    const c = tankCentre(t);
    const falloff = Math.max(0, 1 - Math.max(0, Math.hypot(c.x - x, c.y - y) - TUNING.tankRadius) / spec.radius);
    const ang = Math.atan2(c.y - y, c.x - x);
    t.vx += Math.cos(ang) * spec.knockback * falloff;
    t.vy += Math.min(-60, Math.sin(ang) * spec.knockback * falloff) * falloff;
    setAirborne(t);
  }
  return { damaged };
}

/** Mason's skill: a dirt wall just in front of the tank. Returns the wall rect. */
export function raiseWall(world: World, t: Tank): { x: number; y: number; w: number; h: number } {
  const { height, width, gap } = TUNING.wall;
  const x = t.facing > 0 ? t.x + gap : t.x - gap - width;
  // Extend below the feet so the wall stays rooted on a slope.
  const rect = { x, y: t.y - height, w: width, h: height + 40 };
  world.terrain.fillRect(rect.x, rect.y, rect.w, rect.h);
  return rect;
}

function setAirborne(t: Tank): void {
  if (!t.airborne) {
    t.airborne = true;
    t.fallStartY = t.y;
  }
}

/** Walk one fixed step. Returns pixels actually moved (for fuel). */
export function walk(world: World, t: Tank, dir: -1 | 1): number {
  if (t.airborne || !t.alive) return 0;
  t.facing = dir;
  const nx = t.x + dir * TUNING.walkSpeed * TUNING.dt;
  if (nx < 4 || nx > world.terrain.width - 4) return 0;
  // Find the ground height at the new column, allowing a small step up.
  let ny = t.y;
  while (world.terrain.isSolid(nx, ny - 1)) {
    ny--;
    if (t.y - ny > TUNING.maxClimb) return 0; // too steep: blocked
  }
  // Downhill: hug the slope instead of hopping off it.
  for (let drop = 0; drop < TUNING.maxClimb && !world.terrain.isSolid(nx, ny); drop++) ny++;
  const moved = Math.abs(nx - t.x);
  t.x = nx;
  t.y = ny;
  if (!world.terrain.isSolid(t.x, t.y)) setAirborne(t);
  return moved;
}

/**
 * Gravity + knockback for one fixed step. Returns fall damage dealt on landing (0 otherwise).
 * Tanks whose ground was blasted away start falling here.
 */
export function stepTank(world: World, t: Tank): number {
  if (!t.alive) return 0;
  const { terrain } = world;
  if (t.y - TUNING.tankCentreOffset > world.waterY) {
    t.hp = 0;
    t.alive = false; // drowned in sudden death
    return 0;
  }
  if (!t.airborne) {
    if (terrain.isSolid(t.x, t.y)) return 0;
    setAirborne(t);
  }

  t.vy += TUNING.gravity * TUNING.dt;
  // Horizontal: stop against walls.
  const nx = t.x + t.vx * TUNING.dt;
  if (terrain.isSolid(nx, t.y - TUNING.tankCentreOffset) || nx < 4 || nx > terrain.width - 4) t.vx = 0;
  else t.x = nx;

  // Vertical: sweep 1px at a time so we land exactly on the surface.
  const dy = t.vy * TUNING.dt;
  const steps = Math.ceil(Math.abs(dy));
  const sign = Math.sign(dy);
  for (let i = 0; i < steps; i++) {
    if (sign > 0 && terrain.isSolid(t.x, t.y)) return land(t);
    if (sign < 0 && terrain.isSolid(t.x, t.y - TUNING.tankCentreOffset * 2)) {
      t.vy = 0;
      break;
    }
    t.y += sign;
  }
  if (t.y > terrain.height + 60) {
    t.hp = 0;
    t.alive = false; // fell off the map
  }
  return 0;
}

function land(t: Tank): number {
  const fallen = t.y - t.fallStartY;
  t.airborne = false;
  t.vx = 0;
  t.vy = 0;
  const dmg = fallen > TUNING.safeFall ? Math.round((fallen - TUNING.safeFall) * TUNING.fallDamagePerPx) : 0;
  t.hp = Math.max(0, t.hp - dmg);
  return dmg;
}

export function isSettled(world: World): boolean {
  return world.tanks.every((t) => !t.alive || (!t.airborne && world.terrain.isSolid(t.x, t.y)));
}
