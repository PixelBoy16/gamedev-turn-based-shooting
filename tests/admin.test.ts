/// <reference types="node" />
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Accounts } from '../server/accounts';
import { adminApi } from '../server/admin';
import { ConfigStore, renameConfig } from '../server/configStore';
import { Db, openDb } from '../server/db';
import { BUNDLED, GameConfig } from '../src/core/config';

describe('admin api', () => {
  let db: Db;
  let server: Server;
  let base: string;
  let published: GameConfig[];
  let accounts: Accounts;

  const open = async () => {
    const store = await ConfigStore.open(db, BUNDLED);
    accounts = new Accounts(db, () => BUNDLED);
    const api = adminApi({ store, accounts, password: 'test-pass', onPublish: (c) => published.push(c) });
    server = createServer((req, res) => {
      if (!api(req, res)) res.writeHead(404).end();
    });
    return new Promise<void>((r) => server.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/api`;
      r();
    }));
  };
  const call = async (path: string, body?: unknown, token?: string) => {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  const login = async () => (await call('/login', { name: 'จีเอ็ม', password: 'test-pass' })).body.token as string;

  beforeEach(async () => {
    db = await openDb(); // in-memory Postgres
    published = [];
    await open();
  });
  afterEach(async () => {
    server.close();
    await db.close();
  });

  it('refuses a wrong password and requests without a token', async () => {
    expect((await call('/login', { name: 'x', password: 'nope' })).status).toBe(401);
    expect((await call('/config')).status).toBe(401);
  });

  it('publishes a valid edit as a new version, with who and why', async () => {
    const token = await login();
    const cur = (await call('/config', undefined, token)).body;
    expect(cur.version).toBe(0);
    const config = structuredClone(cur.config);
    config.weapons.cannon.damage = 320;
    const res = await call('/publish', { config, note: 'บัฟปืนใหญ่', base: 0 }, token);
    expect(res.body).toMatchObject({ version: 1, by: 'จีเอ็ม', note: 'บัฟปืนใหญ่' });
    expect(published[0].weapons.cannon.damage).toBe(320);
    expect((await call('/history', undefined, token)).body.map((v: { version: number }) => v.version)).toEqual([1, 0]);
    expect((await call('/history/0', undefined, token)).body.config.weapons.cannon.damage).toBe(300);
  });

  it('rejects broken numbers and a publish based on an old version', async () => {
    const token = await login();
    const bad = structuredClone(BUNDLED);
    bad.rules.turnSeconds = 0;
    const res = await call('/publish', { config: bad, base: 0 }, token);
    expect(res.status).toBe(422);
    expect(res.body.errors).toContain('rules.turnSeconds: 0 อยู่นอกช่วง 5–120');
    await call('/publish', { config: BUNDLED, base: 0 }, token);
    expect((await call('/publish', { config: BUNDLED, base: 0 }, token)).status).toBe(409);
  });

  it('keeps published versions across a server restart', async () => {
    const token = await login();
    const config = structuredClone(BUNDLED);
    config.rules.maxHp = 1200;
    await call('/publish', { config, base: 0 }, token);
    server.close();
    await open();
    const again = await login();
    const cur = (await call('/config', undefined, again)).body;
    expect(cur.version).toBe(1);
    expect(cur.config.rules.maxHp).toBe(1200);
  });

  it('finds a player by username and grants gems with a reason', async () => {
    const token = await login();
    const { account } = await accounts.createGuest();
    await accounts.register(account.id, 'lucky_one', 'secret1');
    expect((await call('/player?username=nobody', undefined, token)).status).toBe(404);
    expect((await call('/grant', { username: 'lucky_one', gems: 100 }, token)).status).toBe(400); // no reason
    const res = await call('/grant', { username: 'lucky_one', gems: 100, item: 'fashion:set/bearskull', reason: 'ชดเชยเซิร์ฟล่ม' }, token);
    expect(res.body.gems).toBe(account.gems + 100);
    expect(res.body.owned).toContain('fashion:set/bearskull');
    expect((await call('/player?username=LUCKY_ONE', undefined, token)).body.gems).toBe(account.gems + 100);
  });

  it('maps an old published catalog onto the new pieces', () => {
    const stored = structuredClone(BUNDLED);
    const crown = stored.fashion.find((f) => f.id === 'spikecrown')!;
    Object.assign(crown, { id: 'crown', name: 'มงกุฎกระดาษ', price: { gems: 99 } });
    stored.fashion.find((f) => f.id === 'bearskull')!.id = 'bear';
    stored.season.tiers[19].premium = { item: 'fashion:set/bear' };
    const out = renameConfig(stored, BUNDLED);
    const ids = out.fashion.map((f) => `${f.slot}/${f.id}`);
    expect(ids).not.toContain('hat/crown');
    expect(out.fashion.find((f) => f.id === 'spikecrown')).toMatchObject({ name: 'มงกุฎเหล็กหนาม', price: { gems: 99 } });
    expect(out.season.tiers[19].premium).toEqual({ item: 'fashion:set/bearskull' });
  });
});
