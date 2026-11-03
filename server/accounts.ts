import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ITEM_IDS, ItemId, LIMITS } from '../src/core/data';
import { Loadout, cleanLoadout } from '../src/core/gear';
import type { AccountView, LeaderRow } from '../src/net/protocol';
import { Db } from './db';

// Player accounts. Everyone starts as a guest the first time the game opens (no
// sign-up wall); a guest can later pick a username and password to play on another
// device. Sessions are random tokens; only their hash is stored.

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
}

/** Thrown for anything the player should be told about (shown as is). */
export class AccountError extends Error {}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function cleanItems(raw: unknown): ItemId[] | null {
  if (!Array.isArray(raw)) return null;
  const items = [...new Set(raw.filter((i): i is ItemId => ITEM_IDS.includes(i)))];
  return items.length === LIMITS.itemsPerMatch ? items : null;
}

function toAccount(r: Row): Account {
  return {
    id: Number(r.id),
    username: r.username,
    displayName: r.display_name,
    loadout: r.profile.loadout ? cleanLoadout(r.profile.loadout) : null,
    items: cleanItems(r.profile.items),
    rating: r.rating,
    played: r.played,
    wins: r.wins,
    rankedPlayed: r.ranked_played,
  };
}

export function accountView(a: Account): AccountView {
  return {
    username: a.username, displayName: a.displayName, loadout: a.loadout, items: a.items,
    rating: a.rating, played: a.played, wins: a.wins, rankedPlayed: a.rankedPlayed,
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
  players: { accountId: number | null; name: string; team: number }[];
}

export class Accounts {
  constructor(private db: Db) {}

  private async one(sql: string, params: unknown[]): Promise<Account | null> {
    const rows = await this.db.query<Row>(sql, params);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  private async newSession(accountId: number): Promise<string> {
    const token = randomBytes(24).toString('hex');
    await this.db.query('insert into sessions (token_hash, account_id) values ($1, $2)', [hashToken(token), accountId]);
    return token;
  }

  async createGuest(): Promise<{ token: string; account: Account }> {
    const name = `ผู้เล่น${Math.floor(1000 + Math.random() * 9000)}`;
    const account = (await this.one('insert into accounts (display_name) values ($1) returning *', [name]))!;
    return { token: await this.newSession(account.id), account };
  }

  /** The account a session token belongs to, or null. Also marks it as seen. */
  async bySession(token: unknown): Promise<Account | null> {
    if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return null;
    const h = hashToken(token);
    const account = await this.one(
      'select a.* from sessions s join accounts a on a.id = s.account_id where s.token_hash = $1', [h]);
    if (account) {
      await this.db.query('update sessions set last_used = now() where token_hash = $1', [h]);
      await this.db.query('update accounts set last_seen = now() where id = $1', [account.id]);
    }
    return account;
  }

  async get(id: number): Promise<Account | null> {
    return this.one('select * from accounts where id = $1', [id]);
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
    const username = String(rawUsername ?? '').trim().toLowerCase();
    const rows = await this.db.query<Row>('select * from accounts where username = $1', [username]);
    const row = rows[0];
    const ok = row?.pass_hash && typeof password === 'string' && (await checkPassword(password, row.pass_hash));
    if (!row || !ok) throw new AccountError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก');
    const account = toAccount(row);
    return { token: await this.newSession(account.id), account };
  }

  async logout(token: string): Promise<void> {
    await this.db.query('delete from sessions where token_hash = $1', [hashToken(token)]);
  }

  /** Save what the wardrobe shows; fields left out stay as they are. */
  async saveProfile(id: number, p: { displayName?: unknown; loadout?: unknown; items?: unknown }): Promise<Account> {
    const cur = await this.get(id);
    if (!cur) throw new AccountError('ไม่พบบัญชี');
    const displayName = p.displayName === undefined ? cur.displayName : cleanDisplayName(p.displayName);
    const loadout = p.loadout === undefined ? cur.loadout : cleanLoadout(p.loadout);
    const items = p.items === undefined ? cur.items : cleanItems(p.items);
    return (await this.one('update accounts set display_name = $1, profile = $2 where id = $3 returning *',
      [displayName, JSON.stringify({ loadout, items }), id]))!;
  }

  async leaderboard(limit = 20): Promise<LeaderRow[]> {
    const rows = await this.db.query<Row>(
      'select * from accounts where ranked_played > 0 order by rating desc, ranked_played desc limit $1', [limit]);
    return rows.map((r) => ({ displayName: r.display_name, rating: r.rating, played: r.ranked_played, wins: r.wins }));
  }

  /**
   * Count a finished match. Ranked 1v1 also moves both ratings (Elo); returns the
   * change per account id so the result screen can show it.
   */
  async recordMatch(m: MatchRecord): Promise<Map<number, number>> {
    await this.db.query('insert into matches (ranked, map, format, winner, players) values ($1, $2, $3, $4, $5)',
      [m.ranked, m.map, m.format, m.winner, JSON.stringify(m.players)]);
    const delta = new Map<number, number>();
    const humans = m.players.filter((p) => p.accountId !== null);
    if (m.ranked && humans.length === 2 && humans[0].team !== humans[1].team) {
      const [a, b] = await Promise.all(humans.map((p) => this.get(p.accountId!)));
      if (a && b) {
        const scoreA = humans[0].team === m.winner ? 1 : 0;
        const change = Math.round(ELO_K * (scoreA - expected(a.rating, b.rating)));
        delta.set(a.id, change);
        delta.set(b.id, -change);
      }
    }
    for (const p of humans) {
      const won = p.team === m.winner ? 1 : 0;
      await this.db.query(
        `update accounts set played = played + 1, wins = wins + $2,
           ranked_played = ranked_played + $3, rating = greatest(0, rating + $4) where id = $1`,
        [p.accountId, won, m.ranked ? 1 : 0, delta.get(p.accountId!) ?? 0]);
    }
    return delta;
  }
}
