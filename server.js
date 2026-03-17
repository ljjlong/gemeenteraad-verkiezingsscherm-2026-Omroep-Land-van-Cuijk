'use strict';
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const { WebSocketServer } = require('ws');

/*
  Poort-configuratie:
    - Achter Nginx (reverse proxy):  PORT=8080  (standaard, HTTP/WS)
    - Standalone met SSL:            PORT=443   via SSL_CERT + SSL_KEY env vars
*/
const PORT     = parseInt(process.env.PORT || '8080', 10);
const SSL_CERT = process.env.SSL_CERT || '';
const SSL_KEY  = process.env.SSL_KEY  || '';

/* ── Koppelcode: 6 tekens, geen verwarrende chars ── */
const CHARS     = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIR_CODE = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
};

/* ── Lokaal IP-adres ── */
function getLocalIP() {
  const found = Object.values(os.networkInterfaces())
    .flat()
    .find(i => i.family === 'IPv4' && !i.internal);
  return found ? found.address : '127.0.0.1';
}

/* ══════════════════════════════════════
   HTTP REQUEST HANDLER
══════════════════════════════════════ */
function requestHandler(req, res) {
  const url = req.url.split('?')[0];

  /* CORS preflight */
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url === '/pair-code') {
    const localIP   = getLocalIP();
    const remoteUrl = `http://${localIP}:${PORT}/remote`;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: PAIR_CODE, remoteUrl, wsHost: `${localIP}:${PORT}` }));
    return;
  }

  let filePath = url === '/'       ? '/index.html'
               : url === '/remote' ? '/remote.html'
               : url;

  const fullPath = path.join(__dirname, filePath);
  const ext      = path.extname(fullPath).toLowerCase();

  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Niet gevonden'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ══════════════════════════════════════
   SERVER AANMAKEN – SSL of HTTP
══════════════════════════════════════ */
let server;
let usingSSL = false;

if (SSL_CERT && SSL_KEY) {
  try {
    server = https.createServer(
      { cert: fs.readFileSync(SSL_CERT), key: fs.readFileSync(SSL_KEY) },
      requestHandler
    );
    usingSSL = true;
  } catch (e) {
    console.error(`[server] SSL-certificaat laden mislukt: ${e.message}`);
    console.error('[server] Terugvallen op HTTP...');
    server = http.createServer(requestHandler);
  }
} else {
  server = http.createServer(requestHandler);
}

/* ══════════════════════════════════════
   WEBSOCKET
══════════════════════════════════════ */
const wss = new WebSocketServer({ server, path: '/ws' });

let dashboard = null;
let lastState = null;
const remotes = new Set();

function broadcast(remoteSet, msg) {
  const raw = typeof msg === 'string' ? msg : JSON.stringify(msg);
  remoteSet.forEach(ws => { if (ws.readyState === 1) ws.send(raw); });
}

wss.on('connection', ws => {
  ws.role = 'pending';

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (ws.role === 'pending') {
      if (msg.type === 'register' && msg.role === 'dashboard') {
        ws.role   = 'dashboard';
        dashboard = ws;
        console.log('[server] Dashboard verbonden');
        if (lastState) ws.send(JSON.stringify(lastState));
        return;
      }
      if (msg.type === 'register' && msg.role === 'remote') {
        if (msg.code !== PAIR_CODE) {
          ws.send(JSON.stringify({ type: 'error', message: 'Ongeldige koppelcode' }));
          return;
        }
        ws.role = 'remote';
        remotes.add(ws);
        ws.send(JSON.stringify({ type: 'paired' }));
        if (lastState) ws.send(JSON.stringify(lastState));
        console.log(`[server] Remote verbonden (${remotes.size} actief)`);
        return;
      }
      return;
    }

    if (ws.role === 'dashboard' && msg.type === 'state') {
      lastState = msg;
      broadcast(remotes, raw.toString());
      return;
    }

    if (ws.role === 'remote' && msg.type === 'command') {
      if (dashboard && dashboard.readyState === 1) dashboard.send(raw.toString());
      return;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'dashboard') { dashboard = null; console.log('[server] Dashboard verbroken'); }
    if (ws.role === 'remote')    { remotes.delete(ws); console.log(`[server] Remote verbroken (${remotes.size} actief)`); }
  });

  ws.on('error', () => {});
});

/* ══════════════════════════════════════
   START
══════════════════════════════════════ */
server.listen(PORT, '0.0.0.0', () => {
  const proto   = usingSSL ? 'https' : 'http';
  const localIP = getLocalIP();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Koppelcode : ${PAIR_CODE}                                   ║`);
  console.log(`║  Modus      : ${usingSSL ? 'HTTPS / WSS  (standalone SSL)  ' : 'HTTP  / WS   (of achter Nginx) '}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nDashboard : ${proto}://${localIP}:${PORT}/`);
  console.log(`Remote    : ${proto}://${localIP}:${PORT}/remote\n`);
});
