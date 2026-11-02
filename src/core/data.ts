// Game content. Every number here is a playtest starting point
// from the GDD; tweak freely. Kept as typed TS (not JSON) so typos fail the build.

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

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  cannon: {
    id: 'cannon', name: 'ปืนใหญ่', desc: 'สมดุล เหมาะมือใหม่',
    damage: 300, radius: 40, knockback: 260, windMul: 1, gravityMul: 1, skill: 'calm',
  },
  hammer: {
    id: 'hammer', name: 'ค้อนหิน', desc: 'หนัก วิถีต่ำ ลมแทบไม่มีผล กระเด็นแรง',
    damage: 380, radius: 28, knockback: 420, windMul: 0.5, gravityMul: 1.35, speedMul: 1.12, skill: 'wall',
  },
  splitter: {
    id: 'splitter', name: 'จรวดแตก', desc: 'แตก 3 ลูกกลางอากาศ โดนลมแรง',
    damage: 140, radius: 24, knockback: 160, windMul: 1.5, gravityMul: 1,
    split: { count: 3, spreadVx: 70 }, skill: 'storm',
  },
  shovel: {
    id: 'shovel', name: 'พลั่วระเบิด', desc: 'ดาเมจเบา แต่ขุดหลุมใหญ่ ทำให้ศัตรูตกได้',
    damage: 220, radius: 58, knockback: 200, windMul: 1, gravityMul: 1, skill: 'burrow',
  },
  drill: {
    id: 'drill', name: 'สว่านเจาะ', desc: 'เจาะทะลุดิน 240 px แล้วระเบิด',
    damage: 120, radius: 18, knockback: 120, windMul: 0, gravityMul: 1,
    drill: { length: 240, carveRadius: 13 },
  },
};

/** Weapons you can equip; the drill is shared by everyone but limited per match. */
export const MAIN_WEAPONS: WeaponId[] = ['cannon', 'hammer', 'splitter', 'shovel'];
export const DRILL_USES = 2;

/** Own turns to wait after using a skill. */
export const SKILL_COOLDOWN = 3;

export const SKILLS: Record<SkillId, { name: string; desc: string }> = {
  calm: { name: 'ไร้ลม', desc: 'นัดนี้ไม่โดนลม' },
  wall: { name: 'กำแพงดิน', desc: 'เสกกำแพงดินสูง 80 px ตรงหน้า' },
  storm: { name: 'ห่าฝน', desc: 'นัดนี้แตก 5 ลูกแทน 3' },
  burrow: { name: 'มุดดิน', desc: 'หลบใต้ดิน ไม่โดนดาเมจจนถึงตาถัดไป (จบเทิร์นทันที)' },
};

/** Fragments of a split rocket while "storm" is active. */
export const STORM_SPLIT = 5;

export type ItemId = 'double' | 'power' | 'warp' | 'heal' | 'armor';

export const ITEMS: Record<ItemId, { name: string; desc: string }> = {
  double: { name: 'ยิงคู่', desc: 'ยิงซ้ำอีกนัด ดาเมจนัดละ 60%' },
  power: { name: 'พลัง +30%', desc: 'นัดนี้ดาเมจแรงขึ้น 30%' },
  warp: { name: 'วาร์ป', desc: 'กระสุนตกที่ไหน ตัวเราไปอยู่ที่นั่น (ไม่ทำดาเมจ)' },
  heal: { name: 'ฟื้น HP', desc: 'ฟื้น HP 250 ทันที' },
  armor: { name: 'เกราะ', desc: 'ลดดาเมจที่ได้รับ 50% จนถึงตาถัดไป' },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const ITEMS_PER_MATCH = 3;

export const ITEM_VALUES = { doubleScale: 0.6, powerScale: 1.3, heal: 250, armorScale: 0.5 };
