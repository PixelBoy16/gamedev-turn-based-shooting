import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { GameConfig, applyConfig, validateConfig } from '../src/core/config';
import { ClientMsg, DEFAULT_PORT, ServerMsg } from '../src/net/protocol';
import { Conn, Lobby } from './rooms';

// Room server: `npm run server`. One JSON message per WebSocket frame.

// Game numbers are read from disk at start (GAME_CONFIG overrides the path), so a
// deployed server picks up an edited config on restart without a rebuild. Every
// match carries them to the clients.
const configFile = process.env.GAME_CONFIG ?? fileURLToPath(new URL('../config/game.json', import.meta.url));
const game: unknown = JSON.parse(readFileSync(configFile, 'utf8'));
const report = validateConfig(game);
for (const w of report.warnings) console.warn(`config: ${w}`);
if (report.errors.length) {
  for (const e of report.errors) console.error(`config: ${e}`);
  console.error(`${configFile} has errors; not starting`);
  process.exit(1);
}
applyConfig(game as GameConfig);

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const lobby = new Lobby();
// Plain HTTP answers the host's health check; WebSockets upgrade on the same port.
const http = createServer((req, res) => {
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
