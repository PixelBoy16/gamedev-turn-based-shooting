// Game content types. The values (names, damage, item effects...) live in
// config/game.json and are loaded by config.ts; only the set of ids is fixed here,
// because each one has its own behaviour in code.

export { ITEMS, ITEM_VALUES, LIMITS, SKILLS, WEAPONS } from './config';

export type WeaponId = 'cannon' | 'hammer' | 'splitter' | 'shovel' | 'drill' | 'bouncer' | 'beam' | 'mortar' | 'magnet' | 'dirtbomb';

export type SkillId = 'calm' | 'wall' | 'storm' | 'burrow' | 'rebound' | 'pierce' | 'barrage' | 'vortex' | 'landslide';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Short description shown in the wardrobe. */
  desc: string;
  damage: number;
  radius: number;
  knockback: number;
  windMul: number; // 0 = ignores wind
  gravityMul: number;
  speedMul?: number; // launch speed multiplier
  /** Splits into `count` shells at the top of the arc. */
  split?: { count: number; spreadVx: number };
  /** Bores through `length` px of dirt before exploding. */
  drill?: { length: number; carveRadius: number };
  /** Bounces off the ground `count` times, keeping `keep` of its speed; the skill adds `boost` bounces. */
  bounce?: { count: number; keep: number; boost: number };
  /** Skill only: bores through this many px of dirt (the beam). */
  pierce?: number;
  /** On impact, throws `count` bomblets (`boostCount` with the skill), each with its own blast. */
  cluster?: { count: number; boostCount: number; damage: number; radius: number; knockback: number; spreadVx: number; lift: number };
  /** Pulls every character within `radius` (`boostRadius` with the skill) toward the blast. */
  pull?: { force: number; radius: number; boostRadius: number };
  /** Piles a disc of dirt instead of digging a crater; `boostRadius` with the skill. */
  mound?: { radius: number; boostRadius: number };
  /** The skill this weapon grants (none for the shared drill). */
  skill?: SkillId;
}

/** Weapons you can equip; the drill is shared by everyone but limited per match. */
export const MAIN_WEAPONS: WeaponId[] = ['cannon', 'hammer', 'splitter', 'shovel', 'bouncer', 'beam', 'mortar', 'magnet', 'dirtbomb'];

export type ItemId = 'double' | 'power' | 'warp' | 'heal' | 'armor';

export { ITEM_IDS } from './config';
