import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 4174);
const types = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function sendFile(response, path) {
  response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(path).pipe(response);
}

function existing(path) {
  return existsSync(path) && statSync(path).isFile();
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  const cleanPath = normalize(pathname).replace(/^\/+/, '');
  if (cleanPath.startsWith('..')) return response.writeHead(400).end('Bad request');

  if (pathname === '/v2' || pathname.startsWith('/v2/')) {
    const asset = resolve(root, 'public', cleanPath);
    return sendFile(response, existing(asset) ? asset : join(root, 'public/v2/index.html'));
  }

  const asset = resolve(root, cleanPath || 'index.html');
  return sendFile(response, existing(asset) ? asset : join(root, 'index.html'));
}).listen(port, '127.0.0.1', () => {
  console.log(`Foundation server listening on http://127.0.0.1:${port}`);
});
