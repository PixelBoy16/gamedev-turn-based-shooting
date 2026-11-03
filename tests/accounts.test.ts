/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountError, Accounts, accountView } from '../server/accounts';
import { Db, openDb } from '../server/db';
import { Lobby, QUEUE, Services } from '../server/rooms';
import { createRng } from '../src/core/rng';
import { BUNDLED, GameConfig } from '../src/core/config';
import { DEFAULT_LOADOUT } from '../src/core/gear';
import { ServerMsg } from '../src/net/protocol';

let db: Db;
let accounts: Accounts;

beforeEach(async () => {
  db = await openDb(); // in-memory Postgres
  accounts = new Accounts(db, () => BUNDLED);
});
afterEach(async () => {
  await db.close();
});

describe('accounts', () => {
  it('starts everyone as a guest with a working session', async () => {
    const { token, account } = await accounts.createGuest();
    expect(account.username).toBeNull();
    expect(account.rating).toBe(1000);
    expect((await accounts.bySession(token))!.id).toBe(account.id);
    expect(await accounts.bySession('0'.repeat(48))).toBeNull();
  });

  it('lets a guest claim a username and sign in with it elsewhere', async () => {
    const { account } = await accounts.createGuest();
    await accounts.saveProfile(account.id, { displayName: 'มดแดง', items: ['power', 'warp', 'heal'] });
    await accounts.register(account.id, 'MdDaeng', 'secret1');
    const other = await accounts.login('mddaeng', 'secret1');
    expect(other.account.id).toBe(account.id);
    expect(other.account.displayName).toBe('มดแดง');
    expect(other.account.items).toEqual(['power', 'warp', 'heal']);
    await expect(accounts.login('mddaeng', 'wrong-pass')).rejects.toThrow('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก');
  });

  it('refuses a taken or malformed username and a short password', async () => {
    const a = (await accounts.createGuest()).account;
    const b = (await accounts.createGuest()).account;
    await accounts.register(a.id, 'player_one', 'secret1');
    await expect(accounts.register(b.id, 'PLAYER_ONE', 'secret1')).rejects.toThrow('มีคนใช้แล้ว');
    await expect(accounts.register(b.id, 'no spaces', 'secret1')).rejects.toBeInstanceOf(AccountError);
    await expect(accounts.register(b.id, 'fine_name', '123')).rejects.toThrow('อย่างน้อย 6');
  });

  it('cleans what the wardrobe saves', async () => {
    const { account } = await accounts.createGuest();
    const saved = await accounts.saveProfile(account.id, {
      loadout: { ...DEFAULT_LOADOUT, weapon: 'laser', look: { ...DEFAULT_LOADOUT.look, hat: 'none', hair: 'spiky' } },
      items: ['double', 'double', 'nuke'],
    });
    expect(saved.loadout!.weapon).toBe('cannon');
    expect(saved.loadout!.look.hair).toBe('spiky');
    expect(saved.items).toBeNull(); // not a valid pick of 3
  });

  it('moves ratings after a ranked win and counts every match', async () => {
    const a = (await accounts.createGuest()).account;
    const b = (await accounts.createGuest()).account;
    const players = [{ accountId: a.id, name: 'a', team: 0 }, { accountId: b.id, name: 'b', team: 1 }];
    const { rating } = await accounts.recordMatch({ ranked: true, map: 'hills', format: '1v1', winner: 0, turns: 10, players });
    expect(rating.get(a.id)).toBe(16); // equal ratings: K/2
    expect(rating.get(b.id)).toBe(-16);
    await accounts.recordMatch({ ranked: false, map: 'hills', format: '1v1', winner: 1, turns: 10, players });
    const [a2, b2] = [await accounts.get(a.id), await accounts.get(b.id)];
    expect([a2!.rating, a2!.played, a2!.wins, a2!.rankedPlayed]).toEqual([1016, 2, 1, 1]);
    expect([b2!.rating, b2!.played, b2!.wins, b2!.rankedPlayed]).toEqual([984, 2, 1, 1]);
    expect((await accounts.leaderboard()).map((r) => r.rating)).toEqual([1016, 984]);
  });
});

class FakeConn {
  inbox: ServerMsg[] = [];
  send(m: ServerMsg): void {
    this.inbox.push(JSON.parse(JSON.stringify(m)));
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

describe('ranked queue', () => {
  afterEach(() => vi.useRealTimers());

  const services = (): Services => ({
    account: async (token) => {
      const a = await accounts.bySession(token);
      return a && { id: a.id, view: accountView(a) };
    },
    accountView: async (id) => {
      const a = await accounts.get(id);
      return a && accountView(a);
    },
    record: (m) => accounts.recordMatch(m),
  });

  const flush = () => new Promise((r) => setTimeout(r, 30));
  const profile = { name: 'x', loadout: { ...DEFAULT_LOADOUT, equip: { necklace: 'heart', ring: 'none', bracelet: 'none', charm: 'none' } }, items: [] };

  async function signedIn(lobby: Lobby, rating = 1000) {
    const { token, account } = await accounts.createGuest();
    await db.query('update accounts set rating = $1 where id = $2', [rating, account.id]);
    const c = new FakeConn();
    lobby.handle(c, { t: 'auth', token });
    await flush();
    return { c, account };
  }

  it('needs an account to queue', () => {
    const lobby = new Lobby(createRng(1), services());
    const c = new FakeConn();
    lobby.handle(c, { t: 'queue', ...profile });
    expect(c.last('error')!.msg).toContain('บัญชี');
  });

  it('pairs two close ratings into a ranked 1v1 that starts at once, without equipment', async () => {
    const lobby = new Lobby(createRng(1), services());
    const a = await signedIn(lobby, 1000);
    const b = await signedIn(lobby, 1050);
    lobby.handle(a.c, { t: 'queue', ...profile });
    expect(a.c.last('queue')!.waiting).toBe(true);
    lobby.handle(b.c, { t: 'queue', ...profile });
    const room = [...lobby.rooms.values()][0];
    expect(room.ranked).toBe(true);
    const view = a.c.last('match')!.match;
    expect(view.tanks).toHaveLength(2);
    expect(view.tanks.every((t) => !t.isBot && t.maxHp === 1000)).toBe(true); // the heart necklace's +50 HP is off
    expect(view.tanks.map((t) => t.name).sort()).toEqual([a.account.displayName, b.account.displayName].sort());
  });

  it('waits when ratings are far apart, then widens the window over time', async () => {
    const lobby = new Lobby(createRng(1), services());
    const a = await signedIn(lobby, 1000);
    const b = await signedIn(lobby, 1400);
    vi.useFakeTimers();
    lobby.handle(a.c, { t: 'queue', ...profile });
    lobby.handle(b.c, { t: 'queue', ...profile });
    expect(lobby.rooms.size).toBe(0);
    await vi.advanceTimersByTimeAsync(((400 - QUEUE.baseGap) / QUEUE.gapPerSecond) * 1000 + QUEUE.tickMs);
    expect(lobby.rooms.size).toBe(1);
  });

  it('records the result and sends each player their rating change', async () => {
    const lobby = new Lobby(createRng(1), services());
    const a = await signedIn(lobby);
    const b = await signedIn(lobby);
    lobby.handle(a.c, { t: 'queue', ...profile });
    lobby.handle(b.c, { t: 'queue', ...profile });
    const room = [...lobby.rooms.values()][0];
    const m = room.match!;
    const shooter = m.turns.active;
    for (const t of m.world.tanks) if (t.team !== shooter.team) t.hp = 0;
    const owner = room.players.find((p) => p.id === m.owner[shooter.id])!.conn as FakeConn;
    lobby.handle(owner, { t: 'fire', x: shooter.x, y: shooter.y, facing: shooter.facing, angle: 80, power: 20, drill: false });
    lobby.handle(a.c, { t: 'settled', turn: 1 });
    lobby.handle(b.c, { t: 'settled', turn: 1 });
    await flush();
    const changes = [a.c, b.c].map((c) => c.last('account')!.ratingChange);
    expect(changes.sort()).toEqual([-16, 16]);
    expect(a.c.last('account')!.reward).toBeUndefined(); // over in one turn: too short to pay
  });
});

describe('shop and battle pass', () => {
  const cfg = () => BUNDLED;
  const players = (a: number, b: number) => [{ accountId: a, name: 'a', team: 0 }, { accountId: b, name: 'b', team: 1 }];

  it('starts accounts with the configured purse', async () => {
    const { account } = await accounts.createGuest();
    expect([account.coins, account.gems]).toEqual([cfg().economy.startCoins, cfg().economy.startGems]);
  });

  it('sells a piece once, and refuses when short of the currency', async () => {
    const { account } = await accounts.createGuest();
    const after = await accounts.buy(account.id, 'fashion:hat/aviator');
    expect(after.coins).toBe(account.coins - 300);
    expect(after.owned).toEqual(['fashion:hat/aviator']);
    await expect(accounts.buy(account.id, 'fashion:hat/aviator')).rejects.toThrow('มีชิ้นนี้อยู่แล้ว');
    await expect(accounts.buy(account.id, 'fashion:cloth/robe')).rejects.toThrow('เพชรไม่พอ'); // 80 gems, has 50
    await expect(accounts.buy(account.id, 'fashion:set/bear')).rejects.toThrow('ไม่ได้วางขาย'); // pass exclusive
    await expect(accounts.buy(account.id, 'fashion:hair/short')).rejects.toThrow('ฟรีอยู่แล้ว');
  });

  it('only saves pieces the player owns', async () => {
    const { account } = await accounts.createGuest();
    const look = { ...DEFAULT_LOADOUT.look, hat: 'aviator', glasses: 'shades' };
    const before = await accounts.saveProfile(account.id, { loadout: { ...DEFAULT_LOADOUT, look } });
    expect([before.loadout!.look.hat, before.loadout!.look.glasses]).toEqual(['none', 'none']);
    await accounts.buy(account.id, 'fashion:hat/aviator');
    const after = await accounts.saveProfile(account.id, { loadout: { ...DEFAULT_LOADOUT, look } });
    expect([after.loadout!.look.hat, after.loadout!.look.glasses]).toEqual(['aviator', 'none']);
  });

  it('pays coins and XP for a real match, and nothing for a short one', async () => {
    const a = (await accounts.createGuest()).account;
    const b = (await accounts.createGuest()).account;
    const short = await accounts.recordMatch({ ranked: false, map: 'hills', format: '1v1', winner: 0, turns: 1, players: players(a.id, b.id) });
    expect(short.pay.size).toBe(0);
    const res = await accounts.recordMatch({ ranked: false, map: 'hills', format: '1v1', winner: 0, turns: 10, players: players(a.id, b.id) });
    expect(res.pay.get(a.id)).toEqual({ coins: 60, xp: 100 });
    expect(res.pay.get(b.id)).toEqual({ coins: 25, xp: 50 });
    expect((await accounts.get(a.id))!.pass.xp).toBe(100);
  });

  it('claims reached tiers once, and premium only with the pass', async () => {
    const { account } = await accounts.createGuest();
    await db.query('insert into passes (account_id, season, xp) values ($1, $2, $3)', [account.id, cfg().season.id, 300 * 15]);
    await expect(accounts.claim(account.id, 16, 'free')).rejects.toThrow('ยังไปไม่ถึง');
    const a1 = await accounts.claim(account.id, 1, 'free');
    expect(a1.coins).toBe(account.coins + 100);
    await expect(accounts.claim(account.id, 1, 'free')).rejects.toThrow('รับรางวัลนี้ไปแล้ว');
    await expect(accounts.claim(account.id, 15, 'premium')).rejects.toThrow('พรีเมียม');
    await accounts.grant(account.id, { gems: 300 }, 'test');
    const bought = await accounts.buyPass(account.id);
    expect(bought.pass.premium).toBe(true);
    expect(bought.gems).toBe(50); // 50 + 300 - 300
    const wings = await accounts.claim(account.id, 15, 'premium');
    expect(wings.owned).toContain('fashion:back/wings');
  });

  it('keeps every movement in the ledger', async () => {
    const { account } = await accounts.createGuest();
    await accounts.buy(account.id, 'fashion:hat/aviator');
    const rows = await db.query<{ coins: number; reason: string }>('select coins, reason from ledger where account_id = $1 order by id', [account.id]);
    expect(rows).toEqual([{ coins: 500, reason: 'start' }, { coins: -300, reason: 'buy fashion:hat/aviator' }]);
  });

  it('uses the config it is given for prices', async () => {
    let live: GameConfig = BUNDLED;
    const shop = new Accounts(db, () => live);
    const { account } = await shop.createGuest();
    live = structuredClone(BUNDLED);
    live.fashion.find((f) => f.id === 'aviator')!.price = { coins: 100 };
    expect((await shop.buy(account.id, 'fashion:hat/aviator')).coins).toBe(account.coins - 100);
  });
});
