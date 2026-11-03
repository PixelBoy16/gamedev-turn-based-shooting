import { DEFAULT_PORT } from './protocol';

/** The room server's WebSocket address: VITE_SERVER_URL, or this host on the default port. */
export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  // a bare host (what a hosting dashboard hands out) gets a secure WebSocket scheme
  if (env) return /^wss?:\/\//.test(env) ? env : `wss://${env}`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname || 'localhost'}:${DEFAULT_PORT}`;
}

/** The same server over HTTP(S), for the admin API. */
export const serverHttpUrl = () => serverUrl().replace(/^ws/, 'http');
