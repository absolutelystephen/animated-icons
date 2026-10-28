// A tiny static file server, used by the build scripts (to give headless
// Chromium a real http:// origin) and by `npm run serve` for local testing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.mov': 'video/quicktime',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * Serve `root` on 127.0.0.1. `extra` maps URL paths to { type, body } for
 * pages that only exist in memory (such as the render harness).
 * Resolves to { server, url }.
 */
export function startServer(root, { port = 0, extra = {} } = {}) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (extra[urlPath]) {
      res.writeHead(200, { 'Content-Type': extra[urlPath].type, 'Cache-Control': 'no-store' });
      res.end(extra[urlPath].body);
      return;
    }
    let file = path.join(base, urlPath);
    if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}
