import { randomBytes, timingSafeEqual } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { GameConfig, validateConfig } from '../src/core/config';
import { ConfigStore } from './configStore';

// HTTP API for the admin page (admin.html), under /admin/api/. One shared password
// (ADMIN_PASSWORD) for now; each admin types a name, which goes into the history.
// Tokens live in memory, so a server restart signs everyone out.
//
//   POST /login     { name, password }          → { token }
//   GET  /config                                → { config, version, at, by, note }
//   POST /publish   { config, note, base }      → the new version; 409 if `base` is not the latest
//   GET  /history                               → versions, newest first
//   GET  /history/:v                            → that version's config

const TOKEN_HOURS = 12;
const MAX_BODY = 512 * 1024;
const LOGIN_TRIES = 5; // per minute per address

export interface AdminDeps {
  store: ConfigStore;
  password: string | undefined;
  /** A new version was published: new matches use it from now on. */
  onPublish: (config: GameConfig) => void;
}

export function adminApi(deps: AdminDeps): (req: IncomingMessage, res: ServerResponse) => boolean {
  const sessions = new Map<string, { name: string; until: number }>();
  const tries = new Map<string, { n: number; since: number }>();

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const fail = (res: ServerResponse, status: number, error: string) => send(res, status, { error });

  const who = (req: IncomingMessage): string | null => {
    const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
    const s = token ? sessions.get(token) : undefined;
    if (!s || s.until < Date.now()) return null;
    return s.name;
  };

  const readJson = (req: IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error('too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (v && typeof v === 'object' && !Array.isArray(v)) resolve(v);
          else reject(new Error('not an object'));
        } catch (err) {
          reject(err);
        }
      });
    });

  const passwordOk = (given: string) => {
    const a = Buffer.from(given);
    const b = Buffer.from(deps.password ?? '');
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const route = async (req: IncomingMessage, res: ServerResponse, path: string) => {
    if (!deps.password) return fail(res, 503, 'ยังไม่ได้ตั้ง ADMIN_PASSWORD บนเซิร์ฟเวอร์');

    if (req.method === 'POST' && path === '/login') {
      const ip = req.socket.remoteAddress ?? '?';
      const t = tries.get(ip);
      if (t && Date.now() - t.since < 60_000 && t.n >= LOGIN_TRIES) return fail(res, 429, 'ลองผิดหลายครั้งเกินไป รอ 1 นาที');
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 30) : '';
      if (!name) return fail(res, 400, 'ใส่ชื่อก่อน');
      if (typeof body.password !== 'string' || !passwordOk(body.password)) {
        const cur = t && Date.now() - t.since < 60_000 ? t : { n: 0, since: Date.now() };
        tries.set(ip, { n: cur.n + 1, since: cur.since });
        return fail(res, 401, 'รหัสผ่านไม่ถูก');
      }
      tries.delete(ip);
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

    if (req.method === 'POST' && path === '/publish') {
      const body = await readJson(req);
      if (body.base !== deps.store.latest.version) {
        return fail(res, 409, `มีคนเผยแพร่ v${deps.store.latest.version} ไปก่อนแล้ว โหลดของล่าสุดแล้วแก้ใหม่`);
      }
      const report = validateConfig(body.config);
      if (report.errors.length) return send(res, 422, { error: 'ค่ายังผิดอยู่', ...report });
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
      const config = body.config as GameConfig;
      const meta = deps.store.publish(config, name, note);
      deps.onPublish(config);
      console.log(`admin: ${name} published v${meta.version}${note ? ` (${note})` : ''}`);
      return send(res, 200, meta);
    }

    return fail(res, 404, 'ไม่มีคำสั่งนี้');
  };

  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/admin/api/')) return false;
    // The admin page is served from the game's site, another origin; auth is a bearer token, not cookies.
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }
    route(req, res, url.pathname.slice('/admin/api'.length)).catch(() => {
      if (!res.headersSent) fail(res, 400, 'ข้อมูลที่ส่งมาอ่านไม่ได้');
    });
    return true;
  };
}
