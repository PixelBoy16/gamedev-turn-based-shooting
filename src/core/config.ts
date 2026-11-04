import GAME_JSON from '../../config/game.json';
import type { ItemId, SkillId, WeaponDef, WeaponId } from './data';
import type { EquipDef, EquipSlot, FashionDef, FashionSlot, Stats } from './gear';

// Every number and content list the game masters tune lives in config/game.json.
// The objects below are live: applyConfig() rewrites them in place, so code that
// imported them sees the new values. Online, the server sends its config with each
// match so both sides simulate with the same numbers. Run `npm run check-config`
// after editing the file.

export interface Rules {
  gravity: number; // px/s²
  windAccel: number; // px/s² per wind unit
  maxWind: number;
  launchSpeedPerPower: number; // power 100 → 950 px/s
  walkSpeed: number; // px/s
  fuelPerTurn: number; // px of walking per turn, before gear
  safeFall: number; // px fallen before fall damage starts
  fallDamagePerPx: number;
  maxHp: number; // before gear
  turnSeconds: number;
  chargeSeconds: number;
  wall: { height: number; width: number; gap: number };
  suddenDeathTurn: number;
  waterRisePerTurn: number;
}

export interface Limits {
  drillUses: number; // drill shots per match
  skillCooldown: number; // own turns to wait after a skill
  stormSplit: number; // fragments of a split rocket during "storm"
  itemsPerMatch: number;
}

/**
 * Turn order: everyone has a delay, the lowest plays next, and each turn adds its cost.
 * A heavy turn (big weapon, an item, a long walk, a slow aim) waits longer for the next one.
 */
export interface DelayRules {
  shot: number; // a turn that fired
  pass: number; // a turn that did not fire (timeout, burrow)
  skill: number; // extra when a skill was used
  perSecond: number; // per second spent before acting
  perPx: number; // per px walked
  weapons: Record<WeaponId, number>; // extra per weapon fired
  items: Record<ItemId, number>; // extra per item used
}

export interface ItemValues {
  doubleScale: number;
  powerScale: number;
  heal: number;
  armorScale: number;
}

/** Coins and Battle Pass XP for playing; only matches with two or more players' accounts pay out. */
export interface Economy {
  startCoins: number; // a new account's purse
  startGems: number;
  winCoins: number;
  lossCoins: number;
  winXp: number;
  lossXp: number;
  minTurns: number; // shorter matches (an instant forfeit) pay nothing
}

/** One Battle Pass reward: currency, or a fashion/equipment piece as "fashion:<slot>/<id>" / "equip:<slot>/<id>". */
export type Reward = { coins: number } | { gems: number } | { item: string };

export interface Season {
  id: string; // a new id starts everyone's pass from zero
  name: string;
  endsAt: string; // ISO date; after this no XP is earned and nothing can be claimed
  xpPerTier: number;
  premiumGems: number; // price of the premium track
  tiers: { free?: Reward; premium?: Reward }[];
}

export interface GameConfig {
  rules: Rules;
  limits: Limits;
  delay: DelayRules;
  weapons: Record<WeaponId, Omit<WeaponDef, 'id'>>;
  skills: Record<SkillId, { name: string; desc: string }>;
  items: Record<ItemId, { name: string; desc: string }>;
  itemValues: ItemValues;
  statPoint: Stats;
  /** Icon colours as "#rrggbb": metal and gem. */
  equipment: (Omit<EquipDef, 'color'> & { color: [string, string] })[];
  fashion: FashionDef[];
  economy: Economy;
  season: Season;
}

// Ids the code has behaviour for: their numbers and names are config, the set is not.
export const WEAPON_IDS: WeaponId[] = ['cannon', 'hammer', 'splitter', 'shovel', 'drill', 'bouncer', 'beam', 'mortar', 'magnet', 'dirtbomb'];
export const SKILL_IDS: SkillId[] = ['calm', 'wall', 'storm', 'burrow', 'rebound', 'pierce', 'barrage', 'vortex', 'landslide'];
export const ITEM_IDS: ItemId[] = ['double', 'power', 'warp', 'heal', 'armor'];
const STAT_KEYS: (keyof Stats)[] = ['hp', 'atk', 'def', 'move'];
const EQUIP_SLOT_IDS: EquipSlot[] = ['necklace', 'ring', 'bracelet', 'charm'];
const FASHION_SLOT_IDS: FashionSlot[] = ['hat', 'glasses', 'hair', 'face', 'cloth', 'eyes', 'set', 'back'];
/** Slots that must offer "none" (the rest always show something). */
const OPTIONAL_SLOTS: FashionSlot[] = ['hat', 'glasses', 'face', 'set', 'back'];
/** Ids the default look starts in, so they must stay. */
export const DEFAULT_PIECES: Partial<Record<FashionSlot, string>> = { hair: 'buzz', cloth: 'tank', eyes: 'glare' };

// ------------------------------------------------------------------ live values

export const BUNDLED = GAME_JSON as unknown as GameConfig;

/** Simulation constants: engine internals here, tunable rules from the config. */
export const TUNING = {
  dt: 1 / 60, // fixed simulation step (s)
  maxProjectileSpeed: 1600,
  subStepPx: 2, // collision check spacing for projectiles (prevents tunneling)
  tankRadius: 20, // hit circle around the character's centre
  tankCentreOffset: 22, // centre is this far above the feet
  muzzleLength: 30,
  maxClimb: 12, // px step-up while walking
  ...structuredClone(BUNDLED.rules),
};

export const LIMITS: Limits = { ...BUNDLED.limits };
export const DELAY: DelayRules = structuredClone(BUNDLED.delay);
export const WEAPONS = {} as Record<WeaponId, WeaponDef>;
export const SKILLS = {} as Record<SkillId, { name: string; desc: string }>;
export const ITEMS = {} as Record<ItemId, { name: string; desc: string }>;
export const ITEM_VALUES: ItemValues = { ...BUNDLED.itemValues };
export const STAT_POINT: Stats = { ...BUNDLED.statPoint };
export const EQUIPMENT: EquipDef[] = [];
export const FASHION: FashionDef[] = [];


let current: GameConfig = BUNDLED;

/** The config in effect (what the server sends to clients). */
export const currentConfig = (): GameConfig => current;

const color = (hex: string) => parseInt(hex.slice(1), 16);

/** Make `cfg` the live config. Call only with a config that validateConfig() passed; don't change it afterwards. */
export function applyConfig(cfg: GameConfig): void {
  current = cfg;
  const c = current;
  Object.assign(TUNING, structuredClone(c.rules));
  Object.assign(LIMITS, c.limits);
  Object.assign(DELAY, structuredClone(c.delay));
  Object.assign(ITEM_VALUES, c.itemValues);
  Object.assign(STAT_POINT, c.statPoint);
  for (const id of WEAPON_IDS) {
    // replace, not merge: a weapon can lose its split or drill
    const w = (WEAPONS[id] ??= { id } as WeaponDef);
    for (const k of Object.keys(w)) if (k !== 'id') delete (w as unknown as Record<string, unknown>)[k];
    Object.assign(w, structuredClone(c.weapons[id]), { id });
  }
  for (const id of SKILL_IDS) SKILLS[id] = { ...c.skills[id] };
  for (const id of ITEM_IDS) ITEMS[id] = { ...c.items[id] };
  EQUIPMENT.splice(0, EQUIPMENT.length, ...c.equipment.map((e) => ({
    ...structuredClone(e), color: [color(e.color[0]), color(e.color[1])] as [number, number],
  })));
  FASHION.splice(0, FASHION.length, ...c.fashion.map((f) => structuredClone(f)));
}

applyConfig(BUNDLED);

/** applyConfig, skipped when `cfg` is already live: cheap to call on every entry point. */
export function useConfig(cfg: GameConfig): void {
  if (current !== cfg) applyConfig(cfg);
}

// ------------------------------------------------------------------ validation

export interface ConfigReport {
  /** The config cannot be used. */
  errors: string[];
  /** Usable, but probably not what was meant (e.g. an unbalanced equipment piece). */
  warnings: string[];
}

/** Check a config from a file or the network before applying it. Messages are in Thai for the game masters. */
export function validateConfig(raw: unknown): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const obj = (path: string, v: unknown): Record<string, unknown> | null => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    errors.push(`${path}: ต้องเป็นกลุ่มค่า { }`);
    return null;
  };
  const num = (path: string, v: unknown, min: number, max: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${path}: ต้องเป็นตัวเลข`);
    else if (v < min || v > max) errors.push(`${path}: ${v} อยู่นอกช่วง ${min}–${max}`);
  };
  const int = (path: string, v: unknown, min: number, max: number) => {
    num(path, v, min, max);
    if (typeof v === 'number' && !Number.isInteger(v)) errors.push(`${path}: ต้องเป็นจำนวนเต็ม`);
  };
  const text = (path: string, v: unknown, max = 80) => {
    if (typeof v !== 'string' || !v.trim()) errors.push(`${path}: ต้องเป็นข้อความที่ไม่ว่าง`);
    else if (v.length > max) errors.push(`${path}: ยาวเกิน ${max} ตัวอักษร`);
  };
  const keys = (path: string, o: Record<string, unknown>, want: readonly string[]) => {
    for (const k of want) if (!(k in o)) errors.push(`${path}.${k}: หายไป`);
    for (const k of Object.keys(o)) if (!want.includes(k)) errors.push(`${path}.${k}: ไม่รู้จักชื่อนี้`);
  };

  const root = obj('config', raw);
  if (!root) return { errors, warnings };
  keys('config', root, ['rules', 'limits', 'delay', 'weapons', 'skills', 'items', 'itemValues', 'statPoint', 'equipment', 'fashion', 'economy', 'season']);
  /** A price in one currency: whole coins or gems; `coinsOnly` for equipment. */
  const price = (path: string, v: unknown, coinsOnly: boolean) => {
    if (v === undefined) return;
    const pr = obj(path, v);
    if (!pr) return;
    const ks = Object.keys(pr);
    if (ks.length !== 1 || (ks[0] !== 'coins' && ks[0] !== 'gems')) return errors.push(`${path}: ต้องเป็น { "coins": n } หรือ { "gems": n } อย่างใดอย่างหนึ่ง`);
    int(`${path}.${ks[0]}`, pr[ks[0]], 1, 1_000_000);
    if (coinsOnly && ks[0] === 'gems') errors.push(`${path}: อุปกรณ์ขายด้วยเหรียญเท่านั้น (ไม่ขายพลังด้วยเงินจริง)`);
  };

  const r = obj('rules', root.rules);
  if (r) {
    keys('rules', r, [
      'gravity', 'windAccel', 'maxWind', 'launchSpeedPerPower', 'walkSpeed', 'fuelPerTurn', 'safeFall', 'fallDamagePerPx',
      'maxHp', 'turnSeconds', 'chargeSeconds', 'wall', 'suddenDeathTurn', 'waterRisePerTurn',
    ]);
    num('rules.gravity', r.gravity, 50, 2000);
    num('rules.windAccel', r.windAccel, 0, 200);
    int('rules.maxWind', r.maxWind, 0, 20);
    num('rules.launchSpeedPerPower', r.launchSpeedPerPower, 1, 30);
    num('rules.walkSpeed', r.walkSpeed, 10, 400);
    num('rules.fuelPerTurn', r.fuelPerTurn, 0, 2000);
    num('rules.safeFall', r.safeFall, 0, 2000);
    num('rules.fallDamagePerPx', r.fallDamagePerPx, 0, 50);
    int('rules.maxHp', r.maxHp, 100, 100000);
    num('rules.turnSeconds', r.turnSeconds, 5, 120);
    num('rules.chargeSeconds', r.chargeSeconds, 0.3, 10);
    const w = obj('rules.wall', r.wall);
    if (w) {
      num('rules.wall.height', w.height, 0, 400);
      num('rules.wall.width', w.width, 4, 200);
      num('rules.wall.gap', w.gap, 0, 300);
    }
    int('rules.suddenDeathTurn', r.suddenDeathTurn, 1, 999);
    num('rules.waterRisePerTurn', r.waterRisePerTurn, 0, 500);
  }

  const l = obj('limits', root.limits);
  if (l) {
    keys('limits', l, ['drillUses', 'skillCooldown', 'stormSplit', 'itemsPerMatch']);
    int('limits.drillUses', l.drillUses, 0, 20);
    int('limits.skillCooldown', l.skillCooldown, 0, 20);
    int('limits.stormSplit', l.stormSplit, 1, 12);
    int('limits.itemsPerMatch', l.itemsPerMatch, 0, ITEM_IDS.length);
  }

  const d = obj('delay', root.delay);
  if (d) {
    keys('delay', d, ['shot', 'pass', 'skill', 'perSecond', 'perPx', 'weapons', 'items']);
    for (const k of ['shot', 'pass', 'skill', 'perSecond', 'perPx']) num(`delay.${k}`, d[k], 0, 5000);
    const dw = obj('delay.weapons', d.weapons);
    if (dw) {
      keys('delay.weapons', dw, WEAPON_IDS);
      for (const id of WEAPON_IDS) num(`delay.weapons.${id}`, dw[id], 0, 5000);
    }
    const di = obj('delay.items', d.items);
    if (di) {
      keys('delay.items', di, ITEM_IDS);
      for (const id of ITEM_IDS) num(`delay.items.${id}`, di[id], 0, 5000);
    }
  }

  const ws = obj('weapons', root.weapons);
  if (ws) {
    keys('weapons', ws, WEAPON_IDS);
    for (const id of WEAPON_IDS) {
      const w = ws[id] === undefined ? null : obj(`weapons.${id}`, ws[id]);
      if (!w) continue;
      const p = `weapons.${id}`;
      text(`${p}.name`, w.name, 30);
      text(`${p}.desc`, w.desc);
      num(`${p}.damage`, w.damage, 0, 5000);
      num(`${p}.radius`, w.radius, 4, 200);
      num(`${p}.knockback`, w.knockback, 0, 2000);
      num(`${p}.windMul`, w.windMul, 0, 5);
      num(`${p}.gravityMul`, w.gravityMul, 0, 5);
      if (w.speedMul !== undefined) num(`${p}.speedMul`, w.speedMul, 0.3, 3);
      if (w.split !== undefined) {
        const s = obj(`${p}.split`, w.split);
        if (s) {
          int(`${p}.split.count`, s.count, 2, 12);
          num(`${p}.split.spreadVx`, s.spreadVx, 0, 500);
        }
      }
      if (w.drill !== undefined) {
        const d = obj(`${p}.drill`, w.drill);
        if (d) {
          num(`${p}.drill.length`, d.length, 10, 1000);
          num(`${p}.drill.carveRadius`, d.carveRadius, 2, 60);
        }
      }
      const part = (key: string, ranges: Record<string, [number, number, boolean?]>) => {
        if (w[key] === undefined) return;
        const o = obj(`${p}.${key}`, w[key]);
        if (!o) return;
        keys(`${p}.${key}`, o, Object.keys(ranges));
        for (const [k, [min, max, whole]] of Object.entries(ranges)) (whole ? int : num)(`${p}.${key}.${k}`, o[k], min, max);
      };
      part('bounce', { count: [1, 8, true], keep: [0.1, 1], boost: [0, 8, true] });
      if (w.pierce !== undefined) num(`${p}.pierce`, w.pierce, 0, 1000);
      part('cluster', {
        count: [1, 12, true], boostCount: [1, 12, true], damage: [0, 5000], radius: [4, 200], knockback: [0, 2000],
        spreadVx: [0, 500], lift: [0, 1500],
      });
      part('pull', { force: [0, 2000], radius: [10, 800], boostRadius: [10, 800] });
      part('mound', { radius: [4, 200], boostRadius: [4, 200] });
      const needs: Partial<Record<WeaponId, [string, string]>> = {
        splitter: ['split', 'จรวดแตกต้องมีค่าการแตก'], drill: ['drill', 'สว่านต้องมีค่าการเจาะ'],
        bouncer: ['bounce', 'ลูกเด้งต้องมีค่าการเด้ง'], beam: ['pierce', 'ปืนลำแสงต้องมีระยะทะลวง'],
        mortar: ['cluster', 'ครกต้องมีค่าลูกปราย'], magnet: ['pull', 'ระเบิดแม่เหล็กต้องมีค่าการดูด'], dirtbomb: ['mound', 'ระเบิดดินต้องมีขนาดเนินดิน'],
      };
      const need = needs[id];
      if (need && w[need[0]] === undefined) errors.push(`${p}.${need[0]}: ${need[1]}`);
      const main = id !== 'drill';
      if (main && !SKILL_IDS.includes(w.skill as SkillId)) errors.push(`${p}.skill: ต้องเป็นหนึ่งใน ${SKILL_IDS.join(', ')}`);
      if (!main && w.skill !== undefined) errors.push(`${p}.skill: สว่านเป็นอาวุธรอง ไม่มีสกิล`);
    }
  }

  for (const [group, ids] of [['skills', SKILL_IDS], ['items', ITEM_IDS]] as const) {
    const g = obj(group, root[group]);
    if (!g) continue;
    keys(group, g, ids);
    for (const id of ids) {
      const e = g[id] === undefined ? null : obj(`${group}.${id}`, g[id]);
      if (!e) continue;
      text(`${group}.${id}.name`, e.name, 30);
      text(`${group}.${id}.desc`, e.desc);
    }
  }

  const iv = obj('itemValues', root.itemValues);
  if (iv) {
    keys('itemValues', iv, ['doubleScale', 'powerScale', 'heal', 'armorScale']);
    num('itemValues.doubleScale', iv.doubleScale, 0, 2);
    num('itemValues.powerScale', iv.powerScale, 1, 3);
    num('itemValues.heal', iv.heal, 0, 5000);
    num('itemValues.armorScale', iv.armorScale, 0, 1);
  }

  const sp = obj('statPoint', root.statPoint);
  if (sp) {
    keys('statPoint', sp, STAT_KEYS);
    for (const k of STAT_KEYS) num(`statPoint.${k}`, sp[k], 0.01, 1000);
  }
  const spOk = !!sp && STAT_KEYS.every((k) => typeof sp[k] === 'number' && (sp[k] as number) > 0);

  if (!Array.isArray(root.equipment)) errors.push('equipment: ต้องเป็นรายการ [ ]');
  else {
    const seen = new Set<string>();
    root.equipment.forEach((raw, i) => {
      const e = obj(`equipment[${i}]`, raw);
      if (!e) return;
      const p = `equipment[${i}] (${String(e.id)})`;
      if (typeof e.id !== 'string' || !/^[a-z][a-z0-9]*$/.test(e.id)) errors.push(`${p}.id: ใช้ a-z และตัวเลข ขึ้นต้นด้วยตัวอักษร`);
      if (!EQUIP_SLOT_IDS.includes(e.slot as EquipSlot)) errors.push(`${p}.slot: ต้องเป็นหนึ่งใน ${EQUIP_SLOT_IDS.join(', ')}`);
      const key = `${String(e.slot)}/${String(e.id)}`;
      if (seen.has(key)) errors.push(`${p}: id ซ้ำในช่องเดียวกัน`);
      seen.add(key);
      text(`${p}.name`, e.name, 30);
      if (e.id === 'none' && e.price) errors.push(`${p}: "ไม่ใส่" ต้องฟรี`);
      const st = obj(`${p}.stats`, e.stats);
      if (st) {
        for (const k of Object.keys(st)) {
          if (!STAT_KEYS.includes(k as keyof Stats)) errors.push(`${p}.stats.${k}: ไม่รู้จักค่าสถานะนี้`);
          else num(`${p}.stats.${k}`, st[k], -1000, 1000);
        }
        const vals = Object.entries(st);
        if (spOk && vals.every(([k, v]) => STAT_KEYS.includes(k as keyof Stats) && typeof v === 'number' && Number.isFinite(v))) {
          const points = vals.reduce((s, [k, v]) => s + (v as number) / (sp![k] as number), 0);
          if (Math.abs(points) > 1e-6) warnings.push(`${p}: ได้กับเสียไม่เท่ากัน (${points > 0 ? '+' : ''}${Math.round(points * 100) / 100} แต้ม)`);
        }
      }
      price(`${p}.price`, e.price, true);
      if (!Array.isArray(e.color) || e.color.length !== 2 || !e.color.every((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))) {
        errors.push(`${p}.color: ต้องเป็น ["#rrggbb", "#rrggbb"]`);
      }
    });
    for (const s of EQUIP_SLOT_IDS) if (!seen.has(`${s}/none`)) errors.push(`equipment: ช่อง ${s} ต้องมี id "none" (ไม่ใส่)`);
  }

  if (!Array.isArray(root.fashion)) errors.push('fashion: ต้องเป็นรายการ [ ]');
  else {
    const seen = new Set<string>();
    root.fashion.forEach((raw, i) => {
      const f = obj(`fashion[${i}]`, raw);
      if (!f) return;
      const p = `fashion[${i}] (${String(f.id)})`;
      if (typeof f.id !== 'string' || !/^[a-z][a-z0-9]*$/.test(f.id)) errors.push(`${p}.id: ใช้ a-z และตัวเลข ขึ้นต้นด้วยตัวอักษร`);
      if (!FASHION_SLOT_IDS.includes(f.slot as FashionSlot)) errors.push(`${p}.slot: ต้องเป็นหนึ่งใน ${FASHION_SLOT_IDS.join(', ')}`);
      const key = `${String(f.slot)}/${String(f.id)}`;
      if (seen.has(key)) errors.push(`${p}: id ซ้ำในช่องเดียวกัน`);
      seen.add(key);
      text(`${p}.name`, f.name, 30);
      price(`${p}.price`, f.price, false);
      if (f.exclusive !== undefined && typeof f.exclusive !== 'boolean') errors.push(`${p}.exclusive: ต้องเป็น true หรือ false`);
      if (f.exclusive && f.price) errors.push(`${p}: ของเฉพาะ (exclusive) ไม่มีราคาขาย`);
      const isDefault = f.id === 'none' || DEFAULT_PIECES[f.slot as FashionSlot] === f.id;
      if (isDefault && (f.price || f.exclusive)) errors.push(`${p}: ชิ้นเริ่มต้นต้องฟรี`);
    });
    for (const s of OPTIONAL_SLOTS) if (!seen.has(`${s}/none`)) errors.push(`fashion: ช่อง ${s} ต้องมี id "none" (ไม่ใส่)`);
    for (const [s, id] of Object.entries(DEFAULT_PIECES)) if (!seen.has(`${s}/${id}`)) errors.push(`fashion: ต้องมี ${s} "${id}" (ชุดเริ่มต้น)`);
    for (const s of FASHION_SLOT_IDS) {
      if (!OPTIONAL_SLOTS.includes(s) && seen.has(`${s}/none`)) errors.push(`fashion: ช่อง ${s} ต้องใส่เสมอ ห้ามมี "none"`);
    }
  }

  const ec = obj('economy', root.economy);
  if (ec) {
    keys('economy', ec, ['startCoins', 'startGems', 'winCoins', 'lossCoins', 'winXp', 'lossXp', 'minTurns']);
    for (const k of ['startCoins', 'startGems', 'winCoins', 'lossCoins', 'winXp', 'lossXp']) int(`economy.${k}`, ec[k], 0, 100_000);
    int('economy.minTurns', ec.minTurns, 0, 100);
  }

  const se = obj('season', root.season);
  if (se) {
    keys('season', se, ['id', 'name', 'endsAt', 'xpPerTier', 'premiumGems', 'tiers']);
    if (typeof se.id !== 'string' || !/^[a-z0-9-]{1,30}$/.test(se.id)) errors.push('season.id: ใช้ a-z ตัวเลข และ - ยาวไม่เกิน 30');
    text('season.name', se.name, 40);
    if (typeof se.endsAt !== 'string' || Number.isNaN(Date.parse(se.endsAt))) errors.push('season.endsAt: ต้องเป็นวันที่ เช่น 2027-01-31T23:59:00+07:00');
    int('season.xpPerTier', se.xpPerTier, 1, 100_000);
    int('season.premiumGems', se.premiumGems, 0, 1_000_000);
    if (!Array.isArray(se.tiers) || se.tiers.length < 1 || se.tiers.length > 100) errors.push('season.tiers: ต้องมี 1–100 ขั้น');
    else {
      const items = new Set<string>();
      if (Array.isArray(root.fashion)) for (const f of root.fashion as FashionDef[]) items.add(`fashion:${f.slot}/${f.id}`);
      if (Array.isArray(root.equipment)) for (const e of root.equipment as EquipDef[]) items.add(`equip:${e.slot}/${e.id}`);
      se.tiers.forEach((raw, i) => {
        const t = obj(`season.tiers[${i}]`, raw);
        if (!t) return;
        for (const track of Object.keys(t)) {
          const p = `season.tiers[${i}].${track}`;
          if (track !== 'free' && track !== 'premium') {
            errors.push(`${p}: ใช้ได้แค่ free หรือ premium`);
            continue;
          }
          const rw = obj(p, t[track]);
          if (!rw) continue;
          const ks = Object.keys(rw);
          if (ks.length !== 1 || !['coins', 'gems', 'item'].includes(ks[0])) errors.push(`${p}: ต้องเป็น { coins }, { gems } หรือ { item }`);
          else if (ks[0] === 'item') {
            if (typeof rw.item !== 'string' || !items.has(rw.item)) errors.push(`${p}.item: ไม่พบ "${String(rw.item)}" (รูปแบบ fashion:<ช่อง>/<id> หรือ equip:<ช่อง>/<id>)`);
            else if (/\/none$/.test(rw.item)) errors.push(`${p}.item: ให้ "ไม่ใส่" เป็นรางวัลไม่ได้`);
          } else int(`${p}.${ks[0]}`, rw[ks[0]], 1, 1_000_000);
        }
      });
    }
  }

  return { errors, warnings };
}
