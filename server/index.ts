import { WebSocket, WebSocketServer } from 'ws';
import { ClientMsg, DEFAULT_PORT, ServerMsg } from '../src/net/protocol';
import { Conn, Lobby } from './rooms';

// Room server: `npm run server`. One JSON message per WebSocket frame.

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const lobby = new Lobby();
const wss = new WebSocketServer({ port });
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

console.log(`Crater Clash room server on ws://localhost:${port}`);
