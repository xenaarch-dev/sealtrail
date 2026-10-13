# SealTrail (Seva First Innovation Challenge, problem #1120)
Co-signed, hash-chained freight custody ledger with leg-level damage attribution.
- Zero runtime dependencies. Node 18+. Plain CommonJS.
- `npm test` must stay green before every commit. Add a test for every new behaviour.
- Core logic lives in src/ledger.js; never change canonical() or eventBody() without migrating existing ledgers (it changes hashes).
- Private keys must never be returned by the API.
- Roadmap: docs/PRD-claude-code.md section 7.
