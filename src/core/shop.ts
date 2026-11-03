import { GameConfig, Reward, currentConfig } from './config';
import { DEFAULT_LOOK, EQUIP_SLOTS, FASHION_SLOTS, Loadout, Price, copyLoadout } from './gear';

// What players own and what things cost. Shared by the server (which enforces it)
// and the client (which shows locks and prices). Free pieces (no price, not exclusive)
// belong to everyone; everything else is owned by key, "fashion:<slot>/<id>" or
// "equip:<slot>/<id>".
//
// Every function reads an explicit config (default: the live one). The server passes
// its published config: its global numbers switch between matches, and a purchase
// spans several awaits.

export type ItemKind = 'fashion' | 'equip';

export const itemKey = (kind: ItemKind, slot: string, id: string) => `${kind}:${slot}/${id}`;

export function parseItemKey(key: string): { kind: ItemKind; slot: string; id: string } | null {
  const m = /^(fashion|equip):([a-z]+)\/([a-z0-9]+)$/.exec(key);
  return m ? { kind: m[1] as ItemKind, slot: m[2], id: m[3] } : null;
}

function def(cfg: GameConfig, kind: ItemKind, slot: string, id: string): { price?: Price; exclusive?: boolean; name: string } | undefined {
  const list: { slot: string; id: string; name: string; price?: Price; exclusive?: boolean }[] = kind === 'fashion' ? cfg.fashion : cfg.equipment;
  return list.find((d) => d.slot === slot && d.id === id);
}

export function itemName(key: string, cfg = currentConfig()): string {
  const k = parseItemKey(key);
  return (k && def(cfg, k.kind, k.slot, k.id)?.name) ?? key;
}

/** Everyone has it without buying. */
export function isFree(kind: ItemKind, slot: string, id: string, cfg = currentConfig()): boolean {
  const d = def(cfg, kind, slot, id);
  return !!d && !d.price && !d.exclusive;
}

/** Its shop price, or null when it is free, exclusive or unknown. */
export function priceOf(kind: ItemKind, slot: string, id: string, cfg = currentConfig()): Price | null {
  return def(cfg, kind, slot, id)?.price ?? null;
}

export function owns(owned: ReadonlySet<string>, kind: ItemKind, slot: string, id: string, cfg = currentConfig()): boolean {
  return isFree(kind, slot, id, cfg) || owned.has(itemKey(kind, slot, id));
}

/** The loadout with every piece the player doesn't own swapped for the default. */
export function enforceOwned(l: Loadout, owned: ReadonlySet<string>, cfg = currentConfig()): Loadout {
  const out = copyLoadout(l);
  for (const slot of FASHION_SLOTS) if (!owns(owned, 'fashion', slot, out.look[slot], cfg)) out.look[slot] = DEFAULT_LOOK[slot];
  for (const slot of EQUIP_SLOTS) if (!owns(owned, 'equip', slot, out.equip[slot], cfg)) out.equip[slot] = 'none';
  return out;
}

export const priceText = (p: Price) => (p.gems ? `${p.gems} เพชร` : `${p.coins} เหรียญ`);

// ------------------------------------------------------------------ Battle Pass

/** Tier reached with this much XP (0 = none yet); tiers are numbered from 1. */
export function tierOf(xp: number, cfg = currentConfig()): number {
  return Math.min(cfg.season.tiers.length, Math.floor(xp / cfg.season.xpPerTier));
}

export const seasonOver = (cfg = currentConfig(), now = Date.now()) => now > Date.parse(cfg.season.endsAt);

export type Track = 'free' | 'premium';
export const claimKey = (tier: number, track: Track) => `${track}:${tier}`;

export function rewardOf(tier: number, track: Track, cfg = currentConfig()): Reward | null {
  return cfg.season.tiers[tier - 1]?.[track] ?? null;
}

export function rewardText(r: Reward, cfg = currentConfig()): string {
  if ('coins' in r) return `${r.coins} เหรียญ`;
  if ('gems' in r) return `${r.gems} เพชร`;
  return itemName(r.item, cfg);
}

/** Coins and XP for one finished match. */
export function matchPay(won: boolean, cfg = currentConfig()): { coins: number; xp: number } {
  const e = cfg.economy;
  return won ? { coins: e.winCoins, xp: e.winXp } : { coins: e.lossCoins, xp: e.lossXp };
}
