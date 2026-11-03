import { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, Accounts, accountView } from './accounts';
import { RateLimit, bearer, cors, fail, readJson, sendJson } from './http';

// HTTP API for player accounts, under /api/. The game calls it from src/net/account.ts.
//
//   POST /guest                                → { token, account }   a new guest account
//   GET  /me                                   → account
//   POST /me        { displayName?, loadout?, items? } → account
//   POST /register  { username, password }     → account             guest → named account
//   POST /login     { username, password }     → { token, account }
//   POST /logout
//   GET  /leaderboard                          → top ranked players

export function accountApi(accounts: Accounts): (req: IncomingMessage, res: ServerResponse) => boolean {
  const guests = new RateLimit(10);
  const logins = new RateLimit(8);

  const route = async (req: IncomingMessage, res: ServerResponse, path: string) => {
    const post = req.method === 'POST';
    if (post && path === '/guest') {
      if (!guests.take(req)) return fail(res, 429, 'สร้างบัญชีถี่เกินไป รอสักครู่');
      const { token, account } = await accounts.createGuest();
      return sendJson(res, 200, { token, account: accountView(account) });
    }
    if (post && path === '/login') {
      if (!logins.take(req)) return fail(res, 429, 'ลองหลายครั้งเกินไป รอ 1 นาที');
      const body = await readJson(req);
      const { token, account } = await accounts.login(body.username, body.password);
      logins.reset(req);
      return sendJson(res, 200, { token, account: accountView(account) });
    }
    if (req.method === 'GET' && path === '/leaderboard') return sendJson(res, 200, await accounts.leaderboard());

    const token = bearer(req);
    const me = await accounts.bySession(token);
    if (!token || !me) return fail(res, 401, 'กรุณาเข้าสู่ระบบใหม่');

    if (req.method === 'GET' && path === '/me') return sendJson(res, 200, accountView(me));
    if (post && path === '/me') {
      const body = await readJson(req);
      return sendJson(res, 200, accountView(await accounts.saveProfile(me.id, body)));
    }
    if (post && path === '/register') {
      if (!logins.take(req)) return fail(res, 429, 'ลองหลายครั้งเกินไป รอ 1 นาที');
      const body = await readJson(req);
      return sendJson(res, 200, accountView(await accounts.register(me.id, body.username, body.password)));
    }
    if (post && path === '/logout') {
      await accounts.logout(token);
      return sendJson(res, 200, {});
    }
    return fail(res, 404, 'ไม่มีคำสั่งนี้');
  };

  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    if (cors(req, res)) return true;
    route(req, res, url.pathname.slice('/api'.length)).catch((err) => {
      if (res.headersSent) return;
      if (err instanceof AccountError) fail(res, 400, err.message);
      else if (err instanceof SyntaxError) fail(res, 400, 'ข้อมูลที่ส่งมาอ่านไม่ได้');
      else {
        console.error('account api', err);
        fail(res, 500, 'เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง');
      }
    });
    return true;
  };
}
