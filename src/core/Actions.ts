import { CHARACTERS, ITEM_VALUES, ItemId, SKILL_COOLDOWN, SkillId } from './data';
import { TUNING, Tank, World, raiseWall } from './World';

// Item and skill rules, shared by the human controls and the bot.

/** Modifiers that apply to this turn's shot. */
export interface TurnMods {
  dmgScale: number;
  shots: number; // 2 with "double"
  warp: boolean;
  noWind: boolean;
  itemUsed: boolean;
  skillUsed: boolean;
}

export function freshMods(): TurnMods {
  return { dmgScale: 1, shots: 1, warp: false, noWind: false, itemUsed: false, skillUsed: false };
}

/** One item per turn. Returns the item used, or null if not allowed. */
export function useItem(t: Tank, slot: number, mods: TurnMods): ItemId | null {
  const item = t.items[slot];
  if (!item || mods.itemUsed || !t.alive) return null;
  t.items[slot] = null;
  mods.itemUsed = true;
  switch (item) {
    case 'double':
      mods.shots = 2;
      mods.dmgScale *= ITEM_VALUES.doubleScale;
      break;
    case 'power':
      mods.dmgScale *= ITEM_VALUES.powerScale;
      break;
    case 'warp':
      mods.warp = true;
      break;
    case 'heal':
      t.hp = Math.min(TUNING.maxHp, t.hp + ITEM_VALUES.heal);
      break;
    case 'armor':
      t.armored = true;
      break;
  }
  return item;
}

export interface SkillResult {
  skill: SkillId;
  endsTurn: boolean;
  wall?: { x: number; y: number; w: number; h: number };
}

/** Use the character's skill if it is off cooldown. */
export function useSkill(world: World, t: Tank, mods: TurnMods): SkillResult | null {
  if (t.skillCooldown > 0 || mods.skillUsed || !t.alive || t.airborne) return null;
  const skill = CHARACTERS[t.char].skill;
  mods.skillUsed = true;
  // Ticks down at the start of each own turn, so it is ready again 3 own turns later.
  t.skillCooldown = SKILL_COOLDOWN;
  switch (skill) {
    case 'burrow':
      t.burrowed = true;
      return { skill, endsTurn: true };
    case 'wall':
      return { skill, endsTurn: false, wall: raiseWall(world, t) };
    case 'calm':
      mods.noWind = true;
      return { skill, endsTurn: false };
  }
}
