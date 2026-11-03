import type { AccountView, LeaderRow } from './protocol';
import { serverHttpUrl } from './serverUrl';

// The player's account on the server (server/api.ts). The first time the game opens
// it quietly creates a guest account, so the wardrobe and results are saved without
// a sign-up; the token lives in localStorage. If the server can't be reached the game
// still plays offline and tries again later.

const TOKEN_KEY = 'crater-clash:account';

class AccountClient {
  token: string | null = read();
  view: AccountView | null = null;
  /** Rating change from the last ranked match, until the next one. */
  lastChange: number | null = null;
  private listeners = new Set<() => void>();
  private loading: Promise<AccountView | null> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: Record<string, unknown> = {};

  /** Call `fn` whenever the account changes; returns the unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  private setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // storage blocked: the account lasts this visit only
    }
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${serverHttpUrl()}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error ?? 'เซิร์ฟเวอร์ขัดข้อง'), { status: res.status });
    return data as T;
  }

  /** Load the account, creating a guest the first time. Null while the server is unreachable. */
  ensure(): Promise<AccountView | null> {
    if (this.view) return Promise.resolve(this.view);
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(): Promise<AccountView | null> {
    try {
      if (this.token) {
        try {
          this.view = await this.call<AccountView>('/me');
        } catch (err) {
          if ((err as { status?: number }).status !== 401) throw err;
          this.setToken(null); // signed out elsewhere or the database was reset
        }
      }
      if (!this.view) {
        const r = await this.call<{ token: string; account: AccountView }>('/guest', {});
        this.setToken(r.token);
        this.view = r.account;
      }
      this.changed();
      return this.view;
    } catch {
      return null;
    }
  }

  async register(username: string, password: string): Promise<void> {
    this.view = await this.call<AccountView>('/register', { username, password });
    this.changed();
  }

  /** Switch this device to an existing account (the guest progress here is left behind). */
  async login(username: string, password: string): Promise<void> {
    const r = await this.call<{ token: string; account: AccountView }>('/login', { username, password });
    this.setToken(r.token);
    this.view = r.account;
    this.lastChange = null;
    this.changed();
  }

  /** Sign out and continue as a fresh guest. */
  async logout(): Promise<void> {
    await this.call('/logout', {}).catch(() => undefined);
    this.setToken(null);
    this.view = null;
    this.lastChange = null;
    await this.ensure();
  }

  /** Save wardrobe/name changes; quick successive edits go out as one request. */
  save(p: { displayName?: string; loadout?: unknown; items?: unknown }): Promise<void> {
    Object.assign(this.pending, p);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    return new Promise((resolve, reject) => {
      this.saveTimer = setTimeout(async () => {
        const body = this.pending;
        this.pending = {};
        if (!this.view) return resolve();
        try {
          this.view = await this.call<AccountView>('/me', body);
          this.changed();
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 600);
    });
  }

  leaderboard(): Promise<LeaderRow[]> {
    return this.call<LeaderRow[]>('/leaderboard');
  }

  /** New numbers pushed by the room server after a match. */
  update(view: AccountView, ratingChange?: number): void {
    this.view = view;
    if (ratingChange !== undefined) this.lastChange = ratingChange;
    this.changed();
  }
}

function read(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const account = new AccountClient();
