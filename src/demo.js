'use strict';
const { Shipment, createIdentity, sha256 } = require('./ledger');

// Realistic Pune -> Ahilyanagar -> Mumbai part-load scenario: 4 handlers, damage on leg 3.
function seedDemo() {
  const parties = {
    shipper: createIdentity('Kale Ceramics (Shipper)', 'shipper'),
    truck1: createIdentity('Shree Ganesh Transport', 'carrier'),
    hub: createIdentity('Ahilyanagar Cross-Dock Hub', 'warehouse'),
    truck2: createIdentity('Raj Logistics (Last Mile)', 'carrier'),
    receiver: createIdentity('Mumbai Home Decor Store', 'receiver'),
  };
  const s = new Shipment({ id: 'SHP-24017', description: '12 cartons glazed ceramic tiles', origin: 'Pune MIDC', destination: 'Andheri, Mumbai' });
  const t0 = Date.UTC(2026, 9, 12, 3, 30);
  const H = 36e5;
  const ev = (label) => [{ label, sha256: sha256(label + '-photo-bytes') }];
  s.handover({ from: parties.shipper, to: parties.truck1, location: 'Pune MIDC', condition: 'intact', weightKg: 240.0, ts: t0, evidence: ev('pickup-pallet') , notes: '12 cartons shrink-wrapped' });
  s.handover({ from: parties.truck1, to: parties.hub, location: 'Ahilyanagar Hub', condition: 'intact', weightKg: 240.1, ts: t0 + 3.5 * H, evidence: ev('hub-inbound') });
  s.handover({ from: parties.hub, to: parties.truck2, location: 'Ahilyanagar Hub', condition: 'intact', weightKg: 239.9, ts: t0 + 9 * H, evidence: ev('hub-outbound') });
  s.handover({ from: parties.truck2, to: parties.receiver, location: 'Andheri, Mumbai', condition: 'major_damage', weightKg: 236.4, ts: t0 + 15 * H, evidence: ev('delivery-crushed-cartons'), notes: '2 cartons crushed, wrap torn' });
  return { parties, shipment: s };
}

module.exports = { seedDemo };
