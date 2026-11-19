// Local-only HTTP endpoint that hook/send.js posts Claude Code events to.
const http = require('http');

const MAX_BODY = 64 * 1024;

function startServer({ store, onDisplay, port = 7777, host = '127.0.0.1' }) {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/state') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(store.display()));
    }
    if (req.method !== 'POST' || req.url !== '/event') {
      res.writeHead(404);
      return res.end();
    }
    // Only local tools may post: browsers always send Origin, and a plain-text "simple request"
    // could otherwise skip the CORS preflight.
    if (req.headers.origin) {
      res.writeHead(403);
      return res.end();
    }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      res.writeHead(415);
      return res.end();
    }
    let size = 0;
    const chunks = [];
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) tooBig = true;
      else chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) {
        res.writeHead(413);
        return res.end();
      }
      let evt;
      try {
        evt = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400);
        return res.end();
      }
      if (!evt || typeof evt !== 'object') {
        res.writeHead(400);
        return res.end();
      }
      const before = store.display();
      const after = store.apply(evt, Date.now());
      if (after !== before) onDisplay(after);
      res.writeHead(204);
      res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

module.exports = { startServer };
