import { createServer } from 'node:http';

/** Tiny server for Render's port scan and uptime pingers: 200 "OK" on GET/HEAD, 405 otherwise. */
export function createHealthServer() {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(req.method === 'HEAD' ? undefined : 'OK');
  });
  server.on('error', (err) => console.error('[health] server error:', err.message));
  return server;
}
