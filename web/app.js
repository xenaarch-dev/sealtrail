'use strict';
/* SealTrail browser engine. Same canonical format and raw Ed25519 keys as src/ledger.js,
   so ledgers move freely between the phone app and the Node verifier. */
(() => {
  const CONDITIONS = ['intact', 'minor_damage', 'major_damage', 'missing_items'];
  const LABEL = { intact: 'Intact', minor_damage: 'Minor damage', major_damage: 'Major damage', missing_items: 'Items missing' };
  const SEVERITY = { intact: 0, minor_damage: 1, major_damage: 2, missing_items: 3 };
  const GENESIS = '0'.repeat(64);
  const STORE = 'sealtrail.v1';
  const enc = new TextEncoder();
  const $ = (id) => document.getElementById(id);
  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const sha256 = async (data) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (ts) => new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  const body = (e) => ({ seq: e.seq, shipmentId: e.shipmentId, type: e.type, ts: e.ts, location: e.location, from: e.from, to: e.to,
    condition: e.condition, notes: e.notes, evidence: e.evidence, weightKg: e.weightKg, prevHash: e.prevHash });
  const pub = (p) => ({ id: p.id, name: p.name, role: p.role, publicKey: p.publicKey });

  async function createIdentity(name, role) {
    const kp = nacl.sign.keyPair();
    const pk = b64(kp.publicKey);
    return { id: (await sha256(pk)).slice(0, 12), name, role, publicKey: pk, secretKey: b64(kp.secretKey) };
  }
  const signMsg = (p, msg) => b64(nacl.sign.detached(enc.encode(msg), unb64(p.secretKey)));
  const verifySig = (pk, msg, sig) => { try { return nacl.sign.detached.verify(enc.encode(msg), unb64(sig), unb64(pk)); } catch { return false; } };

  async function handover(ship, { from, to, location, condition, notes = '', evidence = [], weightKg, ts = Date.now() }) {
    if (!CONDITIONS.includes(condition)) throw new Error('Pick a condition.');
    if (!from || !to) throw new Error('Choose who hands over and who receives.');
    if (from.id === to.id) throw new Error('Giver and receiver must be different handlers.');
    const last = ship.events.at(-1);
    if (last && last.to.id !== from.id) throw new Error(`${from.name} does not hold this shipment. ${last.to.name} does.`);
    const e = { seq: ship.events.length, shipmentId: ship.id, type: last ? 'handover' : 'pickup', ts, location, from: pub(from), to: pub(to),
      condition, notes, evidence, weightKg, prevHash: last ? last.hash : GENESIS };
    const msg = canonical(body(e));
    e.hash = await sha256(msg);
    e.sigFrom = signMsg(from, msg);
    e.sigTo = signMsg(to, msg);
    ship.events.push(e);
    return e;
  }

  async function verify(ship) {
    const issues = []; let prev = GENESIS;
    for (let i = 0; i < ship.events.length; i++) {
      const e = ship.events[i], msg = canonical(body(e));
      if (e.seq !== i) issues.push({ seq: i, code: 'SEQ', msg: 'sequence number out of order' });
      if (e.prevHash !== prev) issues.push({ seq: i, code: 'CHAIN', msg: 'does not link to the record before it, so a record was deleted or reordered' });
      if ((await sha256(msg)) !== e.hash) issues.push({ seq: i, code: 'HASH', msg: 'content was changed after it was signed' });
      if (!verifySig(e.from.publicKey, msg, e.sigFrom)) issues.push({ seq: i, code: 'SIG_FROM', msg: `${e.from.name}'s signature does not match` });
      if (!verifySig(e.to.publicKey, msg, e.sigTo)) issues.push({ seq: i, code: 'SIG_TO', msg: `${e.to.name}'s signature does not match` });
      if ((await sha256(e.from.publicKey)).slice(0, 12) !== e.from.id || (await sha256(e.to.publicKey)).slice(0, 12) !== e.to.id)
        issues.push({ seq: i, code: 'ID', msg: 'a party ID does not match its key' });
      if (i > 0) {
        const p = ship.events[i - 1];
        if (p.to.id !== e.from.id) issues.push({ seq: i, code: 'CUSTODY_GAP', msg: `${e.from.name} handed over goods held by ${p.to.name}` });
        if (e.ts < p.ts) issues.push({ seq: i, code: 'CLOCK', msg: 'timestamp is earlier than the record before it' });
      }
      prev = e.hash;
    }
    return { valid: !issues.length, issues, head: prev, count: ship.events.length };
  }

  async function attribute(ship, tol = 0.5) {
    const ev = ship.events, legs = [], findings = [];
    for (let i = 1; i < ev.length; i++) {
      const a = ev[i - 1], b = ev[i], reasons = [];
      if (SEVERITY[b.condition] > SEVERITY[a.condition]) reasons.push(`Condition got worse: ${LABEL[a.condition]} → ${LABEL[b.condition]}`);
      if (typeof a.weightKg === 'number' && typeof b.weightKg === 'number' && a.weightKg - b.weightKg > tol) reasons.push(`${(a.weightKg - b.weightKg).toFixed(2)} kg lost in this leg`);
      const leg = { leg: i, holder: a.to, from: a.location, to: b.location, hours: +((b.ts - a.ts) / 36e5).toFixed(1), reasons, responsible: reasons.length > 0 };
      legs.push(leg);
      if (leg.responsible) findings.push({ leg: i, party: a.to.name, reasons });
    }
    const integrity = await verify(ship);
    const parties = [...new Set(findings.map((f) => f.party))];
    let verdict, tone, sub;
    if (!integrity.valid) { verdict = 'Ledger tampered. These records cannot be relied on.'; tone = 'bad'; sub = `${integrity.issues.length} integrity failure(s) found. See the proof below.`; }
    else if (findings.length) { verdict = `Damage happened while ${parties.join(' and ')} held the goods`; tone = 'bad'; sub = findings.map((f) => `Leg ${f.leg}: ${f.reasons.join('; ')}`).join(' · '); }
    else if (ev.length < 2) { verdict = 'Shipment open. Awaiting handovers.'; tone = 'open'; sub = 'Record the pickup to start the custody chain.'; }
    else { verdict = 'No damage on record. Every leg is clean.'; tone = 'ok'; sub = `${ev.length} co-signed handovers, chain intact.`; }
    return { integrity, legs, findings, verdict, tone, sub };
  }

  // ---------- State ----------
  let state = { parties: {}, shipments: {}, current: null };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} };
  const loadSaved = () => { try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && s.shipments && s.parties) return s; } catch {} return null; };
  const ship = () => state.shipments[state.current];

  async function seedDemo() {
    const P = {};
    for (const [k, n, r] of [['shipper', 'Kale Ceramics', 'shipper'], ['truck1', 'Shree Ganesh Transport', 'carrier'], ['hub', 'Ahilyanagar Cross-Dock', 'warehouse'],
      ['truck2', 'Raj Logistics (last mile)', 'carrier'], ['rcv', 'Andheri Home Decor', 'receiver']]) P[k] = await createIdentity(n, r);
    const s = { id: 'SHP-24017', description: '12 cartons glazed ceramic tiles', origin: 'Pune MIDC, Bhosari', destination: 'Andheri East, Mumbai', events: [] };
    const t0 = Date.UTC(2026, 9, 12, 3, 30), H = 36e5;
    const ph = async (l) => [{ label: l, sha256: await sha256(l + '-photo') }];
    await handover(s, { from: P.shipper, to: P.truck1, location: 'Pune MIDC, Bhosari', condition: 'intact', weightKg: 240.0, ts: t0, notes: '12 cartons, shrink-wrapped on pallet', evidence: await ph('pickup.jpg') });
    await handover(s, { from: P.truck1, to: P.hub, location: 'Ahilyanagar Cross-Dock', condition: 'intact', weightKg: 240.1, ts: t0 + 3.5 * H, evidence: await ph('hub-in.jpg') });
    await handover(s, { from: P.hub, to: P.truck2, location: 'Ahilyanagar Cross-Dock', condition: 'intact', weightKg: 239.9, ts: t0 + 9 * H, notes: 'Re-loaded on Tata 407, MH-14 KA 2231', evidence: await ph('hub-out.jpg') });
    await handover(s, { from: P.truck2, to: P.rcv, location: 'Andheri East, Mumbai', condition: 'major_damage', weightKg: 236.4, ts: t0 + 15 * H, notes: '2 cartons crushed, wrap torn on one side', evidence: await ph('delivery.jpg') });
    state = { parties: Object.fromEntries(Object.values(P).map((p) => [p.id, p])), shipments: { [s.id]: s }, current: s.id };
    save();
  }

  // ---------- UI ----------
  const toast = (m) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); };

  async function render() {
    const s = ship(); if (!s) return;
    $('shipSel').innerHTML = Object.values(state.shipments).map((x) => `<option value="${esc(x.id)}" ${x.id === s.id ? 'selected' : ''}>${esc(x.id)}</option>`).join('');
    const r = await attribute(s);
    const holder = s.events.at(-1)?.to;
    $('manifest').innerHTML = [['Shipment', s.id], ['Goods', s.description], ['Lane', `${s.origin} → ${s.destination}`], ['Now held by', holder ? holder.name : 'Not picked up']]
      .map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
    const stamp = { ok: 'Verified clean', bad: r.integrity.valid ? 'Liability found' : 'Tampered', open: 'Open' }[r.tone];
    $('verdict').className = 'verdict ' + r.tone;
    $('verdict').innerHTML = `<div class="stamp">${stamp}</div><div><h2>${esc(r.verdict)}</h2><p>${esc(r.sub)}</p></div>`;

    // Route strip
    let rt = '';
    s.events.forEach((e, i) => {
      if (i === 0) rt += node(e.from);
      const leg = r.legs[i - 1];
      rt += `<div class="link ${leg?.responsible ? 'hot' : ''}"><span>${i === 0 ? 'pickup' : 'leg ' + i}</span></div>` + node(e.to);
    });
    $('route').innerHTML = rt || '<p class="note">No handlers yet.</p>';

    // Chain
    const bad = new Set(r.integrity.issues.map((x) => x.seq));
    let h = '';
    s.events.forEach((e, i) => {
      const leg = r.legs[i - 1];
      if (leg) h += `<div class="leg ${leg.responsible ? 'hot' : ''}"><span class="tag ${leg.responsible ? '' : 'clean'}">${leg.responsible ? 'Liable' : 'Clean'}</span>
        <b>Leg ${leg.leg}</b> · held by <b>${esc(leg.holder.name)}</b> for ${leg.hours} h${leg.responsible ? '<br>' + leg.reasons.map(esc).join('<br>') : ''}</div>`;
      h += `<div class="ev ${e.condition !== 'intact' ? 'dmg' : ''} ${bad.has(i) ? 'broken' : ''}">
        <div class="who">${esc(e.from.name)} → ${esc(e.to.name)}</div>
        <div class="meta">${fmt(e.ts)} · ${esc(e.location)} · <span class="cond c-${e.condition}">${LABEL[e.condition] || esc(e.condition)}</span>${e.weightKg != null ? ' · ' + e.weightKg + ' kg' : ''}</div>
        ${e.notes ? `<div class="meta">“${esc(e.notes)}”</div>` : ''}
        <div class="hash">#${e.seq} · ${e.hash.slice(0, 20)}… · signed by both · ${e.evidence.length} photo fingerprint${e.evidence.length === 1 ? '' : 's'}</div></div>`;
    });
    $('chain').innerHTML = h || '<p class="note">No handovers yet. Record the pickup in the panel on the right.</p>';

    $('proof').innerHTML = r.integrity.valid
      ? `<span class="cond c-intact">Valid</span> ${r.integrity.count} records. Every hash link and all ${r.integrity.count * 2} signatures check out.<div class="head">Chain head ${r.integrity.head}</div>`
      : `<span class="cond c-major_damage">Tampered</span> ${r.integrity.issues.length} failure(s):<ul>${r.integrity.issues.map((x) => `<li>Record #${x.seq}: ${esc(x.msg)} <code>${x.code}</code></li>`).join('')}</ul>`;

    const all = Object.values(state.parties);
    $('from').innerHTML = all.filter((p) => !holder || p.id === holder.id).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('to').innerHTML = all.filter((p) => !holder || p.id !== holder.id).map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.role)})</option>`).join('');
    if (!holder && $('to').options.length > 1) $('to').selectedIndex = 1;
    $('exportBox').value = JSON.stringify(s, null, 2);
  }
  const node = (p) => `<div class="node"><b>${esc(p.name)}</b><small>${esc(p.role)}</small></div>`;

  $('tiles').innerHTML = CONDITIONS.map((c, i) => `<label class="tile c-${c}"><input type="radio" name="cond" value="${c}" ${i === 0 ? 'checked' : ''}><i></i><span style="color:var(--ink)">${LABEL[c]}</span></label>`).join('');

  $('hoForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const f = $('photo').files[0];
      const evidence = f ? [{ label: f.name, sha256: await sha256(await f.arrayBuffer()) }] : [];
      const wt = $('wt').value.trim();
      await handover(ship(), { from: state.parties[$('from').value], to: state.parties[$('to').value], location: $('loc').value.trim() || 'Unspecified',
        condition: document.querySelector('input[name="cond"]:checked').value, notes: $('notes').value.trim(), evidence, weightKg: wt === '' ? undefined : Number(wt) });
      ['loc', 'wt', 'notes', 'photo'].forEach((k) => ($(k).value = ''));
      save(); await render();
      const seal = $('brandSeal'); seal.classList.remove('sealfx'); void seal.offsetWidth; seal.classList.add('sealfx');
      toast('Sealed. Both signatures recorded and chained.');
    } catch (e) { toast(e.message); }
  });

  $('shipSel').onchange = (e) => { state.current = e.target.value; save(); render(); };
  $('tEdit').onclick = () => { const e = ship().events.findLast((x) => x.condition !== 'intact') || ship().events.at(-1); if (!e) return; e.condition = 'intact'; if (e.weightKg != null) e.weightKg = 240; save(); render(); toast('A handler quietly rewrote their record to "intact".'); };
  $('tDel').onclick = () => { if (ship().events.length < 3) return toast('Need at least 3 handovers to delete one.'); ship().events.splice(1, 1); save(); render(); toast('A record was removed from the middle of the chain.'); };
  $('tForge').onclick = async () => { const s = ship(), e = s.events.at(-1); if (!e) return; const fake = await createIdentity(e.to.name, e.to.role); e.sigTo = signMsg(fake, canonical(body(e))); save(); render(); toast(`Someone signed as ${e.to.name} with a key that is not theirs.`); };
  $('resetBtn').onclick = async () => { await seedDemo(); await render(); toast('Demo reset.'); };
  $('copyBtn').onclick = async () => { try { await navigator.clipboard.writeText($('exportBox').value); toast('Ledger copied.'); } catch { $('exportBox').select(); toast('Press Ctrl+C to copy.'); } };
  $('dlBtn').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('exportBox').value], { type: 'application/json' })); a.download = `${state.current}-ledger.json`; a.click(); toast('If nothing downloaded, use Copy JSON.'); };
  $('verifyFile').onchange = async (e) => { const f = e.target.files[0]; if (f) $('verifyBox').value = await f.text(); };
  $('verifyBtn').onclick = async () => {
    try {
      const s = JSON.parse($('verifyBox').value);
      if (!Array.isArray(s.events)) throw new Error('This is not a SealTrail ledger.');
      const r = await attribute(s);
      $('verifyOut').innerHTML = `<p><span class="cond ${r.integrity.valid ? 'c-intact' : 'c-major_damage'}">${r.integrity.valid ? 'Valid' : 'Tampered'}</span> <b>${esc(s.id)}</b>, ${r.integrity.count} records</p><p>${esc(r.verdict)}</p>` +
        (r.integrity.issues.length ? `<ul style="color:var(--bad);padding-left:18px">${r.integrity.issues.map((x) => `<li>#${x.seq}: ${esc(x.msg)}</li>`).join('')}</ul>` : '');
    } catch (e) { $('verifyOut').textContent = 'Could not read that ledger: ' + e.message; }
  };
  $('checkPhoto').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const h = await sha256(await f.arrayBuffer());
    const hits = Object.values(state.shipments).flatMap((s) => s.events.filter((x) => x.evidence.some((v) => v.sha256 === h)).map((x) => ({ s, x })));
    $('checkOut').innerHTML = hits.length
      ? hits.map(({ s, x }) => `<p><span class="cond c-intact">Match</span> ${esc(s.id)} record #${x.seq}: ${esc(x.from.name)} → ${esc(x.to.name)}, ${fmt(x.ts)}. This exact photo was sealed at that handover.</p>`).join('')
      : `<p><span class="cond c-major_damage">No match</span> This photo was not sealed in any handover. It may be edited or taken later.</p><p class="hash" style="font:11px var(--mono);overflow-wrap:anywhere">${h}</p>`;
  };
  $('addP').onclick = async () => { const n = $('pname').value.trim(); if (!n) return toast('Enter a name.'); const p = await createIdentity(n, $('prole').value); state.parties[p.id] = p; $('pname').value = ''; save(); render(); toast(`Signing key issued to ${n}.`); };
  $('newShipBtn').onclick = () => { $('newShipPanel').hidden = false; $('nsId').focus(); };
  $('nsCancel').onclick = () => ($('newShipPanel').hidden = true);
  $('nsCreate').onclick = () => {
    const id = $('nsId').value.trim().replace(/[^\w-]/g, '');
    if (!id || state.shipments[id]) return toast('Enter a new, unique shipment ID.');
    state.shipments[id] = { id, description: $('nsDesc').value.trim() || 'General cargo', origin: $('nsO').value.trim() || 'Origin', destination: $('nsD').value.trim() || 'Destination', events: [] };
    state.current = id; $('newShipPanel').hidden = true; save(); render(); toast(`${id} created. Record the pickup.`);
  };

  (async () => { const s = loadSaved(); if (s) state = s; else await seedDemo(); if (!ship()) await seedDemo(); await render(); })();
})();
