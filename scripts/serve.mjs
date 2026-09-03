// Tiny static server over dist/ for gate scripts (no deps).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const root = new URL('../dist', import.meta.url).pathname;
// 4330, NOT 4321: 4321 belongs to `astro dev`. A static server squatting on
// the dev port is the one way to make hot reload look dead. Gates pass their
// own port to start() and are unaffected.
const port = Number(process.env.PORT ?? 4330);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function start(p = port) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      path = normalize(path).replace(/^(\.\.[/\\])+/, '');
      let file = join(root, path);
      const s = await stat(file).catch(() => null);
      if (s?.isDirectory()) file = join(file, 'index.html');
      else if (!s && !extname(file)) file = `${file}/index.html`;
      const body = await readFile(file).catch(() => null);
      if (body === null) {
        const nf = await readFile(join(root, '404.html')).catch(() => null);
        res.writeHead(404, { 'content-type': types['.html'] });
        res.end(nf ?? 'not found');
        return;
      }
      res.writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  return new Promise((resolve) => server.listen(p, () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await start();
  console.log(`serving dist/ on http://localhost:${port}`);
}
