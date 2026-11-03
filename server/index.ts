import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { GameConfig, applyConfig, validateConfig } from '../src/core/config';
import { ClientMsg, DEFAULT_PORT, ServerMsg } from '../src/net/protocol';
import { Accounts, accountView } from './accounts';
import { adminApi } from './admin';
import { accountApi } from './api';
import { ConfigStore } from './configStore';
import { openDb } from './db';
import { Conn, Lobby, Services, publishedConfig, setPublished } from './rooms';

// Room server: `npm run server`. One JSON message per WebSocket frame.

// The seed config is read from disk at start (GAME_CONFIG overrides the path), so a
// deployed server picks up an edited file on restart without a rebuild. Versions
// published from the admin page are kept in the database and win over the seed.
const configFile = process.env.GAME_CONFIG ?? fileURLToPath(new URL('../config/game.json', import.meta.url));
const seed: unknown = JSON.parse(readFileSync(configFile, 'utf8'));
const report = validateConfig(seed);
for (const w of report.warnings) console.warn(`config: ${w}`);
if (report.errors.length) {
  for (const e of report.errors) console.error(`config: ${e}`);
  console.error(`${configFile} has errors; not starting`);
  process.exit(1);
}
// Database: PostgreSQL when DATABASE_URL is set, otherwise an embedded one in DATA_DIR.
const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url));
const db = await openDb(process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : { dir: join(dataDir, 'db') });
console.log(process.env.DATABASE_URL ? 'database: PostgreSQL' : `database: embedded (${join(dataDir, 'db')})`);

const store = await ConfigStore.open(db, seed as GameConfig);
applyConfig(store.latest.config);
setPublished(store.latest.config);
console.log(`game config v${store.latest.version} (${store.latest.by})`);
const accounts = new Accounts(db, publishedConfig);
const admin = adminApi({ store, accounts, password: process.env.ADMIN_PASSWORD, onPublish: setPublished });
if (!process.env.ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set: the admin page is off');

const api = accountApi(accounts);
const services: Services = {
  account: async (token) => {
    const a = await accounts.bySession(token);
    return a && { id: a.id, view: accountView(a) };
  },
  accountView: async (id) => {
    const a = await accounts.get(id);
    return a && accountView(a);
  },
  record: (m) => accounts.recordMatch(m),
};

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const lobby = new Lobby(Math.random, services);
const http = createServer((req, res) => {
  if (admin(req, res) || api(req, res)) return;
  res.writeHead(req.url === '/health' ? 200 : 404, { 'content-type': 'text/plain' });
  res.end(req.url === '/health' ? 'ok' : 'not found');
});
const wss = new WebSocketServer({ server: http });
const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (ws) => {
  const conn: Conn = {
    send: (msg: ServerMsg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    try {
      lobby.handle(conn, msg);
    } catch (err) {
      console.error('message failed', msg?.t, err); // one bad message must not take the server down
    }
  });
  ws.on('close', () => lobby.disconnect(conn));
});

// Drop connections that stopped answering (a tablet that went to sleep), so their seat shows as offline.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, 10000);

http.listen(port, () => console.log(`Crater Clash room server on ws://localhost:${port}`));
