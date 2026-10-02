// Tiny static server for the bennyshub folder (tests and galleries need http://).
// node tools/serve.cjs [port]  → serves bennyshub/ ; module: start(port) → Promise<{port, close}>
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');   // .../bennyshub
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};
function start(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    srv.listen(port || 0, '127.0.0.1', () => resolve({ port: srv.address().port, close: () => srv.close(), root: ROOT }));
  });
}
module.exports = { start, ROOT };
if (require.main === module) start(+process.argv[2] || 8765).then(s => console.log('serving', ROOT, 'on http://127.0.0.1:' + s.port + '/'));
