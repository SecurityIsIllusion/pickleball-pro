const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4000;
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

http.createServer((req, res) => {
  const safePath = req.url.replace(/\.\./g, '');
  const filePath = path.join(__dirname, 'public', safePath === '/' ? 'index.html' : safePath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Pickleball Pro running at http://localhost:${PORT}`));
