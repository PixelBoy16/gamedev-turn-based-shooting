import { MAIN_WEAPONS, WeaponId } from './data';
import { Rng } from './rng';
import { EQUIPMENT, FASHION, TUNING } from './config';

// What a player wears, in two separate halves:
// - fashion: decides how the chibi looks and nothing else, so it can be sold freely;
// - equipment: small stat sidegrades, shown only as icons, never on the body.
// Every equipment piece gives something and costs something of equal value
// (STAT_POINT), so there is no strictly best build. The weapon decides the shot
// and the skill.

// ------------------------------------------------------------------ fashion

export type FashionSlot = 'hat' | 'glasses' | 'hair' | 'face' | 'cloth' | 'eyes' | 'set' | 'back';

/** Wardrobe order: two columns down the left side. */
export const FASHION_SLOTS: FashionSlot[] = ['hat', 'glasses', 'hair', 'face', 'cloth', 'eyes', 'set', 'back'];

export const FASHION_SLOT_NAME: Record<FashionSlot, string> = {
  hat: 'หมวก', glasses: 'แว่น', hair: 'ทรงผม', face: 'ใบหน้า', cloth: 'ชุด', eyes: 'ตา', set: 'ชุดเซ็ต', back: 'ติดหลัง',
};

export interface FashionDef {
  id: string;
  slot: FashionSlot;
  name: string;
}

/** "none" is the empty choice; slots without it always show something. The list is in config/game.json. */
export { FASHION } from './config';

export const fashionIn = (slot: FashionSlot) => FASHION.filter((f) => f.slot === slot);
export const fashionDef = (slot: FashionSlot, id: string) => FASHION.find((f) => f.slot === slot && f.id === id);

export type Look = Record<FashionSlot, string>;

export const DEFAULT_LOOK: Look = {
  hat: 'none', glasses: 'none', hair: 'short', face: 'none', cloth: 'tee', eyes: 'round', set: 'none', back: 'none',
};

// ------------------------------------------------------------------ equipment

export type EquipSlot = 'necklace' | 'ring' | 'bracelet' | 'charm';
export const EQUIP_SLOTS: EquipSlot[] = ['necklace', 'ring', 'bracelet', 'charm'];
export const EQUIP_SLOT_NAME: Record<EquipSlot, string> = { necklace: 'สร้อยคอ', ring: 'แหวน', bracelet: 'กำไล', charm: 'เครื่องราง' };

/** Bonuses in display units: hp flat, the rest in percent. Negative = a cost. */
export interface Stats {
  hp: number;
  atk: number; // % more damage dealt
  def: number; // % less damage taken
  move: number; // % more walking per turn
}

/** One "point" of each stat; a piece's points must sum to zero. */
export { STAT_POINT } from './config';
export const STAT_NAME: Record<keyof Stats, string> = { hp: 'HP', atk: 'โจมตี', def: 'ป้องกัน', move: 'เดิน' };

export interface EquipDef {
  id: string;
  slot: EquipSlot;
  name: string;
  stats: Partial<Stats>;
  /** Icon colours: metal and gem. */
  color: [number, number];
}

export { EQUIPMENT } from './config';

export const equipIn = (slot: EquipSlot) => EQUIPMENT.filter((e) => e.slot === slot);
export const equipDef = (slot: EquipSlot, id: string) => EQUIPMENT.find((e) => e.slot === slot && e.id === id);

export type Equipment = Record<EquipSlot, string>;
export const DEFAULT_EQUIPMENT: Equipment = { necklace: 'none', ring: 'none', bracelet: 'none', charm: 'none' };

// ------------------------------------------------------------------ loadout

export interface Loadout {
  weapon: WeaponId;
  look: Look;
  equip: Equipment;
  /** Show-off toggles: the item stays worn, just not drawn. */
  hide: { hat: boolean; glasses: boolean };
}

export const DEFAULT_LOADOUT: Loadout = {
  weapon: 'cannon', look: DEFAULT_LOOK, equip: DEFAULT_EQUIPMENT, hide: { hat: false, glasses: false },
};

export function copyLoadout(l: Loadout): Loadout {
  return { weapon: l.weapon, look: { ...l.look }, equip: { ...l.equip }, hide: { ...l.hide } };
}

export function sumStats(l: Loadout): Stats {
  const total: Stats = { hp: 0, atk: 0, def: 0, move: 0 };
  for (const slot of EQUIP_SLOTS) {
    const s = equipDef(slot, l.equip[slot])?.stats ?? {};
    for (const k of Object.keys(total) as (keyof Stats)[]) total[k] += s[k] ?? 0;
  }
  return total;
}

/** What the simulation uses: max HP and multipliers. */
export interface TankStats {
  maxHp: number;
  atk: number; // damage dealt multiplier
  def: number; // damage taken multiplier
  move: number; // walking fuel multiplier
}

export function tankStats(l: Loadout): TankStats {
  const s = sumStats(l);
  return { maxHp: TUNING.maxHp + s.hp, atk: 1 + s.atk / 100, def: 1 - s.def / 100, move: 1 + s.move / 100 };
}

/** Anything from the network or storage: unknown or misplaced ids fall back to the default. */
export function cleanLoadout(raw: unknown): Loadout {
  const l = (raw ?? {}) as Partial<Loadout>;
  const out = copyLoadout(DEFAULT_LOADOUT);
  if (MAIN_WEAPONS.includes(l.weapon!)) out.weapon = l.weapon!;
  for (const slot of FASHION_SLOTS) {
    const id = l.look?.[slot];
    if (typeof id === 'string' && fashionDef(slot, id)) out.look[slot] = id;
  }
  for (const slot of EQUIP_SLOTS) {
    const id = l.equip?.[slot];
    if (typeof id === 'string' && equipDef(slot, id)) out.equip[slot] = id;
  }
  out.hide = { hat: !!l.hide?.hat, glasses: !!l.hide?.glasses };
  return out;
}

export function randomLoadout(rng: Rng): Loadout {
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const l = copyLoadout(DEFAULT_LOADOUT);
  l.weapon = pick(MAIN_WEAPONS);
  for (const slot of FASHION_SLOTS) l.look[slot] = slot === 'set' ? 'none' : pick(fashionIn(slot)).id;
  for (const slot of EQUIP_SLOTS) l.equip[slot] = pick(equipIn(slot)).id;
  return l;
}

/** Stable string for caching the composed sprite of a loadout. */
export function lookId(l: Loadout): string {
  const parts = FASHION_SLOTS.map((s) => l.look[s]);
  return `${parts.join('-')}-${l.hide.hat ? 1 : 0}${l.hide.glasses ? 1 : 0}`;
}
