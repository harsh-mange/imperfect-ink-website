const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

const server = http.createServer((request, response) => {
  let requested;
  try { requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { response.writeHead(400); return response.end('Bad request'); }
  const file = path.resolve(root, requested === '/' ? 'index.html' : `.${requested}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) { response.writeHead(403); return response.end('Forbidden'); }
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, {'Allow':'GET, HEAD'}); return response.end('Method not allowed'); }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); return response.end('Not found'); }
    response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'X-DNS-Prefetch-Control':'off', 'X-Permitted-Cross-Domain-Policies':'none', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy':'same-origin', 'Cache-Control':'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing Imperfect Ink server or run with PORT=<free-port>.`);
  } else {
    console.error(`Server failed to start: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Imperfect Ink running at http://localhost:${port}`);
});
