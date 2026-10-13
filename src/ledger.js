'use strict';
// SealTrail core: tamper-evident, hash-chained, multi-signed custody ledger.
// Zero dependencies. Every handover is co-signed by giver and receiver (Ed25519),
// links to the previous event by SHA-256, and carries hashes of condition evidence.
const crypto = require('node:crypto');

const CONDITIONS = ['intact', 'minor_damage', 'major_damage', 'missing_items'];
const SEVERITY = { intact: 0, minor_damage: 1, major_damage: 2, missing_items: 3 };
const GENESIS = '0'.repeat(64);

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

// Deterministic JSON: sorted keys so every party hashes identical bytes.
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

// Portable key format: raw 32-byte Ed25519 keys, base64. Identical to the browser app (tweetnacl),
// so a ledger signed on a phone verifies here and vice versa.
const b64u = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (u) => { const s = u.replace(/-/g, '+').replace(/_/g, '/'); return s + '='.repeat((4 - (s.length % 4)) % 4); };

function createIdentity(name, role) {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = unb64u(jwk.x);
  return { id: sha256(pub).slice(0, 12), name, role, publicKey: pub, privateKey: unb64u(jwk.d) };
}

function sign(id, msg) {
  const key = crypto.createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', d: b64u(id.privateKey), x: b64u(id.publicKey) }, format: 'jwk' });
  return crypto.sign(null, Buffer.from(msg), key).toString('base64');
}

function verifySig(pubB64, msg, sigB64) {
  try {
    const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: b64u(pubB64) }, format: 'jwk' });
    return crypto.verify(null, Buffer.from(msg), key, Buffer.from(sigB64, 'base64'));
  } catch { return false; }
}

// Fields covered by signatures and the event hash.
function eventBody(e) {
  return {
    seq: e.seq, shipmentId: e.shipmentId, type: e.type, ts: e.ts, location: e.location,
    from: e.from, to: e.to, condition: e.condition, notes: e.notes,
    evidence: e.evidence, weightKg: e.weightKg, prevHash: e.prevHash,
  };
}

class Shipment {
  constructor({ id, description, origin, destination }) {
    this.id = id; this.description = description;
    this.origin = origin; this.destination = destination;
    this.events = [];
  }

  get head() { return this.events.length ? this.events[this.events.length - 1].hash : GENESIS; }
  get holder() { return this.events.length ? this.events[this.events.length - 1].to : null; }

  // Record a co-signed handover. First event is the pickup (shipper -> first carrier).
  // Both parties sign identical canonical bytes, so neither can later deny the recorded condition.
  handover({ from, to, location, condition, notes = '', evidence = [], weightKg, ts = Date.now() }) {
    if (!CONDITIONS.includes(condition)) throw new Error(`condition must be one of ${CONDITIONS.join(', ')}`);
    if (!from || !to) throw new Error('handover requires both from and to identities');
    if (this.events.length && this.holder.id !== from.id)
      throw new Error(`${from.name} is not the current holder (${this.holder.name})`);
    const e = {
      seq: this.events.length, shipmentId: this.id, type: this.events.length ? 'handover' : 'pickup', ts, location,
      from: pick(from), to: pick(to), condition, notes,
      evidence: evidence.map((x) => ({ label: x.label, sha256: x.sha256 || sha256(x.data) })),
      weightKg, prevHash: this.head,
    };
    const msg = canonical(eventBody(e));
    e.hash = sha256(msg);
    e.sigFrom = sign(from, msg);
    e.sigTo = sign(to, msg);
    this.events.push(e);
    return e;
  }

  toJSON() { return { id: this.id, description: this.description, origin: this.origin, destination: this.destination, events: this.events }; }
  static fromJSON(o) { const s = new Shipment(o); s.events = o.events; return s; }
}

const pick = (p) => ({ id: p.id, name: p.name, role: p.role, publicKey: p.publicKey });

// Full audit: chain integrity, both signatures, custody continuity, clock order.
function verify(shipment) {
  const issues = [];
  let prev = GENESIS;
  shipment.events.forEach((e, i) => {
    const msg = canonical(eventBody(e));
    if (e.seq !== i) issues.push({ seq: i, code: 'SEQ', msg: 'sequence number out of order' });
    if (e.prevHash !== prev) issues.push({ seq: i, code: 'CHAIN', msg: 'broken link to previous event (deleted or reordered)' });
    if (sha256(msg) !== e.hash) issues.push({ seq: i, code: 'HASH', msg: 'event content edited after signing' });
    if (!verifySig(e.from.publicKey, msg, e.sigFrom)) issues.push({ seq: i, code: 'SIG_FROM', msg: `${e.from.name}'s signature invalid` });
    if (!verifySig(e.to.publicKey, msg, e.sigTo)) issues.push({ seq: i, code: 'SIG_TO', msg: `${e.to.name}'s signature invalid` });
    if (sha256(e.from.publicKey).slice(0, 12) !== e.from.id || sha256(e.to.publicKey).slice(0, 12) !== e.to.id)
      issues.push({ seq: i, code: 'ID', msg: 'party id does not match its key' });
    if (i > 0) {
      const p = shipment.events[i - 1];
      if (p.to.id !== e.from.id) issues.push({ seq: i, code: 'CUSTODY_GAP', msg: `${e.from.name} handed over goods held by ${p.to.name}` });
      if (e.ts < p.ts) issues.push({ seq: i, code: 'CLOCK', msg: 'timestamp earlier than previous event' });
    }
    prev = e.hash;
  });
  return { valid: issues.length === 0, issues, head: prev, count: shipment.events.length };
}

// Liability engine: pin each deterioration to the leg (holder) during which it happened.
function attribute(shipment, { weightToleranceKg = 0.5 } = {}) {
  const ev = shipment.events, legs = [], findings = [];
  for (let i = 1; i < ev.length; i++) {
    const a = ev[i - 1], b = ev[i];
    const leg = {
      leg: i, holder: a.to, from: a.location, to: b.location,
      startTs: a.ts, endTs: b.ts, hours: +((b.ts - a.ts) / 36e5).toFixed(2),
      startCondition: a.condition, endCondition: b.condition, reasons: [],
    };
    if (SEVERITY[b.condition] > SEVERITY[a.condition])
      leg.reasons.push(`condition worsened ${a.condition} → ${b.condition}`);
    if (typeof a.weightKg === 'number' && typeof b.weightKg === 'number' && a.weightKg - b.weightKg > weightToleranceKg)
      leg.reasons.push(`weight dropped ${(a.weightKg - b.weightKg).toFixed(2)} kg`);
    leg.responsible = leg.reasons.length > 0;
    legs.push(leg);
    if (leg.responsible) findings.push({ leg: i, party: a.to.name, partyId: a.to.id, between: `${leg.from} → ${leg.to}`, reasons: leg.reasons, evidence: b.evidence, notes: b.notes });
  }
  const integrity = verify(shipment);
  return {
    shipmentId: shipment.id, integrity, legs, findings,
    verdict: !integrity.valid ? 'LEDGER_TAMPERED: records cannot be relied on'
      : findings.length ? `DAMAGE ATTRIBUTED to ${[...new Set(findings.map((f) => f.party))].join(', ')}`
      : 'NO DAMAGE: delivered in recorded condition',
  };
}

module.exports = { Shipment, createIdentity, verify, attribute, canonical, sha256, CONDITIONS, GENESIS };
