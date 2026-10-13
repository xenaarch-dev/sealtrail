# SealTrail: Claude Code PRD

**Challenge:** Seva First Innovation Challenge, Infrastructure and Mobility
**Problem #1120:** Small freight operators cannot prove when goods were damaged as responsibility passes through several handlers.

## 1. Problem
A part-load shipment in India often moves shipper → truck → cross-dock → second truck → receiver. When it arrives damaged, every handler says "it was fine when I passed it on." Records are paper challans, WhatsApp photos and verbal confirmations. Any of these can be edited, deleted, or denied. The small operator who cannot prove innocence eats the loss, and insurers reject claims for lack of evidence.

## 2. Solution
A **co-signed, hash-chained custody ledger**. At every handover:
1. Both the giver and the receiver sign the same record (Ed25519) of condition, weight, location, time and photo fingerprints.
2. Each record contains the SHA-256 of the previous record, so deleting or reordering history breaks the chain.
3. Photos are hashed on the phone; only the fingerprint is stored, so the original photo later proves itself without uploading private images.
4. A liability engine walks the legs and names the holder during whose custody condition worsened or weight dropped.
5. Anyone (insurer, arbitrator, court) can verify an exported ledger offline with no trust in our server.

Why not a public blockchain: no gas fees, no wallets, works for a two-truck operator, and the same tamper evidence is achieved by mutual signatures plus a hash chain. Anchoring the chain head to a public timestamp is a stretch goal.

## 3. Users
- Small fleet owner / driver (records handovers on a basic Android phone)
- Cross-dock or warehouse supervisor
- Shipper and receiver
- Insurer or dispute mediator (verifies only)

## 4. Scope (built, in repo)
| Area | File | Status |
|---|---|---|
| Ledger core: canonical JSON, signing, chaining, verify, attribution | `src/ledger.js` | Done |
| Realistic demo scenario (Pune → Ahilyanagar → Mumbai, damage on leg 3) | `src/demo.js` | Done |
| Zero-dependency REST API + static hosting | `src/server.js` | Done |
| Web app: timeline, verdict, handover form, photo hashing, attack simulator, export/verify | `web/index.html` | Done |
| Offline CLI verifier | `bin/verify.js` | Done |
| Test suite (8 tests: attribution, edit, delete, forgery, custody, validation, round-trip) | `test/ledger.test.js` | Done |

## 5. API
| Method | Path | Purpose |
|---|---|---|
| GET | /api/parties | list parties (public keys only) |
| POST | /api/parties | issue signing key `{name, role}` |
| GET/POST | /api/shipments | list / create `{id, description, origin, destination}` |
| GET | /api/shipments/:id | full ledger |
| POST | /api/shipments/:id/handover | `{fromId, toId, location, condition, weightKg, notes, evidence[]}` |
| GET | /api/shipments/:id/report | integrity + per-leg liability + verdict |
| POST | /api/verify | verify any uploaded ledger JSON |
| POST | /api/shipments/:id/tamper | demo-only attack simulator |
| POST | /api/reset | reset demo |

## 6. Acceptance tests (all pass: `npm test`)
- Clean ledger verifies.
- Damage attributed to Raj Logistics, leg 3, with both condition and 3.50 kg weight-loss reasons.
- Editing a condition after signing → `HASH` + signature failures → verdict `LEDGER_TAMPERED`.
- Deleting an event → `CHAIN` failure.
- Swapping in an outsider key → signature/ID failure.
- Non-holder cannot hand over goods.

## 7. Next tasks for Claude Code (in order, if time remains)
1. Persist state to `data/ledger.json` on every write (fs.writeFileSync, atomic rename).
2. Keys on device: generate Ed25519 with WebCrypto in the browser and store in IndexedDB so the server never holds private keys.
3. Handover via QR: receiver scans giver's QR containing the unsigned record, counter-signs offline.
4. Offline queue: record handovers without network; sync later (chain still verifies).
5. PDF claim pack export for insurers.
6. Optional AI: vision model compares pickup vs delivery photo and flags visible damage as a hint, never as the verdict.

## 8. Non-goals
Payments, route optimisation, GPS tracking.
