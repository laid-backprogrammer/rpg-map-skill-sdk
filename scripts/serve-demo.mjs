import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { buildDemo, output } from './build-demo.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/serve-demo.mjs [--port 4173]\nBinds to 127.0.0.1 only. An occupied port is an error.');
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--port')) throw new Error('Expected --port <integer>.');
const port = args.length ? Number(args[1]) : 4173;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('Port must be an integer from 1 to 65535.');

await buildDemo();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    const target = resolve(output, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(`${output}${sep}`)) { response.writeHead(403); response.end('Forbidden'); return; }
    const info = await stat(target);
    if (!info.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 400); response.end('Not found');
  }
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is occupied. Choose another port with --port.` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Blockout Inspector: http://127.0.0.1:${port}/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
