import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { GameConfig, ITEM_IDS, Reward } from '../src/core/config';
import { ItemId } from '../src/core/data';
import { Loadout, cleanLoadout } from '../src/core/gear';
import {
  Track, claimKey, enforceOwned, isFree, itemKey, matchPay, parseItemKey, priceOf, rewardOf, seasonOver, tierOf,
} from '../src/core/shop';
import type { AccountView, LeaderRow } from '../src/net/protocol';
import { Db } from './db';

// Player accounts. Everyone starts as a guest the first time the game opens (no
// sign-up wall); a guest can later pick a username and password to play on another
// device. Sessions are random tokens; only their hash is stored.
//
// Also the wallet (coins earned by playing, gems as the premium currency), owned
// pieces and Battle Pass progress. Prices, rewards and the season come from the
// published game config, read once at the start of each call (`this.config()`), so a
// publish in the middle of a purchase can't mix two price lists. Every coin and gem
// movement is written to the ledger.

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const RATING_START = 1000;
const ELO_K = 32;

interface Row {
  id: string; // bigint comes back as a string
  username: string | null;
  pass_hash: string | null;
  display_name: string;
  profile: { loadout?: unknown; items?: unknown };
  rating: number;
  played: number;
  wins: number;
  ranked_played: number;
  coins: number;
  gems: number;
}

export interface Account {
  id: number;
  username: string | null;
  displayName: string;
  loadout: Loadout | null;
  items: ItemId[] | null;
  rating: number;
  played: number;
  wins: number;
  rankedPlayed: number;
  coins: number;
  gems: number;
  owned: string[];
  pass: { season: string; xp: number; premium: boolean; claimed: string[] };
}

/** Thrown for anything the player should be told about (shown as is). */
export class AccountError extends Error {}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function cleanItems(raw: unknown, cfg: GameConfig): ItemId[] | null {
  if (!Array.isArray(raw)) return null;
  const items = [...new Set(raw.filter((i): i is ItemId => ITEM_IDS.includes(i)))];
  return items.length === cfg.limits.itemsPerMatch ? items : null;
}

export function accountView(a: Account): AccountView {
  return {
    username: a.username, displayName: a.displayName, loadout: a.loadout, items: a.items,
    rating: a.rating, played: a.played, wins: a.wins, rankedPlayed: a.rankedPlayed,
    coins: a.coins, gems: a.gems, owned: a.owned, pass: a.pass,
  };
}

export function cleanDisplayName(raw: unknown): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 12);
  if (!name) throw new AccountError('ใส่ชื่อที่จะแสดงในเกมก่อน');
  return name;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const got = await scryptAsync(password, Buffer.from(salt, 'hex'), 32);
  const want = Buffer.from(key, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Expected score of a against b (Elo). */
const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

export interface MatchRecord {
  ranked: boolean;
  map: string;
  format: string;
  winner: number;
  turns: number;
  players: { accountId: number | null; name: string; team: number }[];
}

export interface MatchResult {
  /** Ranked rating change by account id. */
  rating: Map<number, number>;
  /** Coins and XP paid by account id (only matches between two or more accounts pay). */
  pay: Map<number, { coins: number; xp: number }>;
}

export class Accounts {
  constructor(private db: Db, private config: () => GameConfig) {}

  /** A row plus what it owns and its pass in the config's season. */
  private async full(r: Row, cfg: GameConfig): Promise<Account> {
    const owned = await this.db.query<{ item: string }>('select item from owned where account_id = $1 order by at', [r.id]);
    const ownedSet = new Set(owned.map((o) => o.item));
    const pass = await this.db.query<{ xp: number; premium: boolean; claimed: string[] }>(
      'select xp, premium, claimed from passes where account_id = $1 and season = $2', [r.id, cfg.season.id]);
    return {
      id: Number(r.id),
      username: r.username,
      displayName: r.display_name,
      // saved before a piece got a price, or the price list changed: wear only what's owned
      loadout: r.profile.loadout ? enforceOwned(cleanLoadout(r.profile.loadout), ownedSet, cfg) : null,
      items: cleanItems(r.profile.items, cfg),
      rating: r.rating,
      played: r.played,
      wins: r.wins,
      rankedPlayed: r.ranked_played,
      coins: r.coins,
      gems: r.gems,
      owned: owned.map((o) => o.item),
      pass: { season: cfg.season.id, xp: pass[0]?.xp ?? 0, premium: pass[0]?.premium ?? false, claimed: pass[0]?.claimed ?? [] },
    };
  }

  private async one(sql: string, params: unknown[], cfg = this.config()): Promise<Account | null> {
    const rows = await this.db.query<Row>(sql, params);
    return rows[0] ? this.full(rows[0], cfg) : null;
  }

  private async newSession(accountId: number): Promise<string> {
    const token = randomBytes(24).toString('hex');
    await this.db.query('insert into sessions (token_hash, account_id) values ($1, $2)', [hashToken(token), accountId]);
    return token;
  }

  private async ledger(id: number, coins: number, gems: number, reason: string): Promise<void> {
    if (coins || gems) await this.db.query('insert into ledger (account_id, coins, gems, reason) values ($1, $2, $3, $4)', [id, coins, gems, reason]);
  }

  async createGuest(): Promise<{ token: string; account: Account }> {
    const cfg = this.config();
    const name = `ผู้เล่น${Math.floor(1000 + Math.random() * 9000)}`;
    const { startCoins, startGems } = cfg.economy;
    const rows = await this.db.query<Row>('insert into accounts (display_name, coins, gems) values ($1, $2, $3) returning *', [name, startCoins, startGems]);
    const id = Number(rows[0].id);
    await this.ledger(id, startCoins, startGems, 'start');
    return { token: await this.newSession(id), account: await this.full(rows[0], cfg) };
  }

  /** The account a session token belongs to, or null. Also marks it as seen. */
  async bySession(token: unknown): Promise<Account | null> {
    if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return null;
    const h = hashToken(token);
    const account = await this.one('select a.* from sessions s join accounts a on a.id = s.account_id where s.token_hash = $1', [h]);
    if (account) {
      await this.db.query('update sessions set last_used = now() where token_hash = $1', [h]);
      await this.db.query('update accounts set last_seen = now() where id = $1', [account.id]);
    }
    return account;
  }

  async get(id: number): Promise<Account | null> {
    return this.one('select * from accounts where id = $1', [id]);
  }

  async byUsername(username: string): Promise<Account | null> {
    return this.one('select * from accounts where username = $1', [String(username).trim().toLowerCase()]);
  }

  /** Give a guest account a username and password, so it can sign in elsewhere. */
  async register(id: number, rawUsername: unknown, password: unknown): Promise<Account> {
    const username = String(rawUsername ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new AccountError('ชื่อผู้ใช้ใช้ a-z ตัวเลข หรือ _ ยาว 3–20 ตัว');
    if (typeof password !== 'string' || password.length < 6) throw new AccountError('รหัสผ่านต้องยาวอย่างน้อย 6 ตัว');
    if (password.length > 200) throw new AccountError('รหัสผ่านยาวเกินไป');
    const cur = await this.get(id);
    if (!cur) throw new AccountError('ไม่พบบัญชี');
    if (cur.username) throw new AccountError('บัญชีนี้ตั้งชื่อผู้ใช้ไปแล้ว');
    const taken = await this.db.query('select 1 from accounts where username = $1', [username]);
    if (taken.length) throw new AccountError('ชื่อผู้ใช้นี้มีคนใช้แล้ว');
    try {
      return (await this.one('update accounts set username = $1, pass_hash = $2 where id = $3 returning *',
        [username, await hashPassword(password), id]))!;
    } catch {
      throw new AccountError('ชื่อผู้ใช้นี้มีคนใช้แล้ว'); // lost a race for the same name
    }
  }

  async login(rawUsername: unknown, password: unknown): Promise<{ token: string; account: Account }> {
    const cfg = this.config();
    const username = String(rawUsername ?? '').trim().toLowerCase();
    const rows = await this.db.query<Row>('select * from accounts where username = $1', [username]);
    const row = rows[0];
    const ok = row?.pass_hash && typeof password === 'string' && (await checkPassword(password, row.pass_hash));
    if (!row || !ok) throw new AccountError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก');
    return { token: await this.newSession(Number(row.id)), account: await this.full(row, cfg) };
  }

  async logout(token: string): Promise<void> {
    await this.db.query('delete from sessions where token_hash = $1', [hashToken(token)]);
  }

  /** Save what the wardrobe shows; fields left out stay as they are. Pieces not owned are dropped. */
  async saveProfile(id: number, p: { displayName?: unknown; loadout?: unknown; items?: unknown }): Promise<Account> {
    const cfg = this.config();
    const cur = await this.get(id);
    if (!cur) throw new AccountError('ไม่พบบัญชี');
    const displayName = p.displayName === undefined ? cur.displayName : cleanDisplayName(p.displayName);
    const loadout = p.loadout === undefined ? cur.loadout : enforceOwned(cleanLoadout(p.loadout), new Set(cur.owned), cfg);
    const items = p.items === undefined ? cur.items : cleanItems(p.items, cfg);
    return (await this.one('update accounts set display_name = $1, profile = $2 where id = $3 returning *',
      [displayName, JSON.stringify({ loadout, items }), id], cfg))!;
  }

  // ---------------------------------------------------------------- wallet

  /** Take coins/gems if there are enough; false otherwise (one statement, so two taps can't overspend). */
  private async spend(id: number, coins: number, gems: number, reason: string): Promise<boolean> {
    const rows = await this.db.query('update accounts set coins = coins - $2, gems = gems - $3 where id = $1 and coins >= $2 and gems >= $3 returning id',
      [id, coins, gems]);
    if (rows.length) await this.ledger(id, -coins, -gems, reason);
    return rows.length > 0;
  }

  private async give(id: number, coins: number, gems: number, reason: string): Promise<void> {
    await this.db.query('update accounts set coins = coins + $2, gems = gems + $3 where id = $1', [id, coins, gems]);
    await this.ledger(id, coins, gems, reason);
  }

  /** Add a piece; false if it was already owned. */
  private async own(id: number, key: string, source: string): Promise<boolean> {
    const rows = await this.db.query('insert into owned (account_id, item, source) values ($1, $2, $3) on conflict do nothing returning item', [id, key, source]);
    return rows.length > 0;
  }

  /** Buy a shop piece by key ("fashion:hat/crown"). */
  async buy(id: number, key: unknown): Promise<Account> {
    const cfg = this.config();
    const k = typeof key === 'string' ? parseItemKey(key) : null;
    const price = k && priceOf(k.kind, k.slot, k.id, cfg);
    if (!k || !price) throw new AccountError(k && isFree(k.kind, k.slot, k.id, cfg) ? 'ชิ้นนี้ฟรีอยู่แล้ว' : 'ชิ้นนี้ไม่ได้วางขาย');
    const item = itemKey(k.kind, k.slot, k.id);
    const cur = await this.get(id);
    if (!cur) throw new AccountError('ไม่พบบัญชี');
    if (cur.owned.includes(item)) throw new AccountError('มีชิ้นนี้อยู่แล้ว');
    if (!(await this.spend(id, price.coins ?? 0, price.gems ?? 0, `buy ${item}`))) {
      throw new AccountError(price.gems ? 'เพชรไม่พอ' : 'เหรียญไม่พอ');
    }
    if (!(await this.own(id, item, 'shop'))) await this.give(id, price.coins ?? 0, price.gems ?? 0, `refund ${item}`); // bought twice at once
    return (await this.get(id))!;
  }

  private async passRow(id: number, season: string): Promise<void> {
    await this.db.query('insert into passes (account_id, season) values ($1, $2) on conflict do nothing', [id, season]);
  }

  /** Unlock the premium track of the current season with gems. */
  async buyPass(id: number): Promise<Account> {
    const cfg = this.config();
    if (seasonOver(cfg)) throw new AccountError('ซีซันนี้จบแล้ว');
    const cur = await this.get(id);
    if (!cur) throw new AccountError('ไม่พบบัญชี');
    if (cur.pass.premium) throw new AccountError('มี Battle Pass พรีเมียมอยู่แล้ว');
    if (!(await this.spend(id, 0, cfg.season.premiumGems, `pass ${cfg.season.id}`))) throw new AccountError('เพชรไม่พอ');
    await this.passRow(id, cfg.season.id);
    const rows = await this.db.query('update passes set premium = true where account_id = $1 and season = $2 and not premium returning season', [id, cfg.season.id]);
    if (!rows.length) await this.give(id, 0, cfg.season.premiumGems, `refund pass ${cfg.season.id}`);
    return (await this.get(id))!;
  }

  private async grantReward(id: number, r: Reward, reason: string, source: string): Promise<void> {
    if ('coins' in r) await this.give(id, r.coins, 0, reason);
    else if ('gems' in r) await this.give(id, 0, r.gems, reason);
    else await this.own(id, r.item, source);
  }

  /** Claim one reached tier's reward on a track. */
  async claim(id: number, rawTier: unknown, rawTrack: unknown): Promise<Account> {
    const cfg = this.config();
    const tier = Number(rawTier);
    const track: Track = rawTrack === 'premium' ? 'premium' : 'free';
    const reward = Number.isInteger(tier) ? rewardOf(tier, track, cfg) : null;
    if (!reward) throw new AccountError('ไม่มีรางวัลนี้');
    if (seasonOver(cfg)) throw new AccountError('ซีซันนี้จบแล้ว');
    const cur = await this.get(id);
    if (!cur) throw new AccountError('ไม่พบบัญชี');
    if (tierOf(cur.pass.xp, cfg) < tier) throw new AccountError('ยังไปไม่ถึงขั้นนี้');
    if (track === 'premium' && !cur.pass.premium) throw new AccountError('ต้องมี Battle Pass พรีเมียมก่อน');
    const key = claimKey(tier, track);
    await this.passRow(id, cfg.season.id);
    // mark first, in one statement, so a double tap can't claim twice
    const marked = await this.db.query(
      `update passes set claimed = claimed || $3::jsonb where account_id = $1 and season = $2 and not claimed ? $4 returning season`,
      [id, cfg.season.id, JSON.stringify([key]), key]);
    if (!marked.length) throw new AccountError('รับรางวัลนี้ไปแล้ว');
    await this.grantReward(id, reward, `pass ${cfg.season.id} ${key}`, 'pass');
    return (await this.get(id))!;
  }

  /** Admin: hand out coins, gems or a piece, with the reason in the ledger. */
  async grant(id: number, g: { coins?: number; gems?: number; item?: string }, reason: string): Promise<Account> {
    const cfg = this.config();
    if (g.coins || g.gems) await this.give(id, g.coins ?? 0, g.gems ?? 0, reason);
    if (g.item) {
      const k = parseItemKey(g.item);
      const known = k && (k.kind === 'fashion' ? cfg.fashion : cfg.equipment).some((d) => d.slot === k.slot && d.id === k.id);
      if (!known) throw new AccountError(`ไม่พบชิ้น ${g.item}`);
      await this.own(id, g.item, 'admin');
    }
    return (await this.get(id))!;
  }

  // ---------------------------------------------------------------- matches

  async leaderboard(limit = 20): Promise<LeaderRow[]> {
    const rows = await this.db.query<Row>(
      'select * from accounts where ranked_played > 0 order by rating desc, ranked_played desc limit $1', [limit]);
    return rows.map((r) => ({ displayName: r.display_name, rating: r.rating, played: r.ranked_played, wins: r.wins }));
  }

  /**
   * Count a finished match. Ranked 1v1 also moves both ratings (Elo). Matches between
   * two or more accounts that lasted long enough pay coins and Battle Pass XP.
   */
  async recordMatch(m: MatchRecord): Promise<MatchResult> {
    const cfg = this.config();
    await this.db.query('insert into matches (ranked, map, format, winner, players) values ($1, $2, $3, $4, $5)',
      [m.ranked, m.map, m.format, m.winner, JSON.stringify(m.players)]);
    const rating = new Map<number, number>();
    const pay = new Map<number, { coins: number; xp: number }>();
    const humans = m.players.filter((p) => p.accountId !== null);
    if (m.ranked && humans.length === 2 && humans[0].team !== humans[1].team) {
      const [a, b] = await Promise.all(humans.map((p) => this.get(p.accountId!)));
      if (a && b) {
        const scoreA = humans[0].team === m.winner ? 1 : 0;
        const change = Math.round(ELO_K * (scoreA - expected(a.rating, b.rating)));
        rating.set(a.id, change);
        rating.set(b.id, -change);
      }
    }
    const paid = new Set(humans.map((p) => p.accountId)).size >= 2 && m.turns >= cfg.economy.minTurns;
    const xpOn = !seasonOver(cfg);
    for (const p of humans) {
      const id = p.accountId!;
      const won = p.team === m.winner;
      await this.db.query(
        `update accounts set played = played + 1, wins = wins + $2,
           ranked_played = ranked_played + $3, rating = greatest(0, rating + $4) where id = $1`,
        [id, won ? 1 : 0, m.ranked ? 1 : 0, rating.get(id) ?? 0]);
      if (!paid) continue;
      const earned = matchPay(won, cfg);
      await this.give(id, earned.coins, 0, m.ranked ? 'ranked match' : 'match');
      if (xpOn) {
        await this.passRow(id, cfg.season.id);
        await this.db.query('update passes set xp = xp + $3 where account_id = $1 and season = $2', [id, cfg.season.id, earned.xp]);
      }
      pay.set(id, { coins: earned.coins, xp: xpOn ? earned.xp : 0 });
    }
    return { rating, pay };
  }
}
