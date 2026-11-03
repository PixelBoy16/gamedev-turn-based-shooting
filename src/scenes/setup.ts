import Phaser from 'phaser';
import { Difficulty } from '../core/BotAI';
import { ItemId } from '../core/data';
import { DEFAULT_LOADOUT, Loadout, cleanLoadout, copyLoadout } from '../core/gear';
import { MapId } from '../core/Maps';
import { account } from '../net/account';
import { enforceOwned } from '../core/shop';

export type Format = '1v1' | '1v2' | '2v2';

export interface MatchSetup {
  loadout: Loadout;
  items: ItemId[];
  map: MapId;
  format: Format;
  difficulty: Difficulty;
}

export const FORMAT_LABEL: Record<Format, string> = { '1v1': '1 v 1', '1v2': '1 v 2', '2v2': '2 v 2 (มีเพื่อนบอท)' };
export const DIFF_LABEL: Record<Difficulty, string> = { easy: 'ง่าย', normal: 'ปกติ', hard: 'ยาก' };

const DEFAULT: MatchSetup = { loadout: DEFAULT_LOADOUT, items: ['double', 'heal', 'armor'], map: 'hills', format: '1v1', difficulty: 'normal' };

/** The last setup lives in the registry (and localStorage, so a reload remembers it). */
export function loadSetup(registry: Phaser.Data.DataManager): MatchSetup {
  const cur = registry.get('setup') as MatchSetup | undefined;
  if (cur) return { ...cur, loadout: copyLoadout(cur.loadout), items: [...cur.items] };
  try {
    const saved = JSON.parse(localStorage.getItem('crater-clash:setup') ?? 'null');
    // older saves had a fixed character instead of a loadout
    if (saved) return { ...DEFAULT, ...saved, loadout: cleanLoadout(saved.loadout) };
  } catch {
    // storage blocked or corrupt: fall back to defaults
  }
  return { ...DEFAULT, loadout: copyLoadout(DEFAULT.loadout), items: [...DEFAULT.items] };
}

export function saveSetup(registry: Phaser.Data.DataManager, setup: MatchSetup): void {
  registry.set('setup', setup);
  account.save({ loadout: setup.loadout, items: setup.items }).catch(() => undefined); // offline: kept locally
  store(setup);
}

function store(setup: MatchSetup): void {
  try {
    localStorage.setItem('crater-clash:setup', JSON.stringify(setup));
  } catch {
    // ignore: the registry copy is enough for this session
  }
}

/**
 * The account's saved wardrobe wins over this device's (it follows the player
 * between devices). An account with nothing saved yet takes this device's.
 */
export function syncSetup(registry: Phaser.Data.DataManager): void {
  const a = account.view;
  if (!a) return;
  const setup = loadSetup(registry);
  if (a.loadout && a.items) {
    const next = { ...setup, loadout: enforceOwned(cleanLoadout(a.loadout), account.owned()), items: [...a.items] };
    registry.set('setup', next);
    store(next);
  } else {
    const next = { ...setup, loadout: enforceOwned(setup.loadout, account.owned()) };
    registry.set('setup', next);
    store(next);
    account.save({ loadout: next.loadout, items: next.items }).catch(() => undefined);
  }
}
