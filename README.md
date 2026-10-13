# SealTrail

**Every freight handover, co-signed and sealed.**

Seva First Innovation Challenge · Infrastructure and Mobility · Problem #1120
*Small freight operators cannot prove when goods were damaged as responsibility passes through several handlers.*

**Live demo:** https://xenaarch-dev.github.io/sealtrail/ (runs fully in the browser, no install)

## The problem
A part-load shipment in India moves shipper → truck → cross-dock → second truck → receiver. When it arrives damaged, every handler says it was fine when they passed it on. Challans are paper, photos sit in WhatsApp, and confirmations are verbal. Any of it can be edited, deleted or denied. The smallest operator, who cannot prove innocence, absorbs the loss, and insurers reject claims for lack of evidence.

## The solution
| | What happens | Why it matters |
|---|---|---|
| **Both sides sign** | Giver and receiver each sign the same record (condition, weight, place, time, photo fingerprint) with their own Ed25519 key | Nobody can later deny what they agreed at handover |
| **Records lock together** | Each record carries the SHA-256 of the one before it | Editing, deleting or reordering history breaks the chain and is caught |
| **Liability falls out** | The engine walks each leg; where condition worsened or weight dropped, the holder for that leg is named | A clear, evidence-backed answer to "who broke it?" |
| **Photos stay private** | Photos are fingerprinted on the phone; only the hash is sealed | Later, the original photo proves itself without ever being uploaded |
| **Anyone can verify** | Export the ledger; verify in the browser or offline with the CLI | Insurers and mediators need not trust SealTrail's servers |

No blockchain, gas fees or wallets: mutual signatures plus a hash chain give the same tamper evidence and work for a two-truck operator on a basic Android phone.

## Run it
Node 18+, zero runtime dependencies.
```bash
npm test                    # 9 tests: attribution, edit/delete/forgery detection, browser↔Node compatibility
npm start                   # builds and serves http://localhost:3000 (web app + REST API)
npm run verify -- --demo    # offline CLI audit; writes demo-ledger.json you can tamper with
node bin/verify.js file.json
```

## 60-second judge demo
1. Open the live demo. The verdict pins damage to **leg 3**, the last-mile carrier, with 3.5 kg lost.
2. **Rewrite damage to intact**: verdict flips to *Ledger tampered* and names the broken signatures.
3. **Reset demo**, then **Delete a handover**: the chain break is caught.
4. **Forge a signature**: an impostor key is rejected.
5. Copy the ledger from **Export** and paste into **Verify a ledger**, or run it through `bin/verify.js`.
6. Record a new handover with a photo, then **Check a photo** with the same image: it matches the sealed fingerprint. Any edited photo does not.

## Architecture
```
web/app.body.html + web/app.js   browser app (tweetnacl Ed25519 + WebCrypto SHA-256), built to web/index.html
src/ledger.js                    Node engine: canonical JSON, signing, chaining, verify, liability attribution
src/server.js                    zero-dependency REST API for fleet/TMS integrations + static host
bin/verify.js                    offline verifier for insurers and mediators
scripts/build.js                 inlines the crypto library so the app works offline
test/                            node:test suite, incl. a browser-signed fixture verified in Node
docs/                            PRDs (Claude Code, Claude Design) and setup guide
```
Both engines share one portable format: raw 32-byte Ed25519 keys (base64), sorted-key canonical JSON, SHA-256 chaining. A ledger signed on a phone verifies on a server and vice versa.

### REST API
`GET/POST /api/parties` · `GET/POST /api/shipments` · `GET /api/shipments/:id` · `POST /api/shipments/:id/handover` · `GET /api/shipments/:id/report` · `POST /api/verify`

## Impact
- **Operators:** prove innocence leg by leg; stop absorbing other handlers' losses.
- **Insurers:** fast, evidence-backed claims with a verifiable trail.
- **Shippers and receivers:** know exactly where the chain failed, and fix that lane.

## Roadmap
QR-based handover between two phones · offline queue with later sync · keys in device secure storage · Hindi and Marathi UI · insurer claim-pack PDF · optional vision model flagging visible damage as a hint, never as the verdict.

## License
MIT. Bundles tweetnacl (public domain, see `vendor/tweetnacl-LICENSE`).
