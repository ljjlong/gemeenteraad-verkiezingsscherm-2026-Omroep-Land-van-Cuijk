'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { WebSocketServer } = require('ws');

const PORT = 8080;

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

/* ══════════════════════════════════════
   HTTP – STATISCHE BESTANDEN
══════════════════════════════════════ */
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/pair-code') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: PAIR_CODE }));
    return;
  }

  let filePath = url === '/' ? '/index.html'
               : url === '/remote' ? '/remote.html'
               : url;

  const fullPath = path.join(__dirname, filePath);
  const ext      = path.extname(fullPath).toLowerCase();

  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Niet gevonden'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ══════════════════════════════════════
   WEBSOCKET
══════════════════════════════════════ */
const wss = new WebSocketServer({ server, path: '/ws' });

let dashboard    = null;
let lastState    = null;
const remotes    = new Set();

function broadcast(remoteSet, msg) {
  const raw = typeof msg === 'string' ? msg : JSON.stringify(msg);
  remoteSet.forEach(ws => { if (ws.readyState === 1) ws.send(raw); });
}

wss.on('connection', ws => {
  ws.role = 'pending';

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    /* ── Registratie ── */
    if (ws.role === 'pending') {
      if (msg.type === 'register' && msg.role === 'dashboard') {
        ws.role  = 'dashboard';
        dashboard = ws;
        console.log('[server] Dashboard verbonden');
        if (lastState) ws.send(JSON.stringify(lastState)); // hersend state bij reconnect
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

    /* ── Dashboard → doorsturen naar remotes ── */
    if (ws.role === 'dashboard' && msg.type === 'state') {
      lastState = msg;
      broadcast(remotes, raw.toString());
      return;
    }

    /* ── Remote → doorsturen naar dashboard ── */
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
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  Koppelcode:  ${PAIR_CODE}               ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('\nDashboard:');
  ips.forEach(ip => console.log(`  http://${ip}:${PORT}/`));
  console.log('\nRemote:');
  ips.forEach(ip => console.log(`  http://${ip}:${PORT}/remote`));
  console.log('');
});
