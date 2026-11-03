import { createReadStream, statSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

// Serves the built game (dist/) from the room server itself, so one address carries the
// pages, the APIs and the WebSocket. Used by the Docker image (STATIC_DIR); in development
// and on Render the pages come from Vite or a separate static site instead.

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const ALIASES: Record<string, string> = { '/': '/index.html', '/admin': '/admin.html', '/admin/': '/admin.html' };

/** Returns a handler that answers GET/HEAD for files under `dir`; false when it isn't one. */
export function staticFiles(dir: string): (req: IncomingMessage, res: ServerResponse) => boolean {
  const root = normalize(dir) + sep;
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      return false;
    }
    path = ALIASES[path] ?? path;
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) return false;
    let size: number;
    try {
      const st = statSync(file);
      if (!st.isFile()) return false;
      size = st.size;
    } catch {
      return false;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': size,
      // Vite puts a content hash in every file name under assets/; pages and art keep their names
      'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  };
}
