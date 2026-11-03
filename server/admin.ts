import { randomBytes, timingSafeEqual } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { GameConfig, validateConfig } from '../src/core/config';
import { Accounts, accountView } from './accounts';
import { ConfigStore } from './configStore';
import { RateLimit, bearer, cors, fail, readJson, sendJson } from './http';

// HTTP API for the admin page (admin.html), under /admin/api/. One shared password
// (ADMIN_PASSWORD) for now; each admin types a name, which goes into the history.
// Tokens live in memory, so a server restart signs everyone out.
//
//   POST /login     { name, password }          → { token }
//   GET  /config                                → { config, version, at, by, note }
//   POST /publish   { config, note, base }      → the new version; 409 if `base` is not the latest
//   GET  /history                               → versions, newest first
//   GET  /history/:v                            → that version's config
//   GET  /player?username=                      → a player's account
//   POST /grant     { username, coins?, gems?, item?, reason } → the player's account

const TOKEN_HOURS = 12;
const LOGIN_TRIES = 5; // per minute per address

export interface AdminDeps {
  store: ConfigStore;
  accounts: Accounts;
  password: string | undefined;
  /** A new version was published: new matches use it from now on. */
  onPublish: (config: GameConfig) => void;
}

export function adminApi(deps: AdminDeps): (req: IncomingMessage, res: ServerResponse) => boolean {
  const sessions = new Map<string, { name: string; until: number }>();

  const send = sendJson;
  const tries = new RateLimit(LOGIN_TRIES);

  const who = (req: IncomingMessage): string | null => {
    const token = bearer(req);
    const s = token ? sessions.get(token) : undefined;
    if (!s || s.until < Date.now()) return null;
    return s.name;
  };

  const passwordOk = (given: string) => {
    const a = Buffer.from(given);
    const b = Buffer.from(deps.password ?? '');
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const route = async (req: IncomingMessage, res: ServerResponse, path: string) => {
    if (!deps.password) return fail(res, 503, 'ยังไม่ได้ตั้ง ADMIN_PASSWORD บนเซิร์ฟเวอร์');

    if (req.method === 'POST' && path === '/login') {
      if (!tries.take(req)) return fail(res, 429, 'ลองผิดหลายครั้งเกินไป รอ 1 นาที');
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 30) : '';
      if (!name) return fail(res, 400, 'ใส่ชื่อก่อน');
      if (typeof body.password !== 'string' || !passwordOk(body.password)) return fail(res, 401, 'รหัสผ่านไม่ถูก');
      tries.reset(req);
      const token = randomBytes(24).toString('hex');
      sessions.set(token, { name, until: Date.now() + TOKEN_HOURS * 3600_000 });
      return send(res, 200, { token, name });
    }

    const name = who(req);
    if (!name) return fail(res, 401, 'กรุณาเข้าสู่ระบบใหม่');

    if (req.method === 'GET' && path === '/config') return send(res, 200, deps.store.latest);
    if (req.method === 'GET' && path === '/history') return send(res, 200, deps.store.list());
    const v = /^\/history\/(\d+)$/.exec(path);
    if (req.method === 'GET' && v) {
      const config = deps.store.get(Number(v[1]));
      return config ? send(res, 200, { config }) : fail(res, 404, 'ไม่พบเวอร์ชันนี้');
    }

    if (req.method === 'GET' && path === '/player') {
      const username = new URL(req.url ?? '/', 'http://x').searchParams.get('username') ?? '';
      const a = await deps.accounts.byUsername(username);
      return a ? send(res, 200, { id: a.id, ...accountView(a) }) : fail(res, 404, 'ไม่พบผู้เล่นชื่อผู้ใช้นี้ (บัญชีชั่วคราวค้นหาไม่ได้)');
    }
    if (req.method === 'POST' && path === '/grant') {
      const body = await readJson(req);
      const a = await deps.accounts.byUsername(String(body.username ?? ''));
      if (!a) return fail(res, 404, 'ไม่พบผู้เล่น');
      const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000 ? (v as number) : 0);
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
      if (!reason) return fail(res, 400, 'ใส่เหตุผลก่อน (บันทึกในประวัติการเงิน)');
      const item = typeof body.item === 'string' && body.item ? body.item : undefined;
      try {
        const after = await deps.accounts.grant(a.id, { coins: n(body.coins), gems: n(body.gems), item }, `admin ${name}: ${reason}`);
        console.log(`admin: ${name} granted ${a.username} coins ${n(body.coins)} gems ${n(body.gems)} ${item ?? ''} (${reason})`);
        return send(res, 200, { id: after.id, ...accountView(after) });
      } catch (err) {
        return fail(res, 400, (err as Error).message);
      }
    }

    if (req.method === 'POST' && path === '/publish') {
      const body = await readJson(req);
      if (body.base !== deps.store.latest.version) {
        return fail(res, 409, `มีคนเผยแพร่ v${deps.store.latest.version} ไปก่อนแล้ว โหลดของล่าสุดแล้วแก้ใหม่`);
      }
      const report = validateConfig(body.config);
      if (report.errors.length) return send(res, 422, { error: 'ค่ายังผิดอยู่', ...report });
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
      const config = body.config as GameConfig;
      const meta = await deps.store.publish(config, name, note);
      deps.onPublish(config);
      console.log(`admin: ${name} published v${meta.version}${note ? ` (${note})` : ''}`);
      return send(res, 200, meta);
    }

    return fail(res, 404, 'ไม่มีคำสั่งนี้');
  };

  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/admin/api/')) return false;
    if (cors(req, res)) return true;
    route(req, res, url.pathname.slice('/admin/api'.length)).catch(() => {
      if (!res.headersSent) fail(res, 400, 'ข้อมูลที่ส่งมาอ่านไม่ได้');
    });
    return true;
  };
}
