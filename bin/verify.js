#!/usr/bin/env node
'use strict';
// Offline verifier: anyone (insurer, court, arbitrator) can check an exported ledger with no server.
// Usage: node bin/verify.js ledger.json     |   node bin/verify.js --demo
const fs = require('node:fs');
const { Shipment, attribute } = require('../src/ledger');
const { seedDemo } = require('../src/demo');

const arg = process.argv[2];
if (!arg) { console.error('usage: verify.js <ledger.json> | --demo'); process.exit(2); }
const s = arg === '--demo' ? seedDemo().shipment : Shipment.fromJSON(JSON.parse(fs.readFileSync(arg, 'utf8')));
if (arg === '--demo') fs.writeFileSync('demo-ledger.json', JSON.stringify(s, null, 2));

const r = attribute(s);
console.log(`\nSealTrail audit: ${r.shipmentId}`);
console.log(`Integrity: ${r.integrity.valid ? 'VALID' : 'INVALID'} (${r.integrity.count} signed events, head ${r.integrity.head.slice(0, 16)}…)`);
r.integrity.issues.forEach((i) => console.log(`  ✗ event ${i.seq} [${i.code}] ${i.msg}`));
r.legs.forEach((l) => console.log(`  Leg ${l.leg}: ${l.holder.name.padEnd(30)} ${l.from} → ${l.to} (${l.hours}h) ${l.responsible ? '⚠ ' + l.reasons.join('; ') : 'ok'}`));
console.log(`Verdict: ${r.verdict}\n`);
if (arg === '--demo') console.log('Wrote demo-ledger.json. Edit it and re-run to see tamper detection.');
process.exit(r.integrity.valid ? 0 : 1);
