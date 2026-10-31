/* ==========================================================================
   TRIPLE A GAS — Staff portal: running the business
   Dashboard, Stock, Deliveries, Safety, Expenses, Reports, Stations,
   Pricing, Staff, Payroll, Enquiries, Audit log.
   ========================================================================== */
(function () {
  const A = window.ADMIN, T = A.T, db = A.db, FV = A.FV, esc = A.esc, $ = A.$;
  const DAY = 864e5;
  const isSale = o => ['paid', 'fulfilled'].includes(o.status);
  const sum = (arr, f) => T.round2(arr.reduce((s, x) => s + (f(x) || 0), 0));
  const kgOf = o => (o.status === 'fulfilled' && o.dispensedKg) ? o.dispensedKg : (o.kg || 0);
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);

  function bars(points, fmt) {
    const max = Math.max(1, ...points.map(p => p.v));
    return `<div class="chart">${points.map(p => `<div class="c" title="${esc(p.label)}: ${esc(fmt ? fmt(p.v) : p.v)}"><i style="height:${Math.max(1, (p.v / max) * 100)}%"></i><span>${esc(p.short || p.label)}</span></div>`).join('')}</div>`;
  }
  function breakdown(rows, total) {
    return rows.length ? rows.map(([label, v, sub]) => `<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>${esc(label)}</span><b class="mono">${esc(sub)}</b></div><div class="bar"><i style="width:${pct(v, total)}%;background:var(--gold)"></i></div></div>`).join('') : '<div class="empty">No data</div>';
  }
  async function getStock(outlets) {
    const snaps = await Promise.all(outlets.map(o => db.collection('stock').doc(o).get().catch(() => null)));
    const out = {};
    snaps.forEach((s, i) => { if (s && s.exists) out[outlets[i]] = s.data(); });
    return out;
  }
  function tankBar(s) {
    if (!s) return '<span style="color:var(--faint)">—</span>';
    const p = pct(s.stockKg, s.capacityKg || 1);
    const tone = s.stockKg <= (s.lowStockKg || 0) ? 'danger' : p < 40 ? 'warn' : '';
    return `<div class="bar ${tone}" style="min-width:90px;"><i style="width:${p}%"></i></div><small class="mono" style="color:var(--muted)">${Math.round(s.stockKg).toLocaleString()} kg</small>`;
  }

  // ── DASHBOARD ───────────────────────────────────────────────────────────
  A.views.dashboard = async function (el) {
    const outlets = A.outletsInScope();
    const all = outlets.length === T.OUTLETS.length && A.isHQ();
    const today = T.dayStr();
    const pastDays = A.daysBack(7).slice(0, 6);
    el.innerHTML = `
      <div class="kpis" id="dK"></div>
      <div id="dAlerts"></div>
      <div class="cols-3">
        <div>
          <div class="panel"><h3>Sales · last 7 days <small id="dWeek"></small></h3><div id="dChart"><div class="empty">Loading…</div></div></div>
          <div class="panel"><h3>${all ? 'Stations today' : 'Live queue'}</h3><div class="table-wrap" id="dStations"></div></div>
        </div>
        <div>
          <div class="panel"><h3>Sales mix today</h3><div id="dMix"></div></div>
          <div class="panel"><h3>Payment methods</h3><div id="dPay"></div></div>
        </div>
      </div>`;
    const [past, stock] = await Promise.all([A.fetchOrders(outlets, pastDays).catch(() => []), getStock(outlets)]);
    let todayRows = [];

    function render() {
      const sales = todayRows.filter(isSale);
      const revenue = sum(sales, o => o.amount);
      const kg = sum(sales.filter(o => o.type !== 'exchange'), kgOf);
      const pending = todayRows.filter(o => T.effectiveStatus(o) === 'pending');
      const waiting = todayRows.filter(o => o.status === 'paid');
      const filled = todayRows.filter(o => o.status === 'fulfilled' && o.paidAt && o.fulfilledAt);
      const serve = filled.length ? Math.round(sum(filled, o => (T.toDate(o.fulfilledAt) - T.toDate(o.paidAt)) / 60000) / filled.length) : null;
      $('#dK').innerHTML = `
        <div class="kpi gold"><div class="v">${T.money(revenue)}</div><div class="l">Sales today</div></div>
        <div class="kpi"><div class="v">${kg.toLocaleString()} kg</div><div class="l">LPG sold today</div></div>
        <div class="kpi safe"><div class="v">${todayRows.filter(o => o.status === 'fulfilled').length}</div><div class="l">Orders filled</div></div>
        <div class="kpi warn"><div class="v">${pending.length}</div><div class="l">Awaiting payment</div></div>
        <div class="kpi"><div class="v">${waiting.length}</div><div class="l">Paid, at pump</div></div>
        <div class="kpi"><div class="v">${serve === null ? '—' : serve + ' min'}</div><div class="l">Avg pay → fill time</div></div>`;

      const alerts = [];
      outlets.forEach(o => {
        const s = stock[o];
        const issues = [];
        const st = A.stations[o]; if (st && st.open === false) issues.push('marked closed');
        if (s && s.stockKg <= (s.lowStockKg || 0)) issues.push(`tank low (${Math.round(s.stockKg).toLocaleString()} kg)`);
        const lowCyl = s ? T.SIZES.filter(z => ((s.cylFull || {})[z] || 0) <= (s.lowCyl || 0)) : [];
        if (lowCyl.length) issues.push(`few full cylinders: ${lowCyl.join(', ')}`);
        if (issues.length) alerts.push(`<b>${esc(T.outletName(o))}</b>: ${issues.join(' · ')}`);
      });
      const slow = waiting.filter(o => Date.now() - (T.toDate(o.paidAt) || Date.now()) > 30 * 60000);
      if (slow.length) alerts.push(`${slow.length} paid order${slow.length > 1 ? 's' : ''} waiting more than 30 min at the pump`);
      $('#dAlerts').innerHTML = alerts.length ? `<div class="note danger" style="margin-bottom:14px;">⚠ ${alerts.join('<br>⚠ ')}</div>` : '';

      const week = [...pastDays.map(d => ({ d, rows: past.filter(o => o.day === d) })), { d: today, rows: todayRows }];
      const pts = week.map(w => ({ label: A.fmtDay(w.d), short: new Date(w.d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), v: sum(w.rows.filter(isSale), o => o.amount) }));
      $('#dChart').innerHTML = bars(pts, T.money);
      $('#dWeek').textContent = T.money(sum(pts, p => p.v)) + ' total';

      if (all) {
        $('#dStations').innerHTML = `<table><thead><tr><th>Station</th><th>Status</th><th class="num">Sales</th><th class="num">Orders</th><th class="num">Unpaid</th><th>Tank</th></tr></thead><tbody>
          ${outlets.map(o => { const r = todayRows.filter(x => x.outlet === o); const st = A.stations[o] || {};
            return `<tr class="click" data-pick="${o}"><td><b>${esc(T.outletName(o))}</b></td><td><span class="badge ${st.open === false ? 'danger' : st.status === 'limited' ? 'warn' : 'safe'}">${st.open === false ? 'Closed' : st.status === 'limited' ? 'Limited' : 'Open'}</span></td>
            <td class="num">${T.money(sum(r.filter(isSale), x => x.amount))}</td><td class="num">${r.length}</td><td class="num">${r.filter(x => T.effectiveStatus(x) === 'pending').length}</td><td>${tankBar(stock[o])}</td></tr>`; }).join('')}</tbody></table>`;
      } else {
        const q = [...pending, ...waiting].sort((a, b) => (T.toDate(a.createdAt) || 0) - (T.toDate(b.createdAt) || 0));
        $('#dStations').innerHTML = `<div style="margin-bottom:10px;">Tank: ${tankBar(stock[outlets[0]])}</div>` + (q.length ? `<table><tbody>${q.map(o => `<tr class="click" data-oid="${o.id}"><td><span class="code-chip" style="font-size:13px;">${esc(o.code)}</span></td><td>${esc(T.describe(o))}</td><td class="num">${T.money(o.amount)}</td><td>${A.statusBadge(o)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Queue is empty</div>');
      }
      const types = [['Cylinder refill', 'refill'], ['Exchange', 'exchange'], ['Autogas', 'autogas']].map(([l, t]) => { const r = sales.filter(o => o.type === t); return [l, sum(r, o => o.amount), `${T.money(sum(r, o => o.amount))} · ${r.length}`]; });
      $('#dMix').innerHTML = breakdown(types, revenue);
      const pays = [['Cash', 'cash'], ['Mobile Money', 'momo'], ['Card', 'card']].map(([l, m]) => { const r = sales.filter(o => o.payMethod === m); return [l, sum(r, o => o.amount), T.money(sum(r, o => o.amount))]; });
      $('#dPay').innerHTML = breakdown(pays, revenue);
    }
    el.addEventListener('click', e => {
      const p = e.target.closest('[data-pick]');
      if (p) { A.outlet = p.dataset.pick; sessionStorage.setItem('tag_outlet', A.outlet); $('#outletSelect').value = A.outlet; A.show('dashboard'); return; }
      const r = e.target.closest('[data-oid]'); if (r) { const o = todayRows.find(x => x.id === r.dataset.oid); if (o) A.openOrder(o); }
    });
    const byKey = {};
    const queries = all ? [db.collection('orders').where('day', '==', today)] : outlets.map(o => db.collection('orders').where('outlet', '==', o).where('day', '==', today));
    queries.forEach((q, i) => A.listen(q, snap => { byKey[i] = snap.docs.map(d => ({ id: d.id, ...d.data() })); todayRows = [].concat(...Object.values(byKey)); render(); }));
    render();
  };

  // ── STOCK ───────────────────────────────────────────────────────────────
  A.views.stock = async function (el) {
    const outlet = A.singleOutlet();
    const manage = A.can(['owner', 'coo', 'manager']);
    const ref = db.collection('stock').doc(outlet);
    el.innerHTML = '<div class="empty">Loading…</div>';
    A.listen(ref, async snap => {
      if (!snap.exists) { el.innerHTML = '<div class="note">Stock for this station has not been set up yet. Ask head office to sign in once to initialise it.</div>'; return; }
      const s = snap.data();
      const [dips, todays] = await Promise.all([A.fetchOps('dips', [outlet], A.daysBack(14)).catch(() => []), A.fetchOrders([outlet], [T.dayStr()]).catch(() => [])]);
      const soldKg = sum(todays.filter(o => o.status === 'fulfilled' && o.type !== 'exchange'), kgOf);
      const p = pct(s.stockKg, s.capacityKg);
      el.innerHTML = `
        <div class="kpis">
          <div class="kpi ${s.stockKg <= s.lowStockKg ? 'danger' : 'gold'}"><div class="v">${Math.round(s.stockKg).toLocaleString()} kg</div><div class="l">Bulk LPG in tank (book)</div></div>
          <div class="kpi"><div class="v">${Math.round(p)}%</div><div class="l">of ${Number(s.capacityKg).toLocaleString()} kg capacity</div></div>
          <div class="kpi"><div class="v">${soldKg} kg</div><div class="l">Dispensed today</div></div>
          <div class="kpi"><div class="v">${s.lowStockKg.toLocaleString()} kg</div><div class="l">Reorder level</div></div>
        </div>
        <div class="cols">
          <div class="panel"><h3>Bulk tank <small>updated ${A.fmtDateTime(s.updatedAt)}${s.updatedBy ? ' by ' + esc(s.updatedBy) : ''}</small></h3>
            <div class="bar ${s.stockKg <= s.lowStockKg ? 'danger' : p < 40 ? 'warn' : ''}" style="height:18px;margin-bottom:14px;"><i style="width:${p}%"></i></div>
            <form id="dipForm"><div class="grid2"><div class="field"><label>Tank reading (kg)</label><input name="kg" type="number" step="0.1" required inputmode="decimal" placeholder="From gauge / dip"></div>
              <div class="field"><label>Note</label><input name="note" maxlength="120" placeholder="Opening / closing reading"></div></div>
              <button class="btn btn-primary">Record tank reading</button></form>
            <p style="color:var(--muted);font-size:12.5px;margin-top:8px;">Book stock drops automatically with every fill and rises with every delivery. A reading corrects it and logs the difference (loss or gain).</p>
          </div>
          <div class="panel"><h3>Cylinders for exchange</h3>
            <form id="cylForm"><div class="table-wrap"><table><thead><tr><th>Size</th><th>Full</th><th>Empty</th></tr></thead><tbody>
            ${T.SIZES.map(z => `<tr><td><b>${z}</b></td><td><input type="number" name="f_${z}" value="${(s.cylFull || {})[z] || 0}" style="max-width:110px;min-height:38px;" inputmode="numeric"></td>
              <td><input type="number" name="e_${z}" value="${(s.cylEmpty || {})[z] || 0}" style="max-width:110px;min-height:38px;" inputmode="numeric"></td></tr>`).join('')}
            </tbody></table></div><button class="btn" style="margin-top:10px;">Save cylinder count</button></form></div>
        </div>
        ${manage ? `<div class="panel"><h3>Tank settings</h3><form id="setForm" class="grid3">
          <div class="field"><label>Capacity (kg)</label><input name="capacityKg" type="number" value="${s.capacityKg}"></div>
          <div class="field"><label>Reorder level (kg)</label><input name="lowStockKg" type="number" value="${s.lowStockKg}"></div>
          <div class="field"><label>Low cylinder alert (each size)</label><input name="lowCyl" type="number" value="${s.lowCyl || 5}"></div>
          <div><button class="btn">Save settings</button></div></form></div>` : ''}
        <div class="panel"><h3>Tank readings · last 14 days</h3>${dips.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>By</th><th class="num">Book</th><th class="num">Measured</th><th class="num">Difference</th><th>Note</th></tr></thead><tbody>
          ${dips.map(d => `<tr><td>${A.fmtDateTime(d.at)}</td><td>${esc(d.byName)}</td><td class="num">${d.bookKg}</td><td class="num">${d.measuredKg}</td><td class="num" style="color:${d.varianceKg < -1 ? 'var(--danger)' : 'inherit'}">${d.varianceKg > 0 ? '+' : ''}${d.varianceKg}</td><td>${esc(d.note || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No readings yet</div>'}</div>`;

      $('#dipForm').onsubmit = async e => {
        e.preventDefault();
        const d = A.formData(e.target);
        const kg = T.round2(+d.kg);
        const variance = T.round2(kg - s.stockKg);
        if (Math.abs(variance) > s.capacityKg * 0.05 && !(await A.confirm(`Reading differs from book stock by ${variance} kg. Save?`, 'Save reading'))) return;
        try {
          await A.addOps('dips', { outlet, measuredKg: kg, bookKg: T.round2(s.stockKg), varianceKg: variance, note: d.note.trim() });
          await ref.update({ stockKg: kg, updatedAt: FV.serverTimestamp(), updatedBy: A.me.name });
          A.audit('tank reading', T.outletName(outlet), `${kg} kg (diff ${variance})`);
          A.toast('Tank reading saved');
        } catch (err) { A.err(err); }
      };
      $('#cylForm').onsubmit = async e => {
        e.preventDefault();
        const d = A.formData(e.target);
        const full = {}, empty = {};
        T.SIZES.forEach(z => { full[z] = parseInt(d['f_' + z], 10) || 0; empty[z] = parseInt(d['e_' + z], 10) || 0; });
        try { await ref.update({ cylFull: full, cylEmpty: empty, updatedAt: FV.serverTimestamp(), updatedBy: A.me.name }); A.audit('cylinder count', T.outletName(outlet), JSON.stringify(full)); A.toast('Cylinder count saved'); } catch (err) { A.err(err); }
      };
      const sf = $('#setForm');
      if (sf) sf.onsubmit = async e => {
        e.preventDefault();
        const d = A.formData(sf);
        try { await ref.update({ capacityKg: +d.capacityKg || 0, lowStockKg: +d.lowStockKg || 0, lowCyl: +d.lowCyl || 0 }); A.toast('Settings saved'); } catch (err) { A.err(err); }
      };
    }, e => A.err(e));
  };

  // ── DELIVERIES ──────────────────────────────────────────────────────────
  A.views.deliveries = async function (el) {
    const outlets = A.outletsInScope();
    el.innerHTML = `<div class="cols"><div class="panel"><h3>Record a delivery received</h3>
      <form id="dvForm">
        ${A.isHQ() ? `<div class="field"><label>Station</label><select name="outlet">${A.outletOptions(A.singleOutlet() || 'accra')}</select></div>` : ''}
        <div class="field"><label>What arrived</label><select name="kind" id="dvKind"><option value="bulk">Bulk LPG (tanker)</option><option value="cylinders">Filled cylinders (exchange stock)</option></select></div>
        <div id="dvBulk" class="grid2"><div class="field"><label>Quantity received (kg)</label><input name="kg" type="number" step="0.1" inputmode="decimal"></div>
          <div class="field"><label>Waybill / invoice no.</label><input name="waybill" maxlength="40"></div></div>
        <div id="dvCyl" class="hidden"><div class="grid2">${T.SIZES.map(z => `<div class="field"><label>${z} full in / empties out</label><div style="display:flex;gap:6px;"><input name="in_${z}" type="number" min="0" placeholder="in" inputmode="numeric"><input name="out_${z}" type="number" min="0" placeholder="out" inputmode="numeric"></div></div>`).join('')}</div></div>
        <div class="grid2"><div class="field"><label>Supplier / depot</label><input name="supplier" maxlength="60" placeholder="e.g. Tema LPG depot"></div>
          <div class="field"><label>Truck / driver</label><input name="truck" maxlength="60"></div></div>
        ${A.can(['owner', 'coo', 'manager']) ? '<div class="field"><label>Cost (GH₵, optional)</label><input name="cost" type="number" step="0.01" inputmode="decimal"></div>' : ''}
        <button class="btn btn-primary">Save delivery &amp; update stock</button></form></div>
      <div class="panel"><h3>Deliveries · last 30 days</h3><div id="dvList"><div class="empty">Loading…</div></div></div></div>`;
    $('#dvKind').onchange = e => { $('#dvBulk').classList.toggle('hidden', e.target.value !== 'bulk'); $('#dvCyl').classList.toggle('hidden', e.target.value === 'bulk'); };
    $('#dvForm').onsubmit = async e => {
      e.preventDefault();
      const d = A.formData(e.target);
      const outlet = d.outlet || A.me.outlet;
      const rec = { outlet, kind: d.kind, supplier: d.supplier.trim(), truck: d.truck.trim(), waybill: (d.waybill || '').trim(), cost: +d.cost || 0 };
      const sref = db.collection('stock').doc(outlet);
      try {
        if (d.kind === 'bulk') {
          rec.kg = T.round2(+d.kg);
          if (!(rec.kg > 0)) { A.toast('Enter the kg received', 'warn'); return; }
          await A.addOps('deliveries', rec);
          await db.runTransaction(async tx => { const s = await tx.get(sref); if (s.exists) tx.update(sref, { stockKg: T.round2((s.data().stockKg || 0) + rec.kg), updatedAt: FV.serverTimestamp(), updatedBy: A.me.name }); });
        } else {
          rec.cylIn = {}; rec.cylOut = {};
          T.SIZES.forEach(z => { rec.cylIn[z] = parseInt(d['in_' + z], 10) || 0; rec.cylOut[z] = parseInt(d['out_' + z], 10) || 0; });
          await A.addOps('deliveries', rec);
          await db.runTransaction(async tx => {
            const s = await tx.get(sref); if (!s.exists) return;
            const full = { ...(s.data().cylFull || {}) }, empty = { ...(s.data().cylEmpty || {}) };
            T.SIZES.forEach(z => { full[z] = (full[z] || 0) + rec.cylIn[z]; empty[z] = Math.max(0, (empty[z] || 0) - rec.cylOut[z]); });
            tx.update(sref, { cylFull: full, cylEmpty: empty, updatedAt: FV.serverTimestamp(), updatedBy: A.me.name });
          });
        }
        A.audit('delivery received', T.outletName(outlet), d.kind === 'bulk' ? `${rec.kg} kg` : JSON.stringify(rec.cylIn));
        A.toast('Delivery saved and stock updated'); A.refresh();
      } catch (err) { A.err(err); }
    };
    try {
      const list = await A.fetchOps('deliveries', outlets, A.daysBack(30));
      $('#dvList').innerHTML = list.length ? list.map(d => `<div class="list-row"><div class="grow"><b>${d.kind === 'bulk' ? `${Number(d.kg).toLocaleString()} kg bulk LPG` : 'Cylinders: ' + T.SIZES.filter(z => d.cylIn && d.cylIn[z]).map(z => `${d.cylIn[z]}×${z}`).join(', ')}</b>
        <small>${esc(T.outletName(d.outlet))} · ${esc(d.supplier || '—')}${d.waybill ? ' · #' + esc(d.waybill) : ''} · ${esc(d.byName)} · ${A.fmtDateTime(d.at)}</small></div>${d.cost ? `<b class="mono">${T.money(d.cost)}</b>` : ''}</div>`).join('') : '<div class="empty">No deliveries recorded</div>';
    } catch (e) { $('#dvList').innerHTML = '<div class="empty">Could not load</div>'; }
  };

  // ── SAFETY ──────────────────────────────────────────────────────────────
  const CHECKS = [
    'Fire extinguishers charged and in place',
    'No leaks (soap test on valves, hoses, joints)',
    'Weighing scale accurate — GSA seal intact',
    'Emergency shut-off valve working',
    'Hoses and filling nozzles in good condition',
    'No-smoking / no-phone signs visible, no naked flames',
    'Earthing / bonding cable connected',
    'Customer cylinders inspected before filling (rust, dents, valve)',
    'Sand buckets and first-aid kit available'
  ];
  A.views.safety = async function (el) {
    const outlets = A.outletsInScope();
    el.innerHTML = `<div class="cols"><div class="panel"><h3>Daily safety check</h3><form id="sfForm">
      ${A.isHQ() ? `<div class="field"><label>Station</label><select name="outlet">${A.outletOptions(A.singleOutlet() || 'accra')}</select></div>` : ''}
      ${CHECKS.map((c, i) => `<label class="list-row" style="cursor:pointer;"><input type="checkbox" name="c${i}"><span class="grow">${esc(c)}</span></label>`).join('')}
      <div class="field" style="margin-top:10px;"><label>Problems found / action taken</label><textarea name="notes" maxlength="500"></textarea></div>
      <button class="btn btn-primary">Submit check</button></form></div>
      <div class="panel"><h3>Checks · last 30 days</h3><div id="sfList"><div class="empty">Loading…</div></div></div></div>`;
    $('#sfForm').onsubmit = async e => {
      e.preventDefault();
      const d = A.formData(e.target);
      const failed = CHECKS.filter((c, i) => !d['c' + i]);
      if (failed.length && !d.notes.trim()) { A.toast('Describe the problem for each unticked item', 'warn'); return; }
      try {
        await A.addOps('inspections', { outlet: d.outlet || A.me.outlet, passed: failed.length === 0, failed, notes: d.notes.trim() });
        A.audit('safety check', T.outletName(d.outlet || A.me.outlet), failed.length ? `${failed.length} issue(s)` : 'all clear');
        A.toast('Safety check saved'); A.refresh();
      } catch (err) { A.err(err); }
    };
    try {
      const list = await A.fetchOps('inspections', outlets, A.daysBack(30));
      $('#sfList').innerHTML = list.length ? list.map(c => `<div class="list-row"><div class="grow"><b>${esc(T.outletName(c.outlet))}</b> ${c.passed ? '<span class="badge safe">All clear</span>' : `<span class="badge danger">${c.failed.length} issue${c.failed.length > 1 ? 's' : ''}</span>`}
        <small>${esc(c.byName)} · ${A.fmtDateTime(c.at)}${c.failed && c.failed.length ? ' · ' + esc(c.failed.join('; ')) : ''}${c.notes ? ' · ' + esc(c.notes) : ''}</small></div></div>`).join('') : '<div class="empty">No checks recorded</div>';
    } catch (e) { $('#sfList').innerHTML = '<div class="empty">Could not load</div>'; }
  };

  // ── EXPENSES ────────────────────────────────────────────────────────────
  const EXP_CATS = ['Electricity', 'Water', 'Repairs & maintenance', 'Transport & fuel', 'Staff welfare', 'Supplies', 'Levies, permits & licences', 'Security', 'Other'];
  A.views.expenses = async function (el) {
    const outlets = A.outletsInScope();
    const now = new Date();
    const monthStart = T.dayStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    el.innerHTML = `<div class="cols"><div class="panel"><h3>Record expense</h3><form id="exForm">
      ${A.isHQ() ? `<div class="field"><label>Station</label><select name="outlet">${A.outletOptions(A.singleOutlet() || 'accra')}</select></div>` : ''}
      <div class="grid2"><div class="field"><label>Category</label><select name="category">${EXP_CATS.map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Amount (GH₵)</label><input name="amount" type="number" step="0.01" required inputmode="decimal"></div></div>
      <div class="field"><label>Description</label><input name="description" required maxlength="140"></div>
      <div class="field"><label>Paid by</label><select name="paidVia"><option value="cash">Cash from till</option><option value="momo">MoMo</option><option value="bank">Bank</option></select></div>
      <button class="btn btn-primary">Save expense</button></form></div>
      <div class="panel"><h3>This month <small id="exTotal"></small></h3><div id="exCats"></div><div id="exList" style="margin-top:12px;"><div class="empty">Loading…</div></div></div></div>`;
    $('#exForm').onsubmit = async e => {
      e.preventDefault();
      const d = A.formData(e.target);
      try {
        await A.addOps('expenses', { outlet: d.outlet || A.me.outlet, category: d.category, amount: T.round2(+d.amount), description: d.description.trim(), paidVia: d.paidVia });
        A.audit('expense', T.outletName(d.outlet || A.me.outlet), `${T.money(d.amount)} ${d.category}`);
        A.toast('Expense saved'); A.refresh();
      } catch (err) { A.err(err); }
    };
    try {
      const list = await A.fetchOps('expenses', outlets, A.daysBetween(monthStart, T.dayStr()));
      const total = sum(list, x => x.amount);
      $('#exTotal').textContent = T.money(total);
      $('#exCats').innerHTML = breakdown(EXP_CATS.map(c => { const v = sum(list.filter(x => x.category === c), x => x.amount); return [c, v, T.money(v)]; }).filter(r => r[1] > 0), total);
      $('#exList').innerHTML = list.length ? list.map(x => `<div class="list-row"><div class="grow"><b>${esc(x.description)}</b><small>${esc(x.category)} · ${esc(T.outletName(x.outlet))} · ${esc(x.byName)} · ${A.fmtDay(x.day)}</small></div><b class="mono">${T.money(x.amount)}</b></div>`).join('') : '<div class="empty">No expenses this month</div>';
    } catch (e) { $('#exList').innerHTML = '<div class="empty">Could not load</div>'; }
  };

  // ── REPORTS ─────────────────────────────────────────────────────────────
  A.views.reports = async function (el) {
    const outlets = A.outletsInScope();
    const st = { from: A.daysBack(7)[0], to: T.dayStr() };
    el.innerHTML = `<div class="toolbar">
        <div class="tabs" style="margin:0;" id="rQuick"><button data-n="1">Today</button><button data-n="7" class="on">7 days</button><button data-n="30">30 days</button><button data-n="m">This month</button></div>
        <input type="date" id="rFrom" value="${st.from}" max="${st.to}"> → <input type="date" id="rTo" value="${st.to}" max="${st.to}">
        <button class="btn btn-sm btn-primary" id="rGo">Run</button><button class="btn btn-sm" id="rCsv">⬇ CSV</button>
      </div><div id="rOut"><div class="empty">Loading…</div></div>`;
    let daily = [];
    async function run() {
      const days = A.daysBetween(st.from, st.to);
      if (!days.length) { A.toast('Pick a valid date range', 'warn'); return; }
      $('#rOut').innerHTML = `<div class="empty">Loading ${days.length} day${days.length > 1 ? 's' : ''}…</div>`;
      try {
        const [orders, expenses] = await Promise.all([A.fetchOrders(outlets, days), A.fetchOps('expenses', outlets, days).catch(() => [])]);
        const sales = orders.filter(isSale);
        const revenue = sum(sales, o => o.amount);
        const refunds = orders.filter(o => o.status === 'refunded');
        const exp = sum(expenses, x => x.amount);
        const kg = sum(sales.filter(o => o.type !== 'exchange'), kgOf);
        const cylinders = sum(sales.filter(o => o.type === 'exchange'), o => o.qty);
        const filled = orders.filter(o => o.status === 'fulfilled' && o.paidAt && o.fulfilledAt);
        const serve = filled.length ? Math.round(sum(filled, o => (T.toDate(o.fulfilledAt) - T.toDate(o.paidAt)) / 60000) / filled.length) : null;
        const lost = orders.filter(o => ['cancelled', 'expired'].includes(T.effectiveStatus(o)));
        daily = days.map(d => { const r = orders.filter(o => o.day === d); const s = r.filter(isSale); const e = expenses.filter(x => x.day === d);
          return { date: d, orders: r.length, paidOrders: s.length, revenue: sum(s, o => o.amount), kg: sum(s.filter(o => o.type !== 'exchange'), kgOf), expenses: sum(e, x => x.amount) }; });
        const hours = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, short: h % 3 === 0 ? String(h) : '', v: sales.filter(o => (T.toDate(o.createdAt) || new Date(0)).getUTCHours() === h).length }));
        const people = {};
        sales.forEach(o => { if (o.paidByName) { const p = people[o.paidByName] = people[o.paidByName] || { pay: 0, amt: 0, fills: 0 }; p.pay++; p.amt += o.amount; } });
        orders.filter(o => o.status === 'fulfilled').forEach(o => { if (o.fulfilledByName) { const p = people[o.fulfilledByName] = people[o.fulfilledByName] || { pay: 0, amt: 0, fills: 0 }; p.fills++; } });

        $('#rOut').innerHTML = `
          <div class="kpis">
            <div class="kpi gold"><div class="v">${T.money(revenue)}</div><div class="l">Sales (${sales.length} paid orders)</div></div>
            <div class="kpi"><div class="v">${kg.toLocaleString()} kg</div><div class="l">LPG sold${cylinders ? ` + ${cylinders} cylinders` : ''}</div></div>
            <div class="kpi"><div class="v">${T.money(sales.length ? revenue / sales.length : 0)}</div><div class="l">Average order</div></div>
            <div class="kpi danger"><div class="v">${T.money(exp)}</div><div class="l">Expenses</div></div>
            <div class="kpi ${revenue - exp >= 0 ? 'safe' : 'danger'}"><div class="v">${T.money(revenue - exp)}</div><div class="l">Sales minus expenses</div></div>
            <div class="kpi"><div class="v">${serve === null ? '—' : serve + ' min'}</div><div class="l">Avg pay → fill time</div></div>
            <div class="kpi warn"><div class="v">${lost.length}</div><div class="l">Unpaid / cancelled orders</div></div>
            <div class="kpi"><div class="v">${T.money(sum(refunds, o => o.amount))}</div><div class="l">Refunds (${refunds.length})</div></div>
          </div>
          <div class="panel"><h3>Daily sales</h3>${bars(daily.map(d => ({ label: A.fmtDay(d.date), short: days.length <= 14 ? A.fmtDay(d.date) : '', v: d.revenue })), T.money)}</div>
          <div class="cols">
            ${outlets.length > 1 ? `<div class="panel"><h3>By station</h3><div class="table-wrap"><table><thead><tr><th>Station</th><th class="num">Sales</th><th class="num">Orders</th><th class="num">kg</th><th class="num">Expenses</th></tr></thead><tbody>
              ${outlets.map(o => { const s = sales.filter(x => x.outlet === o); return `<tr><td>${esc(T.outletName(o))}</td><td class="num">${T.money(sum(s, x => x.amount))}</td><td class="num">${s.length}</td><td class="num">${sum(s.filter(x => x.type !== 'exchange'), kgOf)}</td><td class="num">${T.money(sum(expenses.filter(x => x.outlet === o), x => x.amount))}</td></tr>`; }).join('')}
            </tbody></table></div></div>` : ''}
            <div class="panel"><h3>By product</h3>${breakdown([['Cylinder refill', 'refill'], ['Exchange', 'exchange'], ['Autogas', 'autogas']].map(([l, t]) => { const r = sales.filter(o => o.type === t); return [l, sum(r, o => o.amount), `${T.money(sum(r, o => o.amount))} · ${r.length}`]; }), revenue)}</div>
            <div class="panel"><h3>By payment</h3>${breakdown([['Cash', 'cash'], ['Mobile Money', 'momo'], ['Card', 'card']].map(([l, m]) => { const r = sales.filter(o => o.payMethod === m); return [l, sum(r, o => o.amount), `${T.money(sum(r, o => o.amount))} · ${r.length}`]; }), revenue)}
              <p style="color:var(--muted);font-size:12.5px;margin-top:8px;">Online orders: ${sales.filter(o => o.source === 'online').length} · Walk-in: ${sales.filter(o => o.source === 'walkin').length}</p></div>
            <div class="panel"><h3>Busiest hours <small>paid orders by hour placed</small></h3>${bars(hours)}</div>
            <div class="panel"><h3>Staff activity</h3>${Object.keys(people).length ? `<div class="table-wrap"><table><thead><tr><th>Staff</th><th class="num">Payments</th><th class="num">Collected</th><th class="num">Fills</th></tr></thead><tbody>
              ${Object.entries(people).sort((a, b) => b[1].amt - a[1].amt).map(([n, p]) => `<tr><td>${esc(n)}</td><td class="num">${p.pay}</td><td class="num">${T.money(p.amt)}</td><td class="num">${p.fills}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No activity</div>'}</div>
          </div>`;
      } catch (e) { A.err(e); $('#rOut').innerHTML = '<div class="empty">Could not load report</div>'; }
    }
    $('#rQuick').onclick = e => {
      const b = e.target.closest('[data-n]'); if (!b) return;
      $('#rQuick').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      const n = b.dataset.n; const now = new Date();
      st.to = T.dayStr();
      st.from = n === 'm' ? T.dayStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) : A.daysBack(+n)[0];
      $('#rFrom').value = st.from; $('#rTo').value = st.to; run();
    };
    $('#rGo').onclick = () => { st.from = $('#rFrom').value; st.to = $('#rTo').value; run(); };
    $('#rCsv').onclick = () => A.csv(`sales-${st.from}-to-${st.to}.csv`, daily);
    run();
  };

  // ── STATIONS ────────────────────────────────────────────────────────────
  A.views.stations = async function (el) {
    const outlets = A.isHQ() ? T.OUTLETS.map(o => o.id) : [A.me.outlet];
    const snaps = await Promise.all(outlets.map(o => db.collection('stations').doc(o).get()));
    el.innerHTML = `<p style="color:var(--muted);margin-bottom:12px;">What customers see on the website and in the order form. A closed station cannot receive online orders.</p>
      <div class="cols">${snaps.map((s, i) => { const d = s.exists ? s.data() : {}; const o = outlets[i]; const status = d.open === false ? 'closed' : (d.status || 'open');
        return `<form class="panel" data-st="${o}"><h3>${esc(T.outletName(o))}</h3>
          <div class="field"><label>Status</label><select name="status"><option value="open" ${status === 'open' ? 'selected' : ''}>🟢 Open</option><option value="limited" ${status === 'limited' ? 'selected' : ''}>🟡 Limited stock</option><option value="closed" ${status === 'closed' ? 'selected' : ''}>🔴 Closed</option></select></div>
          <div class="grid2"><div class="field"><label>Opening hours</label><input name="hours" value="${esc(d.hours || '')}" maxlength="60"></div>
          <div class="field"><label>Note for customers</label><input name="note" value="${esc(d.note || '')}" maxlength="120"></div></div>
          <div class="grid2"><div class="field"><label>MoMo merchant number</label><input name="momoNumber" value="${esc(d.momoNumber || '')}" maxlength="20" inputmode="tel"></div>
          <div class="field"><label>MoMo account name</label><input name="momoName" value="${esc(d.momoName || '')}" maxlength="60"></div></div>
          <button class="btn btn-primary">Save ${esc(T.outletName(o))}</button></form>`; }).join('')}</div>`;
    el.querySelectorAll('[data-st]').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const o = f.dataset.st; const d = A.formData(f);
      try {
        await db.collection('stations').doc(o).update({ status: d.status, open: d.status !== 'closed', hours: d.hours.trim(), note: d.note.trim(), momoNumber: d.momoNumber.trim(), momoName: d.momoName.trim(), updatedAt: FV.serverTimestamp() });
        await db.collection('settings').doc('stationStatus').set({ [T.outletName(o)]: d.status, updatedAt: FV.serverTimestamp() }, { merge: true });
        A.stations[o] = { ...(A.stations[o] || {}), status: d.status, open: d.status !== 'closed', momoNumber: d.momoNumber.trim(), momoName: d.momoName.trim() };
        A.audit('station updated', T.outletName(o), d.status);
        A.toast(`${T.outletName(o)} saved`);
      } catch (err) { A.err(err); }
    });
  };

  // ── PRICING ─────────────────────────────────────────────────────────────
  A.views.pricing = async function (el) {
    const p = await T.loadPricing();
    A.pricing = p;
    el.innerHTML = `<div class="cols"><div class="panel"><h3>Prices <small>${p.updatedAt ? 'last changed ' + A.fmtDateTime(p.updatedAt) : 'not published yet'}</small></h3>
      <form id="prForm">
        <div class="grid3"><div class="field"><label>LPG per kg (GH₵)</label><input name="perKg" type="number" step="0.01" value="${p.perKg}" required></div>
        <div class="field"><label>Autogas per kg (GH₵)</label><input name="autogasPerKg" type="number" step="0.01" value="${p.autogasPerKg}" required></div>
        <div class="field"><label>Minimum order (GH₵)</label><input name="minAmount" type="number" step="1" value="${p.minAmount || 10}"></div></div>
        <div class="table-wrap"><table><thead><tr><th>Size</th><th>Refill price</th><th>Exchange (gas) price</th><th>New cylinder deposit</th></tr></thead><tbody>
          ${T.SIZES.map(z => `<tr><td><b>${z}</b></td><td class="mono" data-refill="${z}">${T.money(parseFloat(z) * p.perKg)}</td>
            <td><input name="ex_${z}" type="number" step="0.01" value="${p.exchange[z]}" style="max-width:130px;min-height:38px;"></td>
            <td><input name="dep_${z}" type="number" step="0.01" value="${p.deposit[z]}" style="max-width:130px;min-height:38px;"></td></tr>`).join('')}
        </tbody></table></div>
        <label style="display:flex;gap:8px;align-items:center;margin:10px 0;"><input type="checkbox" id="prSync" checked> Set exchange prices to kg price × size</label>
        <div class="field"><label>Reason / NPA window</label><input name="note" maxlength="120" placeholder="e.g. NPA 16 Oct pricing window"></div>
        <button class="btn btn-primary">Publish prices</button>
        <p style="color:var(--muted);font-size:12.5px;margin-top:8px;">New prices apply to new orders immediately. Orders already placed keep the price shown to the customer.</p>
      </form></div>
      <div class="panel"><h3>Price history</h3><div id="prHist"><div class="empty">Loading…</div></div></div></div>`;
    const f = $('#prForm');
    const sync = () => {
      const per = parseFloat(f.perKg.value) || 0;
      T.SIZES.forEach(z => {
        el.querySelector(`[data-refill="${z}"]`).textContent = T.money(parseFloat(z) * per);
        if ($('#prSync').checked) f['ex_' + z].value = T.round2(parseFloat(z) * per);
      });
    };
    f.perKg.oninput = sync; $('#prSync').onchange = sync;
    f.onsubmit = async e => {
      e.preventDefault();
      const d = A.formData(f);
      const np = { perKg: T.round2(+d.perKg), autogasPerKg: T.round2(+d.autogasPerKg), minAmount: +d.minAmount || 0, exchange: {}, deposit: {} };
      T.SIZES.forEach(z => { np.exchange[z] = T.round2(+d['ex_' + z]); np.deposit[z] = T.round2(+d['dep_' + z]); });
      if (!(np.perKg > 0 && np.autogasPerKg > 0)) { A.toast('Prices must be above zero', 'warn'); return; }
      if (!(await A.confirm(`Publish LPG at ${T.money(np.perKg)}/kg and autogas at ${T.money(np.autogasPerKg)}/kg?`, 'Publish'))) return;
      try {
        await db.collection('settings').doc('pricing').set({ ...np, ...T.legacyPricingFields(np), updatedAt: FV.serverTimestamp(), updatedBy: A.me.name }, { merge: true });
        await db.collection('priceHistory').add({ old: { perKg: p.perKg, autogasPerKg: p.autogasPerKg, exchange: p.exchange }, new: np, note: d.note.trim(), by: A.user.uid, byName: A.me.name, at: FV.serverTimestamp() });
        A.audit('prices published', 'pricing', `${T.money(np.perKg)}/kg · autogas ${T.money(np.autogasPerKg)}/kg`);
        A.toast('Prices published'); A.refresh();
      } catch (err) { A.err(err); }
    };
    try {
      const h = await db.collection('priceHistory').orderBy('at', 'desc').limit(20).get();
      $('#prHist').innerHTML = h.empty ? '<div class="empty">No changes yet</div>' : h.docs.map(x => { const r = x.data();
        return `<div class="list-row"><div class="grow"><b>${T.money(r.old.perKg)} → ${T.money(r.new.perKg)}/kg</b><small>Autogas ${T.money(r.new.autogasPerKg)}/kg · ${esc(r.byName)} · ${A.fmtDateTime(r.at)}${r.note ? ' · ' + esc(r.note) : ''}</small></div></div>`; }).join('');
    } catch (e) { $('#prHist').innerHTML = '<div class="empty">Could not load</div>'; }
  };

  // ── STAFF ───────────────────────────────────────────────────────────────
  const ROLE_HELP = {
    owner: 'Everything, all stations, staff accounts',
    coo: 'All stations: operations, pricing, reports, payroll',
    manager: 'Own station: cashier, pump, stock, expenses, reports, refunds',
    cashier: 'Own station: confirm payments, walk-in sales, cash-up',
    attendant: 'Own station: scan QR and fill, tank readings, safety checks',
    driver: 'Own station: record deliveries',
    secretary: 'Own station: view orders, handle enquiries'
  };
  A.views.staff = async function (el) {
    const owner = A.me.role === 'owner';
    const q = A.isHQ() ? db.collection('staff') : db.collection('staff').where('outlet', '==', A.me.outlet);
    const snap = await q.get();
    let list = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    if (A.isHQ() && A.outlet !== 'all') list = list.filter(s => s.outlet === A.outlet || HQish(s));
    list.sort((a, b) => Number(b.active) - Number(a.active) || a.outlet.localeCompare(b.outlet) || a.name.localeCompare(b.name));
    function HQish(s) { return ['owner', 'coo'].includes(s.role); }
    el.innerHTML = `<div class="panel"><h3>Staff <small>${list.filter(s => s.active).length} active</small>${owner ? '<button class="btn btn-sm btn-primary" id="addStaff">+ Add staff</button>' : ''}</h3>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Station</th><th>Phone</th><th>Status</th></tr></thead><tbody>
      ${list.map(s => `<tr class="${owner ? 'click' : ''}" data-uid="${s.uid}"><td><b>${esc(s.name)}</b></td><td class="mono">${esc(s.username)}</td><td>${esc(A.ROLES[s.role])}</td>
        <td>${HQish(s) ? 'All stations' : esc(T.outletName(s.outlet))}</td><td class="mono">${esc(s.phone || '')}</td><td><span class="badge ${s.active ? 'safe' : 'neutral'}">${s.active ? 'Active' : 'Disabled'}</span></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="panel"><h3>What each role can do</h3>${Object.entries(ROLE_HELP).map(([r, h]) => `<div class="list-row"><b style="min-width:150px;">${esc(A.ROLES[r])}</b><span class="grow" style="color:var(--muted)">${esc(h)}</span></div>`).join('')}</div>`;
    if (!owner) return;
    $('#addStaff').onclick = () => staffForm(null);
    el.querySelector('tbody').onclick = e => { const r = e.target.closest('[data-uid]'); if (r) staffForm(list.find(s => s.uid === r.dataset.uid)); };

    function staffForm(s) {
      const isNew = !s; const self = s && s.uid === A.user.uid;
      const { el: m, close } = A.modal(`<h2>${isNew ? 'Add staff member' : 'Edit ' + esc(s.name)}</h2><form id="sf">
        <div class="field"><label>Full name</label><input name="name" required maxlength="60" value="${esc(s ? s.name : '')}"></div>
        <div class="grid2"><div class="field"><label>Username</label><input name="username" required pattern="[a-z0-9._-]{3,30}" autocapitalize="none" value="${esc(s ? s.username : '')}" ${isNew ? '' : 'readonly'}></div>
        <div class="field"><label>Phone</label><input name="phone" type="tel" maxlength="20" value="${esc(s ? s.phone || '' : '')}"></div></div>
        ${isNew ? '<div class="field"><label>Temporary password (8+ chars)</label><input name="password" minlength="8" required autocomplete="new-password"></div>' : ''}
        <div class="grid2"><div class="field"><label>Role</label><select name="role" ${self ? 'disabled' : ''}>${Object.entries(A.ROLES).map(([k, v]) => `<option value="${k}" ${s && s.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Station</label><select name="outlet">${A.outletOptions(s ? s.outlet : (A.singleOutlet() || 'accra'))}</select></div></div>
        ${isNew ? '' : `<label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;"><input type="checkbox" name="active" ${s.active ? 'checked' : ''} ${self ? 'disabled' : ''}> Account active (untick to block sign-in)</label>`}
        <button class="btn btn-primary btn-block">${isNew ? 'Create account' : 'Save changes'}</button>
        ${isNew ? '<p style="color:var(--muted);font-size:12.5px;margin-top:8px;">Give the username and temporary password to the staff member. They can change the password under Account.</p>'
          : '<p style="color:var(--muted);font-size:12.5px;margin-top:8px;">Forgotten password: disable this account and create a new one with a different username.</p>'}
        <div class="err" id="sfErr"></div></form>`);
      m.querySelector('#sf').onsubmit = async e => {
        e.preventDefault();
        const d = A.formData(e.target);
        const btn = e.target.querySelector('button'); btn.disabled = true;
        try {
          if (isNew) {
            const username = d.username.trim().toLowerCase();
            const sec = T.secondaryAuth();
            let cred;
            try { cred = await sec.createUserWithEmailAndPassword(`${username}@staff.tripleagas.com`, d.password); }
            catch (err) { throw new Error(err.code === 'auth/email-already-in-use' ? 'That username is already taken.' : err.code === 'auth/weak-password' ? 'Password must be at least 8 characters.' : 'Could not create the login.'); }
            await sec.signOut();
            await db.collection('staff').doc(cred.user.uid).set({ name: d.name.trim(), username, role: d.role, outlet: d.outlet, phone: d.phone.trim(), active: true, createdAt: FV.serverTimestamp(), createdBy: A.user.uid });
            A.audit('staff added', username, `${A.ROLES[d.role]} · ${T.outletName(d.outlet)}`);
            A.toast(`${d.name} can now sign in as ${username}`);
          } else {
            const upd = { name: d.name.trim(), username: s.username, role: self ? s.role : d.role, outlet: d.outlet, phone: d.phone.trim(), active: self ? true : !!d.active, updatedAt: FV.serverTimestamp() };
            if (s.createdAt) upd.createdAt = s.createdAt;
            if (s.createdBy) upd.createdBy = s.createdBy;
            await db.collection('staff').doc(s.uid).set(upd);
            A.audit('staff updated', s.username, `${A.ROLES[upd.role]} · ${T.outletName(upd.outlet)} · ${upd.active ? 'active' : 'disabled'}`);
            A.toast('Saved');
          }
          close(); A.refresh();
        } catch (err) { btn.disabled = false; m.querySelector('#sfErr').textContent = err.code === 'permission-denied' ? 'Not allowed.' : err.message; }
      };
    }
  };

  // ── PAYROLL ─────────────────────────────────────────────────────────────
  A.views.payroll = async function (el) {
    const month = sessionStorage.getItem('tag_pay_month') || T.dayStr().slice(0, 7);
    const [staffSnap, paySnap] = await Promise.all([db.collection('staff').get(), db.collection('payroll').where('month', '==', month).get()]);
    const staff = staffSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(s => s.active);
    const rows = paySnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tot = sum(rows, r => r.net);
    el.innerHTML = `<div class="toolbar"><input type="month" id="pMonth" value="${month}"><span class="grow"></span><button class="btn btn-sm" id="pCsv">⬇ CSV</button></div>
      <div class="kpis"><div class="kpi gold"><div class="v">${T.money(tot)}</div><div class="l">Net pay ${month}</div></div>
        <div class="kpi"><div class="v">${rows.filter(r => r.paid).length}/${rows.length}</div><div class="l">Paid</div></div>
        <div class="kpi"><div class="v">${T.money(sum(rows, r => r.ssnit))}</div><div class="l">SSNIT employee (5.5%)</div></div></div>
      <div class="panel"><h3>Payroll ${month} <button class="btn btn-sm btn-primary" id="pAdd">+ Add / edit pay</button></h3>
      <div class="table-wrap"><table><thead><tr><th>Staff</th><th>Station</th><th class="num">Basic</th><th class="num">Allowances</th><th class="num">SSNIT</th><th class="num">PAYE</th><th class="num">Other</th><th class="num">Net</th><th>Paid</th></tr></thead><tbody>
        ${rows.length ? rows.map(r => `<tr class="click" data-pid="${r.id}"><td>${esc(r.name)}</td><td>${esc(T.outletName(r.outlet))}</td><td class="num">${T.money(r.basic)}</td><td class="num">${T.money(r.allowances)}</td><td class="num">${T.money(r.ssnit)}</td><td class="num">${T.money(r.paye)}</td><td class="num">${T.money(r.other)}</td><td class="num"><b>${T.money(r.net)}</b></td>
          <td><span class="badge ${r.paid ? 'safe' : 'warn'}">${r.paid ? 'Paid' : 'Due'}</span></td></tr>`).join('') : '<tr><td colspan="9" class="empty">No pay records this month</td></tr>'}
      </tbody></table></div></div>`;
    $('#pMonth').onchange = e => { sessionStorage.setItem('tag_pay_month', e.target.value); A.refresh(); };
    $('#pCsv').onclick = () => A.csv(`payroll-${month}.csv`, rows.map(({ id, ...r }) => r));
    const edit = r => {
      const { el: m, close } = A.modal(`<h2>Pay · ${month}</h2><form id="pf">
        <div class="field"><label>Staff</label><select name="uid" ${r ? 'disabled' : ''}>${staff.map(s => `<option value="${s.uid}" ${r && r.uid === s.uid ? 'selected' : ''}>${esc(s.name)} · ${esc(A.ROLES[s.role])}</option>`).join('')}</select></div>
        <div class="grid2"><div class="field"><label>Basic salary</label><input name="basic" type="number" step="0.01" value="${r ? r.basic : ''}" required></div>
        <div class="field"><label>Allowances / bonus</label><input name="allowances" type="number" step="0.01" value="${r ? r.allowances : 0}"></div>
        <div class="field"><label>PAYE tax</label><input name="paye" type="number" step="0.01" value="${r ? r.paye : 0}"></div>
        <div class="field"><label>Other deductions</label><input name="other" type="number" step="0.01" value="${r ? r.other : 0}"></div></div>
        <p style="color:var(--muted);margin-bottom:10px;">SSNIT employee 5.5% of basic is deducted automatically. Net: <b id="pNet" class="mono"></b></p>
        <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;"><input type="checkbox" name="paid" ${r && r.paid ? 'checked' : ''}> Paid</label>
        <button class="btn btn-primary btn-block">Save</button></form>`);
      const f = m.querySelector('#pf');
      const calc = () => { const d = A.formData(f); const ssnit = T.round2((+d.basic || 0) * 0.055); const net = T.round2((+d.basic || 0) + (+d.allowances || 0) - ssnit - (+d.paye || 0) - (+d.other || 0)); m.querySelector('#pNet').textContent = T.money(net); return { ssnit, net }; };
      f.oninput = calc; calc();
      f.onsubmit = async e => {
        e.preventDefault();
        const d = A.formData(f); const uid = r ? r.uid : d.uid; const s = staff.find(x => x.uid === uid) || r;
        const { ssnit, net } = calc();
        try {
          await db.collection('payroll').doc(`${uid}_${month}`).set({ uid, name: s.name, outlet: s.outlet, month, basic: +d.basic || 0, allowances: +d.allowances || 0, paye: +d.paye || 0, other: +d.other || 0, ssnit, net, paid: !!d.paid, updatedAt: FV.serverTimestamp(), updatedBy: A.me.name });
          A.audit('payroll saved', s.name, `${month} · ${T.money(net)}${d.paid ? ' · paid' : ''}`);
          close(); A.refresh();
        } catch (err) { A.err(err); }
      };
    };
    $('#pAdd').onclick = () => edit(null);
    el.querySelector('tbody').onclick = e => { const tr = e.target.closest('[data-pid]'); if (tr) edit(rows.find(r => r.id === tr.dataset.pid)); };
  };

  // ── ENQUIRIES ───────────────────────────────────────────────────────────
  A.views.enquiries = async function (el) {
    const snap = await db.collection('enquiries').orderBy('createdAt', 'desc').limit(100).get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const open = list.filter(x => !x.reviewed).length;
    A.setCount('enquiries', open);
    el.innerHTML = `<div class="panel"><h3>Enquiries from the website <small>${open} new</small></h3>
      ${list.length ? list.map(x => `<div class="list-row"><div class="grow"><b>${esc(x.name || x.contact || 'Unknown')}${x.company ? ' · ' + esc(x.company) : ''}</b> ${x.reviewed ? '' : '<span class="badge warn">New</span>'}
        <small>${esc(x.topic || '')}${x.location ? ' · ' + esc(x.location) : ''}${x.usage ? ' · usage: ' + esc(x.usage) : ''} · ${A.fmtDateTime(x.createdAt)}</small>
        ${x.notes ? `<div style="margin-top:4px;">${esc(x.notes)}</div>` : ''}</div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">${x.phone ? `<a class="btn btn-sm" href="tel:${esc(x.phone)}">📞 ${esc(x.phone)}</a>` : ''}${x.reviewed ? '' : `<button class="btn btn-sm" data-rev="${x.id}">Mark done</button>`}</div></div>`).join('') : '<div class="empty">No enquiries</div>'}</div>`;
    el.onclick = async e => {
      const b = e.target.closest('[data-rev]'); if (!b) return;
      try { await db.collection('enquiries').doc(b.dataset.rev).update({ reviewed: true, reviewedAt: FV.serverTimestamp(), reviewedBy: A.me.name }); A.refresh(); } catch (err) { A.err(err); }
    };
  };

  // ── AUDIT ───────────────────────────────────────────────────────────────
  A.views.audit = async function (el) {
    const snap = await db.collection('audit').orderBy('at', 'desc').limit(300).get();
    const list = snap.docs.map(d => d.data());
    el.innerHTML = `<div class="panel"><div class="toolbar"><input class="grow" id="auQ" type="search" placeholder="Filter by person, action or detail"></div>
      <div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody id="auB"></tbody></table></div></div>`;
    const render = q => { const r = list.filter(x => !q || [x.byName, x.action, x.target, x.detail, x.role].join(' ').toLowerCase().includes(q));
      $('#auB').innerHTML = r.length ? r.map(x => `<tr><td class="mono" style="white-space:nowrap;">${A.fmtDateTime(x.at)}</td><td>${esc(x.byName)}<br><small style="color:var(--muted)">${esc(A.ROLES[x.role] || '')}</small></td><td><b>${esc(x.action)}</b></td><td>${esc(x.target)}</td><td>${esc(x.detail)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Nothing found</td></tr>'; };
    $('#auQ').oninput = e => render(e.target.value.trim().toLowerCase());
    render('');
  };
})();
