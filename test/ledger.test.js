'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Shipment, createIdentity, verify, attribute } = require('../src/ledger');
const { seedDemo } = require('../src/demo');

const clone = (s) => Shipment.fromJSON(JSON.parse(JSON.stringify(s)));

test('clean demo ledger verifies', () => {
  const { shipment } = seedDemo();
  const r = verify(shipment);
  assert.equal(r.valid, true, JSON.stringify(r.issues));
  assert.equal(r.count, 4);
});

test('damage is attributed to the correct leg and party', () => {
  const { shipment } = seedDemo();
  const r = attribute(shipment);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].leg, 3);
  assert.equal(r.findings[0].party, 'Raj Logistics (Last Mile)');
  assert.match(r.findings[0].reasons.join(' '), /major_damage/);
  assert.match(r.findings[0].reasons.join(' '), /weight dropped 3.50 kg/);
  assert.match(r.verdict, /DAMAGE ATTRIBUTED/);
});

test('editing a recorded condition after signing is detected', () => {
  const s = clone(seedDemo().shipment);
  s.events[3].condition = 'intact';
  const r = attribute(s);
  assert.equal(r.integrity.valid, false);
  assert.ok(r.integrity.issues.some((i) => i.code === 'HASH'));
  assert.match(r.verdict, /TAMPERED/);
});

test('deleting an event breaks the chain', () => {
  const s = clone(seedDemo().shipment);
  s.events.splice(1, 1);
  const codes = verify(s).issues.map((i) => i.code);
  assert.ok(codes.includes('CHAIN'));
});

test('a forged signature from an outsider is rejected', () => {
  const s = clone(seedDemo().shipment);
  const mallory = createIdentity('Mallory', 'carrier');
  s.events[2].to = { ...s.events[2].to, publicKey: mallory.publicKey };
  const codes = verify(s).issues.map((i) => i.code);
  assert.ok(codes.includes('SIG_TO') || codes.includes('ID') || codes.includes('HASH'));
});

test('only the current holder can hand over goods', () => {
  const { parties, shipment } = seedDemo();
  assert.throws(() => shipment.handover({ from: parties.truck1, to: parties.hub, location: 'x', condition: 'intact' }), /not the current holder/);
});

test('invalid condition is rejected', () => {
  const a = createIdentity('A', 'shipper'), b = createIdentity('B', 'carrier');
  const s = new Shipment({ id: 'T1' });
  assert.throws(() => s.handover({ from: a, to: b, location: 'x', condition: 'fine' }), /condition must be/);
});

test('ledger survives JSON export/import and verifies independently', () => {
  const s = clone(seedDemo().shipment);
  assert.equal(verify(s).valid, true);
});

test('a ledger signed in the browser app (tweetnacl) verifies in Node', () => {
  const s = Shipment.fromJSON(require('./fixtures/browser-signed-ledger.json'));
  const r = attribute(s);
  assert.equal(r.integrity.valid, true, JSON.stringify(r.integrity.issues));
  assert.equal(r.findings[0].leg, 3);
});
