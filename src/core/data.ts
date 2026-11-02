// Game content for the bot-mode MVP. Every number here is a playtest starting point
// from the GDD; tweak freely. Kept as typed TS (not JSON) so typos fail the build.

export type WeaponId = 'cannon' | 'hammer' | 'splitter' | 'drill';

export interface WeaponDef {
  id: WeaponId;
  name: string;
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
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  cannon: { id: 'cannon', name: 'ปืนใหญ่ลูกกลม', damage: 300, radius: 40, knockback: 260, windMul: 1, gravityMul: 1 },
  hammer: { id: 'hammer', name: 'ค้อนหิน', damage: 380, radius: 28, knockback: 420, windMul: 0.5, gravityMul: 1.35, speedMul: 1.12 },
  splitter: {
    id: 'splitter', name: 'จรวดแตก', damage: 140, radius: 24, knockback: 160, windMul: 1.5, gravityMul: 1,
    split: { count: 3, spreadVx: 70 },
  },
  drill: {
    id: 'drill', name: 'สว่านเจาะ', damage: 120, radius: 18, knockback: 120, windMul: 0, gravityMul: 1,
    drill: { length: 240, carveRadius: 13 },
  },
};

/** The drill is shared by every character but limited per match. */
export const DRILL_USES = 2;

export type SkillId = 'burrow' | 'wall' | 'calm';

/** Own turns to wait after using a skill. */
export const SKILL_COOLDOWN = 3;

export const SKILLS: Record<SkillId, { name: string; desc: string }> = {
  burrow: { name: 'มุดดิน', desc: 'หลบใต้ดิน ไม่โดนดาเมจจนถึงตาถัดไป (จบเทิร์นทันที)' },
  wall: { name: 'กำแพงดิน', desc: 'เสกกำแพงดินสูง 80 px ตรงหน้า' },
  calm: { name: 'ไร้ลม', desc: 'นัดนี้ไม่โดนลม' },
};

export type CharacterId = 'mole' | 'mason' | 'sparky';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  style: string;
  weapon: WeaponId;
  skill: SkillId;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  mole: { id: 'mole', name: 'ตุ่นตุ๊ก', style: 'สมดุล เหมาะมือใหม่', weapon: 'cannon', skill: 'burrow' },
  mason: { id: 'mason', name: 'เจ้ากำแพง', style: 'ป้องกัน ยิงวิถีต่ำ', weapon: 'hammer', skill: 'wall' },
  sparky: { id: 'sparky', name: 'พลุไฟ', style: 'บุกหนัก เล็งยาก', weapon: 'splitter', skill: 'calm' },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

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
