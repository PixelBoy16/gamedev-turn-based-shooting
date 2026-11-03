import { IncomingMessage, ServerResponse } from 'node:http';

// Small helpers shared by the JSON APIs (accounts, admin).

const MAX_BODY = 512 * 1024;

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export const fail = (res: ServerResponse, status: number, error: string) => sendJson(res, status, { error });

export function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
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
        const v = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        if (v && typeof v === 'object' && !Array.isArray(v)) resolve(v);
        else reject(new Error('not an object'));
      } catch (err) {
        reject(err);
      }
    });
  });
}

export const bearer = (req: IncomingMessage) => /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;

/**
 * The game and admin pages are served from another origin (the static site), and
 * sign-in is a bearer token, not a cookie, so any origin may call. Returns true when
 * the request was a preflight and is answered.
 */
export function cors(req: IncomingMessage, res: ServerResponse): boolean {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  if (req.method !== 'OPTIONS') return false;
  res.writeHead(204);
  res.end();
  return true;
}

/** At most `max` attempts per address per minute (sign-in, account creation). */
export class RateLimit {
  private hits = new Map<string, { n: number; since: number }>();

  constructor(private max: number) {}

  /** Count one attempt; false if this address is over the limit. */
  take(req: IncomingMessage): boolean {
    const ip = req.socket.remoteAddress ?? '?';
    const now = Date.now();
    const h = this.hits.get(ip);
    const cur = h && now - h.since < 60_000 ? h : { n: 0, since: now };
    if (cur.n >= this.max) return false;
    this.hits.set(ip, { n: cur.n + 1, since: cur.since });
    if (this.hits.size > 10_000) this.hits.clear(); // keep memory bounded
    return true;
  }

  reset(req: IncomingMessage): void {
    this.hits.delete(req.socket.remoteAddress ?? '?');
  }
}
