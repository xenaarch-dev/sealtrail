# SealTrail: Claude Design PRD

Paste this whole file into Claude Design.

## Brief
Design the mobile and desktop screens for **SealTrail**, a custody ledger that proves which handler damaged a freight shipment. Users are Indian truck drivers, cross-dock supervisors and small fleet owners using low-cost Android phones in bright sunlight, often with gloves, sometimes with limited literacy. A second audience is insurers and mediators who need a clear, trustworthy verdict.

## Brand
- Name: SealTrail. Tagline: "Every handover, sealed."
- Feel: industrial, trustworthy, calm. Think shipping label meets bank statement.
- Colours: warm paper background `#F4F1EA`, ink `#16181D`, signal orange accent `#E85D1F`, verified green `#1D7A4F`, liability red `#C2372B`. Full dark mode.
- Type: Inter (UI), IBM Plex Mono (hashes, IDs).
- Icons: simple line icons; a wax-seal motif for "signed".

## Screens (mobile first, 390px)
1. **Shipments home**: list of active shipments with status chip (In transit / Delivered clean / Damage attributed / Tampered).
2. **Handover (driver)**: big step flow, one decision per screen:
   a. Scan other party's QR
   b. Take condition photo (large shutter button)
   c. Pick condition: 4 huge colour-coded tiles with icons (Intact, Minor damage, Major damage, Items missing)
   d. Enter weight (numeric keypad)
   e. Both sign: two seal icons fill in as each party confirms. Success screen with a wax-seal animation.
3. **Shipment timeline**: vertical chain of handovers; between each pair, a leg card showing holder and hours. Liable leg highlighted red with reasons in plain words ("Condition got worse: intact → major damage", "3.5 kg missing").
4. **Verdict / claim pack** (insurer view, desktop 1280px): big verdict banner, leg-by-leg table, integrity proof panel with chain head hash, "Download claim pack" button.
5. **Tamper detected state**: what the verdict screen looks like when someone edited or deleted a record. Must feel serious, not scary-glitchy.

## Must-haves
- Touch targets ≥ 56px; contrast WCAG AA in sunlight.
- Hindi and Marathi label length must fit (design with 30% text expansion).
- Never show raw hashes as the main message; plain-language first, hash secondary in mono.
- Condition always uses colour **and** icon **and** word.

## Demo data
Shipment SHP-24017, 12 cartons glazed ceramic tiles, Pune MIDC → Andheri, Mumbai.
Handlers: Kale Ceramics (shipper) → Shree Ganesh Transport → Ahilyanagar Cross-Dock Hub → Raj Logistics (Last Mile) → Mumbai Home Decor Store.
Damage on leg 3 (Raj Logistics): intact → major damage, 240.1 kg → 236.4 kg, "2 cartons crushed, wrap torn".

## Deliverable
Clickable prototype of screens 1–5 plus a one-page pitch hero ("Who broke it? Now you can prove it.").
