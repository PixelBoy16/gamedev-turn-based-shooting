import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Plugin, defineConfig } from 'vite';

const ALIGN = fileURLToPath(new URL('./src/art/look/align.json', import.meta.url));

/** Dev only: the look lab (?lab) saves layer alignment straight into the source tree. */
function lookAlign(): Plugin {
  return {
    name: 'look-align',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__look-align', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (typeof data !== 'object' || !data.layers || !data.hand) throw new Error('shape');
            writeFileSync(ALIGN, `${JSON.stringify(data, null, 2)}\n`);
            res.end('ok');
          } catch {
            res.statusCode = 400;
            res.end('bad align');
          }
        });
      });
    },
  };
}

export default defineConfig({ plugins: [lookAlign()] });
