import Phaser from 'phaser';
import { applyConfig } from '../core/config';
import { ClientMsg, MatchView, RoomView, ServerMsg } from './protocol';
import { account } from './account';
import { serverUrl } from './serverUrl';

// One WebSocket to the room server, shared by the lobby and battle scenes.
// Reconnects on its own and re-claims the seat with the token the server gave us,
// kept in sessionStorage so a reload rejoins but a second tab is a second player.

const SEAT_KEY = 'crater-clash:seat';

class NetClient extends Phaser.Events.EventEmitter {
  room: RoomView | null = null;
  match: MatchView | null = null;
  you = -1; // player id in the room
  /** The server knows our account on this connection (needed for ranked). */
  authed = false;
  private ws: WebSocket | null = null;
  private wanted = false;
  private retryMs = 500;
  private seat: { code: string; token: string } | null = null;

  constructor() {
    super();
    // signed in, switched account or bought something while connected: tell the server
    // (it checks what we wear against what we own)
    account.onChange(() => {
      const owned = account.view?.owned.length ?? 0;
      if (this.connected && account.token && (account.token !== this.authToken || owned !== this.authOwned)) this.auth();
    });
    try {
      this.seat = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? 'null');
    } catch {
      this.seat = null;
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** True once we have a seat in a room (even while reconnecting). */
  get inRoom(): boolean {
    return !!this.seat;
  }

  connect(): void {
    this.wanted = true;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const ws = new WebSocket(serverUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.retryMs = 500;
      this.authed = false;
      this.authToken = null;
      if (account.token) this.auth();
      if (this.seat) this.send({ t: 'rejoin', ...this.seat });
      this.emit('status');
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.receive(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.emit('status');
      if (!this.wanted) return;
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(5000, this.retryMs * 2);
    };
  }

  private authToken: string | null = null;
  private authOwned = -1;

  /**
   * Sign in to the room server again (after the account changed over HTTP, e.g. a new display
   * name) and wait until it has answered, so the next message is handled under the new account.
   */
  reauth(): Promise<void> {
    if (!this.connected || !account.token) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.off('account', done);
        this.off('error', done);
        resolve();
      };
      const timer = setTimeout(done, 3000);
      this.once('account', done);
      this.once('error', done);
      this.auth();
    });
  }

  private auth(): void {
    this.authToken = account.token;
    this.authOwned = account.view?.owned.length ?? 0;
    this.send({ t: 'auth', token: account.token! });
  }

  send(msg: ClientMsg): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  /** Leave the room for good (the server hands our tank to a bot). */
  leave(): void {
    this.send({ t: 'leave' });
    this.forget();
  }

  private forget(): void {
    this.seat = null;
    this.room = null;
    this.match = null;
    try {
      sessionStorage.removeItem(SEAT_KEY);
    } catch {
      // ignore
    }
  }

  private receive(msg: ServerMsg): void {
    switch (msg.t) {
      case 'over':
        account.lastChange = null; // the ranked rating change and rewards follow in an 'account' message
        account.lastReward = null;
        break;
      case 'account':
        this.authed = true;
        this.authOwned = msg.account.owned.length;
        account.update(msg.account, msg.ratingChange, msg.reward);
        break;
      case 'joined':
        applyConfig(msg.game); // names and limits in the room's wardrobe match the server's
        this.you = msg.you;
        this.seat = { code: msg.code, token: msg.token };
        try {
          sessionStorage.setItem(SEAT_KEY, JSON.stringify(this.seat));
        } catch {
          // ignore: only reload-rejoin is lost
        }
        break;
      case 'room':
        this.room = msg.room;
        break;
      case 'left':
        this.forget();
        break;
      case 'match':
        applyConfig(msg.match.game); // the server's numbers win, so both sides simulate alike
        this.match = msg.match;
        break;
      case 'turn':
        // keep the cached view current, for a battle scene that is just starting
        if (this.match) Object.assign(this.match, { turn: msg.turn, tanks: msg.tanks });
        break;
    }
    this.emit(msg.t, msg);
    this.emit('any', msg);
  }
}

export const net = new NetClient();
