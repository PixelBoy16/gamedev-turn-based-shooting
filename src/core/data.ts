// Game content types. The values (names, damage, item effects...) live in
// config/game.json and are loaded by config.ts; only the set of ids is fixed here,
// because each one has its own behaviour in code.

export { ITEMS, ITEM_VALUES, LIMITS, SKILLS, WEAPONS } from './config';

export type WeaponId = 'cannon' | 'hammer' | 'splitter' | 'shovel' | 'drill';

export type SkillId = 'calm' | 'wall' | 'storm' | 'burrow';

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
  /** The skill this weapon grants (none for the shared drill). */
  skill?: SkillId;
}

/** Weapons you can equip; the drill is shared by everyone but limited per match. */
export const MAIN_WEAPONS: WeaponId[] = ['cannon', 'hammer', 'splitter', 'shovel'];

export type ItemId = 'double' | 'power' | 'warp' | 'heal' | 'armor';

export { ITEM_IDS } from './config';
