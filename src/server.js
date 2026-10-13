'use strict';
// Zero-dependency HTTP API + static web UI. Run: node src/server.js  (PORT env optional)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Shipment, createIdentity, verify, attribute, CONDITIONS } = require('./ledger');
const { seedDemo } = require('./demo');

const WEB = path.join(__dirname, '..', 'web');
const state = { parties: {}, shipments: {} };

function reset() {
  const { parties, shipment } = seedDemo();
  state.parties = Object.fromEntries(Object.values(parties).map((p) => [p.id, p]));
  state.shipments = { [shipment.id]: shipment };
}
reset();

const publicParty = ({ privateKey, ...p }) => p; // never ship private keys to clients
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, fail) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 5e6) fail(new Error('payload too large')); });
  req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { fail(new Error('invalid JSON')); } });
});
const party = (id) => { const p = state.parties[id]; if (!p) throw new Error(`unknown party ${id}`); return p; };
const shipment = (id) => { const s = state.shipments[id]; if (!s) throw Object.assign(new Error('shipment not found'), { code: 404 }); return s; };

const routes = [
  ['GET', /^\/api\/parties$/, () => Object.values(state.parties).map(publicParty)],
  ['POST', /^\/api\/parties$/, (_, b) => { const p = createIdentity(b.name, b.role || 'carrier'); state.parties[p.id] = p; return publicParty(p); }],
  ['GET', /^\/api\/shipments$/, () => Object.values(state.shipments).map((s) => ({ id: s.id, description: s.description, events: s.events.length, holder: s.holder?.name || null, valid: verify(s).valid }))],
  ['POST', /^\/api\/shipments$/, (_, b) => {
    if (!b.id || state.shipments[b.id]) throw new Error('missing or duplicate shipment id');
    const s = new Shipment(b); state.shipments[s.id] = s; return s.toJSON();
  }],
  ['GET', /^\/api\/shipments\/([\w-]+)$/, ([id]) => shipment(id).toJSON()],
  ['POST', /^\/api\/shipments\/([\w-]+)\/handover$/, ([id], b) => shipment(id).handover({
    from: party(b.fromId), to: party(b.toId), location: b.location, condition: b.condition,
    notes: b.notes, evidence: b.evidence || [], weightKg: b.weightKg === '' || b.weightKg == null ? undefined : Number(b.weightKg),
  })],
  ['GET', /^\/api\/shipments\/([\w-]+)\/report$/, ([id]) => attribute(shipment(id))],
  // Independent verification of an exported ledger file: no trust in this server needed.
  ['POST', /^\/api\/verify$/, (_, b) => attribute(Shipment.fromJSON(b))],
  // Demo-only: simulate a dishonest party editing history, to show detection.
  ['POST', /^\/api\/shipments\/([\w-]+)\/tamper$/, ([id], b) => {
    const s = shipment(id), e = s.events[b.seq ?? s.events.length - 1];
    if (!e) throw new Error('no such event');
    if (b.mode === 'delete') s.events.splice(e.seq, 1); else e.condition = 'intact';
    return { tampered: true, mode: b.mode || 'edit', seq: e.seq };
  }],
  ['POST', /^\/api\/reset$/, () => { reset(); return { ok: true }; }],
  ['GET', /^\/api\/meta$/, () => ({ conditions: CONDITIONS })],
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    for (const [m, re, fn] of routes) {
      const hit = req.method === m && url.pathname.match(re);
      if (hit) return send(res, 200, await fn(hit.slice(1), m === 'POST' ? await readBody(req) : {}));
    }
    if (req.method === 'GET') {
      const f = path.normalize(path.join(WEB, url.pathname === '/' ? 'index.html' : url.pathname));
      if (f.startsWith(WEB) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
        return fs.createReadStream(f).pipe(res);
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (err) { send(res, err.code === 404 ? 404 : 400, { error: err.message }); }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`SealTrail running → http://localhost:${port}`));
}
module.exports = { server, reset, state };
