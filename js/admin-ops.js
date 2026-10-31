/* ==========================================================================
   TRIPLE A GAS — Staff portal: selling
   Cashier (code → confirm payment → QR), Pump (scan → fill), Orders,
   Cash-up and Shift notes.
   ========================================================================== */
(function () {
  const A = window.ADMIN, T = A.T, db = A.db, FV = A.FV, esc = A.esc, $ = A.$;
  const DAY = 864e5;

  // ── shared bits ─────────────────────────────────────────────────────────
  function orderKv(o, extra = '') {
    return `<dl class="kv">
      <dt>Customer</dt><dd>${esc(o.customerName || 'Walk-in')}</dd>
      <dt>Phone</dt><dd class="mono">${o.phone && o.phone !== '0000000000' ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : '—'}</dd>
      <dt>Station</dt><dd>${esc(T.outletName(o.outlet))}</dd>
      ${o.type !== 'exchange' ? `<dt>Rate</dt><dd>${T.money(o.unitPrice)}/kg</dd>` : ''}
      <dt>Placed</dt><dd>${A.fmtDateTime(o.createdAt)} · ${o.source === 'walkin' ? 'Walk-in' : 'Online'}</dd>
      ${o.paidAt ? `<dt>Paid</dt><dd>${A.fmtDateTime(o.paidAt)} · ${esc((o.payMethod || '').toUpperCase())}${o.momoRef ? ' · ' + esc(o.momoRef) : ''} · ${esc(o.paidByName || '')}</dd>` : ''}
      ${o.fulfilledAt ? `<dt>Filled</dt><dd>${A.fmtDateTime(o.fulfilledAt)} · ${esc(o.fulfilledByName || '')}${o.dispensedKg ? ` · ${o.dispensedKg} kg` : ''}</dd>` : ''}
      ${o.cancelReason ? `<dt>Reason</dt><dd>${esc(o.cancelReason)}</dd>` : ''}
      ${o.notes ? `<dt>Notes</dt><dd>${esc(o.notes)}</dd>` : ''}
      ${extra}
    </dl>`;
  }

  async function orderByCode(outlet, code) {
    const c = await db.collection('orderCodes').doc(`${outlet}_${code}`).get();
    if (!c.exists) return null;
    const o = await db.collection('orders').doc(c.data().orderId).get();
    if (!o.exists) return null;
    const d = { id: o.id, ...o.data() };
    return d.code === code && d.outlet === outlet ? d : null;
  }
  async function orderById(id) {
    const o = await db.collection('orders').doc(id).get();
    return o.exists ? { id: o.id, ...o.data() } : null;
  }

  /** Live orders for one station for today and yesterday (unpaid orders live 12h). */
  function listenStation(outlet, cb) {
    const days = [T.dayStr(new Date(Date.now() - DAY)), T.dayStr()];
    const byDay = {};
    days.forEach(d => {
      A.listen(db.collection('orders').where('outlet', '==', outlet).where('day', '==', d), snap => {
        byDay[d] = snap.docs.map(x => ({ id: x.id, ...x.data() }));
        cb([].concat(...days.map(k => byDay[k] || [])));
      });
    });
  }

  function codeInput(el, onCode) {
    const input = el.querySelector('input');
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 4);
      if (input.value.length === 4) onCode(input.value);
    });
    el.addEventListener('submit', e => { e.preventDefault(); if (input.value.length === 4) onCode(input.value); });
    return input;
  }
  function keypad(el, input, onCode) {
    el.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k === 'C' ? 'Clear' : k}">${k === '⌫' ? A.icon('backspace', 22) : k}</button>`).join('');
    el.addEventListener('click', e => {
      const k = e.target.closest('[data-k]'); if (!k) return;
      const v = k.dataset.k;
      if (v === 'C') input.value = '';
      else if (v === '⌫') input.value = input.value.slice(0, -1);
      else if (input.value.length < 4) input.value += v;
      if (input.value.length === 4) onCode(input.value);
    });
  }

  function orderRow(o, right) {
    return `<div class="list-row click" data-oid="${o.id}" style="cursor:pointer;">
      <span class="code-chip">${esc(o.code)}</span>
      <div class="grow"><b>${esc(T.describe(o))}</b><small>${esc(o.customerName || 'Walk-in')} · ${A.fmtTime(o.createdAt)}${o.payPref === 'momo' && o.status === 'pending' ? ' · wants MoMo' : ''}</small></div>
      ${right || `<b class="mono">${T.money(o.amount)}</b>`}
    </div>`;
  }

  async function cancelOrder(o, reason) {
    await db.collection('orders').doc(o.id).update({ status: 'cancelled', cancelledAt: FV.serverTimestamp(), cancelledBy: A.user.uid, cancelReason: reason });
    await db.collection('orderCodes').doc(`${o.outlet}_${o.code}`).delete().catch(() => {});
    A.audit('order cancelled', o.code, `${T.outletName(o.outlet)} · ${reason}`);
  }
  async function refundOrder(o, reason) {
    await db.collection('orders').doc(o.id).update({ status: 'refunded', cancelledAt: FV.serverTimestamp(), cancelledBy: A.user.uid, cancelReason: reason });
    await db.collection('orderCodes').doc(`${o.outlet}_${o.code}`).delete().catch(() => {});
    A.audit('order refunded', o.code, `${T.outletName(o.outlet)} · ${T.money(o.amount)} · ${reason}`);
  }

  // ── CASHIER ─────────────────────────────────────────────────────────────
  A.views.cashier = async function (el) {
    const outlet = A.singleOutlet();
    let live = [];
    el.innerHTML = `
      <div class="cols-3">
        <div>
          <div class="panel">
            <h3>Customer code <small>${esc(T.outletName(outlet))} station</small><span class="sp"></span>
              <button class="btn btn-sm btn-gold" id="walkinBtn">${A.icon('plus', 16)} Walk-in sale</button></h3>
            <form class="codebox" id="codeForm"><input id="codeIn" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="····" aria-label="4-digit order code"></form>
            <div class="keypad" id="keypad"></div>
          </div>
          <div id="orderSlot"></div>
        </div>
        <div>
          <div class="kpis" style="grid-template-columns:1fr 1fr;">
            <div class="kpi gold"><div class="v" id="kTotal">—</div><div class="l">My takings today</div></div>
            <div class="kpi"><div class="v" id="kCount">—</div><div class="l">Payments confirmed</div></div>
            <div class="kpi"><div class="v" id="kCash">—</div><div class="l">Cash</div></div>
            <div class="kpi"><div class="v" id="kMomo">—</div><div class="l">MoMo / card</div></div>
          </div>
          <div class="panel"><h3>Waiting to pay <span class="badge warn" id="pendN">0</span></h3><div id="pendingList"><div class="empty">No orders waiting</div></div></div>
          <div class="panel"><h3>Paid · not yet filled <span class="badge gold" id="paidN">0</span></h3><div id="paidList"><div class="empty">None</div></div></div>
        </div>
      </div>`;

    const slot = $('#orderSlot');
    const input = codeInput($('#codeForm'), lookup);
    keypad($('#keypad'), input, lookup);
    input.focus();

    async function lookup(code) {
      slot.innerHTML = '<div class="panel"><div class="empty">Looking up…</div></div>';
      try {
        const o = await orderByCode(outlet, code);
        if (!o) {
          slot.innerHTML = `<div class="order-card bad"><div class="verdict bad">${A.icon('stop', 24)} No order ${esc(code)} at ${esc(T.outletName(outlet))}</div>
            <p style="color:var(--muted)">Check the code, or that the customer chose this station. You can also make a walk-in sale.</p></div>`;
          return;
        }
        showOrder(o);
      } catch (e) { A.err(e); slot.innerHTML = ''; }
    }

    function showOrder(o) {
      const st = T.effectiveStatus(o);
      let html = '';
      if (st === 'pending') {
        const now = T.quote(o.type === 'exchange' ? o : { ...o, mode: 'kg' }, A.pricing);
        const priceNote = Math.abs(now.amount - o.amount) > 0.05
          ? `<div class="note" style="margin-top:10px;">Prices changed since this order was placed (today: ${T.money(now.amount)}). Charge the order price.</div>` : '';
        html = `<div class="order-card wait">
          <div class="verdict wait">${A.icon('cashier', 24)} Collect ${T.money(o.amount)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;"><span class="code-chip" style="font-size:22px;">${esc(o.code)}</span>${A.statusBadge(o)}</div>
          <div class="big-what">${esc(T.describe(o))}</div>
          ${orderKv(o)}${priceNote}
          <div class="paymethods" id="pm">
            <button type="button" data-m="cash">${A.icon('cash', 22)}Cash</button><button type="button" data-m="momo">${A.icon('momo', 22)}MoMo</button><button type="button" data-m="card">${A.icon('card', 22)}Card</button>
          </div>
          <div id="pmCash" class="grid2"><div class="field"><label>Cash received</label><input id="cashIn" type="number" step="0.01" inputmode="decimal" placeholder="${o.amount}"></div>
            <div class="field"><label>Change due</label><input id="changeOut" readonly class="mono"></div></div>
          <div id="pmMomo" class="field hidden"><label>MoMo transaction ID</label><input id="momoRef" autocomplete="off" placeholder="From the payment SMS"></div>
          <button class="btn btn-safe btn-xl btn-block" id="payGo">${A.icon('check', 22)} Payment received — issue QR</button>
          <button class="btn btn-danger btn-block" style="margin-top:8px;" id="cancelGo">Cancel order</button>
        </div>`;
      } else if (st === 'paid') {
        html = `<div class="order-card ok"><div class="verdict ok">${A.icon('checkCircle', 24)} Paid — send customer to the pump</div>
          <div class="qrbox" id="qrBox"></div>
          <div style="text-align:center"><span class="code-chip" style="font-size:24px;">${esc(o.code)}</span></div>
          <div class="big-what" style="font-size:22px;text-align:center;">${esc(T.describe(o))}</div>
          ${orderKv(o)}
          <button class="btn btn-primary btn-block" style="margin-top:12px;" id="printGo">${A.icon('printer', 18)} Print slip</button></div>`;
      } else {
        const msg = st === 'fulfilled' ? `Already filled ${A.fmtDateTime(o.fulfilledAt)}` : st === 'expired' ? 'Expired — not paid within 12 hours. Make a new order.' : (T.STATUS[st] || {}).label;
        html = `<div class="order-card bad"><div class="verdict bad">${A.icon('stop', 24)} ${esc(msg)}</div>
          <div class="big-what" style="font-size:22px;">${esc(T.describe(o))} · ${T.money(o.amount)}</div>${orderKv(o)}
          ${st === 'expired' ? '<button class="btn btn-danger btn-block" style="margin-top:10px;" id="cancelGo">Close this order</button>' : ''}</div>`;
      }
      slot.innerHTML = html;
      slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      if (st === 'paid' && o.qrToken) T.renderQR($('#qrBox'), T.qrPayload(o.id, o.qrToken), 5);
      const pr = $('#printGo'); if (pr) pr.onclick = () => A.printSlip(o);
      const cg = $('#cancelGo');
      if (cg) cg.onclick = async () => {
        const why = await A.prompt('Cancel order ' + o.code, 'Reason', st === 'expired' ? 'Expired unpaid' : 'Customer changed mind');
        if (!why) return;
        try { await cancelOrder(o, why); A.toast('Order cancelled'); slot.innerHTML = ''; input.value = ''; input.focus(); } catch (e) { A.err(e); }
      };
      if (st !== 'pending') return;

      let method = o.payPref === 'momo' ? 'momo' : 'cash';
      const setMethod = m => {
        method = m;
        slot.querySelectorAll('#pm button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
        $('#pmCash').classList.toggle('hidden', m !== 'cash');
        $('#pmMomo').classList.toggle('hidden', m !== 'momo');
      };
      setMethod(method);
      $('#pm').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMethod(b.dataset.m); };
      $('#cashIn').oninput = e => {
        const got = parseFloat(e.target.value) || 0;
        $('#changeOut').value = got ? T.money(got - o.amount) : '';
      };
      $('#payGo').onclick = async () => {
        const received = parseFloat($('#cashIn').value) || null;
        const ref = $('#momoRef').value.trim();
        if (method === 'cash' && received !== null && received < o.amount) { A.toast('Cash received is less than the total', 'warn'); return; }
        if (method === 'momo' && ref.length < 4) { A.toast('Enter the MoMo transaction ID', 'warn'); $('#momoRef').focus(); return; }
        $('#payGo').disabled = true;
        try {
          const paid = await confirmPayment(o, method, ref, received);
          A.toast(`Payment confirmed — code ${o.code}`);
          showOrder(paid);
          input.value = '';
        } catch (e) {
          $('#payGo').disabled = false;
          if (e.code === 'permission-denied') {
            const fresh = await orderById(o.id);
            if (fresh && fresh.status !== 'pending') { A.toast('This order was already processed', 'warn'); showOrder(fresh); return; }
          }
          A.err(e, 'Could not confirm payment');
        }
      };
    }

    async function confirmPayment(o, method, ref, received) {
      const token = T.genToken();
      await db.collection('orders').doc(o.id).update({
        status: 'paid', paidAt: FV.serverTimestamp(), paidBy: A.user.uid, paidByName: A.me.name,
        payMethod: method, momoRef: method === 'momo' ? ref : '', qrToken: token, amountReceived: received
      });
      // Keep the 4-digit code reserved until the order is filled.
      db.collection('orderCodes').doc(`${o.outlet}_${o.code}`).update({ expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + 7 * DAY) }).catch(() => {});
      A.audit('payment confirmed', o.code, `${T.outletName(o.outlet)} · ${T.money(o.amount)} · ${method}`);
      return { ...o, status: 'paid', qrToken: token, payMethod: method, momoRef: ref, paidAt: new Date(), paidBy: A.user.uid, paidByName: A.me.name };
    }

    function renderLive() {
      const pending = live.filter(o => T.effectiveStatus(o) === 'pending').sort((a, b) => (T.toDate(a.createdAt) || 0) - (T.toDate(b.createdAt) || 0));
      const paid = live.filter(o => o.status === 'paid');
      A.safe('#pendN').textContent = pending.length; A.safe('#paidN').textContent = paid.length;
      A.setCount('cashier', pending.length);
      A.safe('#pendingList').innerHTML = pending.length ? pending.map(o => orderRow(o)).join('') : '<div class="empty">No orders waiting</div>';
      A.safe('#paidList').innerHTML = paid.length ? paid.map(o => orderRow(o, `<span class="badge gold">${esc((o.payMethod || '').toUpperCase())}</span>`)).join('') : '<div class="empty">None</div>';
      const today = T.dayStr();
      const mine = live.filter(o => o.paidBy === A.user.uid && ['paid', 'fulfilled'].includes(o.status) && T.dayStr(T.toDate(o.paidAt) || new Date()) === today);
      const sum = f => mine.filter(f).reduce((s, o) => s + o.amount, 0);
      A.safe('#kTotal').textContent = T.money(sum(() => true));
      A.safe('#kCount').textContent = mine.length;
      A.safe('#kCash').textContent = T.money(sum(o => o.payMethod === 'cash'));
      A.safe('#kMomo').textContent = T.money(sum(o => o.payMethod !== 'cash'));
    }
    el.addEventListener('click', e => {
      const r = e.target.closest('[data-oid]'); if (!r) return;
      const o = live.find(x => x.id === r.dataset.oid); if (o) showOrder(o);
    });
    listenStation(outlet, list => { live = list; renderLive(); });

    $('#walkinBtn').onclick = () => walkIn(outlet, async (order, method, ref, received) => {
      const paid = await confirmPayment(order, method, ref, received);
      showOrder(paid);
      return paid;
    });
  };

  // Walk-in sale: cashier builds the order for a customer at the counter.
  function walkIn(outlet, afterCreate) {
    const st = { type: 'refill', mode: 'size', size: '14.5kg', kg: 5, amount: 100, qty: 1, withCylinder: false, pay: 'cash' };
    const { el, close } = A.modal(`<h2>Walk-in sale · ${esc(T.outletName(outlet))}</h2>
      <div class="tabs" id="wType"><button data-t="refill">Cylinder refill</button><button data-t="exchange">Exchange</button><button data-t="autogas">Vehicle gas</button></div>
      <div id="wRefill"><div class="tabs" id="wMode"><button data-m="size">Full cylinder</button><button data-m="amount">Cedi amount</button><button data-m="kg">Kilograms</button></div>
        <div id="wSize" class="chips" style="margin-bottom:10px;"></div>
        <div id="wAmt" class="field"><label>Amount (GH₵)</label><input type="number" step="1" inputmode="decimal" value="100"></div>
        <div id="wKg" class="field"><label>Kilograms</label><input type="number" step="0.5" inputmode="decimal" value="5"></div></div>
      <div id="wEx"><div id="wExSize" class="chips" style="margin-bottom:10px;"></div>
        <div class="grid2"><div class="field"><label>Quantity</label><input id="wQty" type="number" min="1" max="5" value="1"></div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:18px;"><input type="checkbox" id="wNew"> New cylinder (no empty)</label></div></div>
      <div class="grid2"><div class="field"><label>Customer name (optional)</label><input id="wName" maxlength="60"></div>
        <div class="field"><label>Phone (optional)</label><input id="wPhone" type="tel" inputmode="tel"></div></div>
      <div class="paymethods" id="wPay"><button type="button" data-p="cash">${A.icon('cash', 22)}Cash</button><button type="button" data-p="momo">${A.icon('momo', 22)}MoMo</button><button type="button" data-p="card">${A.icon('card', 22)}Card</button></div>
      <div id="wMomoBox" class="field hidden"><label>MoMo transaction ID</label><input id="wMomo" autocomplete="off"></div>
      <div class="panel" style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 12px;"><span id="wSum" style="color:var(--muted)"></span><b class="big-amt" id="wTotal"></b></div>
      <button class="btn btn-safe btn-xl btn-block" id="wGo">${A.icon('check', 22)} Paid — issue QR</button>`, { wide: true });
    const q = s => el.querySelector(s);
    function render() {
      q('#wType').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === st.type));
      q('#wMode').querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.m === st.mode); b.disabled = st.type === 'autogas' && b.dataset.m === 'size'; });
      q('#wPay').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === st.pay));
      const sizes = (prices) => T.SIZES.map(s => `<button type="button" class="chip ${st.size === s ? 'on' : ''}" data-s="${s}">${s}<small>${T.money(prices(s))}</small></button>`).join('');
      q('#wSize').innerHTML = sizes(s => parseFloat(s) * A.pricing.perKg);
      q('#wExSize').innerHTML = sizes(s => A.pricing.exchange[s]);
      q('#wRefill').classList.toggle('hidden', st.type === 'exchange');
      q('#wEx').classList.toggle('hidden', st.type !== 'exchange');
      q('#wSize').classList.toggle('hidden', st.mode !== 'size');
      q('#wAmt').classList.toggle('hidden', st.mode !== 'amount');
      q('#wKg').classList.toggle('hidden', st.mode !== 'kg');
      q('#wMomoBox').classList.toggle('hidden', st.pay !== 'momo');
      const r = T.quote(st, A.pricing);
      q('#wTotal').textContent = T.money(r.amount);
      q('#wSum').textContent = st.type === 'exchange' ? `${r.qty} × ${r.size}` : `${r.kg} kg @ ${T.money(r.unitPrice)}/kg`;
    }
    q('#wType').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { st.type = b.dataset.t; if (st.type === 'autogas' && st.mode === 'size') st.mode = 'amount'; render(); } };
    q('#wMode').onclick = e => { const b = e.target.closest('[data-m]'); if (b && !b.disabled) { st.mode = b.dataset.m; render(); } };
    q('#wPay').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { st.pay = b.dataset.p; render(); } };
    el.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { st.size = b.dataset.s; render(); } });
    q('#wAmt input').oninput = e => { st.amount = parseFloat(e.target.value) || 0; render(); };
    q('#wKg input').oninput = e => { st.kg = parseFloat(e.target.value) || 0; render(); };
    q('#wQty').oninput = e => { st.qty = parseInt(e.target.value, 10) || 1; render(); };
    q('#wNew').onchange = e => { st.withCylinder = e.target.checked; render(); };
    render();
    q('#wGo').onclick = async () => {
      const r = T.quote(st, A.pricing);
      if (st.type !== 'exchange' && r.kg < 0.5) { A.toast('Enter at least 0.5 kg', 'warn'); return; }
      const ref = q('#wMomo').value.trim();
      if (st.pay === 'momo' && ref.length < 4) { A.toast('Enter the MoMo transaction ID', 'warn'); return; }
      const phone = q('#wPhone').value.trim();
      if (phone && !T.validPhone(phone)) { A.toast('Phone number looks wrong', 'warn'); return; }
      q('#wGo').disabled = true;
      try {
        A.pricing = await T.loadPricing();
        const order = await T.createOrder({ ...st, outlet, customerName: q('#wName').value.trim() || 'Walk-in', phone: phone || '0000000000',
          payPref: st.pay === 'momo' ? 'momo' : 'cash', source: 'walkin', createdBy: A.user.uid, createdByName: A.me.name }, A.pricing);
        const paid = await afterCreate({ ...order, createdAt: new Date() }, st.pay, ref, null);
        close();
        A.toast(`Walk-in sale ${order.code} — printing slip`);
        A.printSlip(paid);
      } catch (e) { q('#wGo').disabled = false; A.err(e, 'Could not record the sale'); }
    };
  }

  // ── PUMP ────────────────────────────────────────────────────────────────
  let camera = null;
  A.stopCamera = function () {
    if (!camera) return;
    camera.stopped = true;
    if (camera.stream) camera.stream.getTracks().forEach(t => t.stop());
    camera = null;
  };
  async function startScanner(box, onText) {
    A.stopCamera();
    if (!window.isSecureContext || !navigator.mediaDevices) {
      box.innerHTML = `<div class="note">The camera only works when the portal is opened over <b>https://</b>. Type the customer's 4-digit code below instead.</div>`;
      return;
    }
    box.innerHTML = `<div class="scan-frame" style="margin-top:12px;"><video class="scan-video" playsinline muted></video></div>
      <button class="btn btn-block" style="margin-top:8px;" id="scanStop">Stop camera</button>`;
    const video = box.querySelector('video');
    box.querySelector('#scanStop').onclick = () => { A.stopCamera(); box.innerHTML = ''; };
    const cam = camera = { stopped: false };
    try {
      cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      box.innerHTML = `<div class="note danger">Camera blocked or not available. Allow camera access in the browser settings, or type the code below.</div>`;
      camera = null; return;
    }
    if (cam.stopped) { cam.stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = cam.stream;
    await video.play().catch(() => {});
    let detector = null;
    try { if ('BarcodeDetector' in window) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (cam.stopped) return;
      let text = null;
      try {
        if (video.readyState >= 2) {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes.length) text = codes[0].rawValue;
          } else if (typeof jsQR === 'function') {
            const w = canvas.width = video.videoWidth, h = canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, w, h);
            const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
            if (r) text = r.data;
          }
        }
      } catch (e) { detector = null; }
      if (text) { if (navigator.vibrate) navigator.vibrate(120); A.stopCamera(); box.innerHTML = ''; onText(text); return; }
      setTimeout(tick, 180);
    };
    tick();
  }

  A.views.pump = async function (el) {
    const outlet = A.singleOutlet();
    let live = [];
    el.innerHTML = `
      <div class="cols-3">
        <div>
          <div class="panel">
            <h3>Check customer <small>${esc(T.outletName(outlet))} station</small></h3>
            <button class="btn btn-primary btn-xl btn-block" id="scanBtn">${A.icon('scan', 24)} Scan QR code</button>
            <div id="scanBox"></div>
            <div class="divider">or type the 4-digit code</div>
            <form class="codebox" id="pCodeForm"><input inputmode="numeric" autocomplete="off" maxlength="4" placeholder="····" aria-label="4-digit order code"></form>
          </div>
          <div id="pumpSlot"></div>
        </div>
        <div>
          <div class="kpis" style="grid-template-columns:1fr 1fr;">
            <div class="kpi safe"><div class="v" id="kFilled">—</div><div class="l">Filled today</div></div>
            <div class="kpi"><div class="v" id="kKg">—</div><div class="l">kg dispensed today</div></div>
          </div>
          <div class="panel"><h3>Paid · waiting at pump <span class="badge gold" id="waitN">0</span></h3><div id="waitList"><div class="empty">Nobody waiting</div></div></div>
          <div class="panel"><h3>Recently filled</h3><div id="doneList"><div class="empty">None yet today</div></div></div>
        </div>
      </div>`;
    const slot = $('#pumpSlot');
    const codeIn = codeInput($('#pCodeForm'), async code => {
      slot.innerHTML = '<div class="panel"><div class="empty">Checking…</div></div>';
      try { open(await orderByCode(outlet, code), null, code); } catch (e) { A.err(e); slot.innerHTML = ''; }
    });
    $('#scanBtn').onclick = () => startScanner($('#scanBox'), async text => {
      const p = T.parseQr(text);
      if (!p) { verdictOnly('bad', 'Not a Triple A Gas QR code'); return; }
      slot.innerHTML = '<div class="panel"><div class="empty">Checking…</div></div>';
      try { open(await orderById(p.id), p.token); } catch (e) { A.err(e); slot.innerHTML = ''; }
    });

    function verdictOnly(tone, msg, more = '') {
      slot.innerHTML = `<div class="order-card ${tone}"><div class="verdict ${tone}">${A.icon(tone === 'ok' ? 'checkCircle' : 'stop', 24)}${esc(msg)}</div>${more}</div>`;
      slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function open(o, token, code) {
      if (!o) return verdictOnly('bad', code ? `No order ${code} at this station` : 'Order not found');
      if (o.outlet !== outlet) return verdictOnly('bad', `Wrong station — this order is for ${T.outletName(o.outlet)}`);
      if (token && o.qrToken !== token) return verdictOnly('bad', 'Invalid QR code — do not fill', '<p style="color:var(--muted)">Ask the customer to show the code from the cashier, or check with the manager.</p>');
      const st = T.effectiveStatus(o);
      const what = `<div class="big-what">${esc(T.describe(o))}</div>`;
      if (st === 'pending' || st === 'expired') return verdictOnly('bad', 'NOT PAID — send customer to the cashier', what + orderKv(o));
      if (st === 'fulfilled') return verdictOnly('bad', `ALREADY FILLED ${A.fmtDateTime(o.fulfilledAt)}`, what + orderKv(o));
      if (st !== 'paid') return verdictOnly('bad', `Order ${(T.STATUS[st] || {}).label || st} — do not fill`, what + orderKv(o));

      const instr = o.type === 'exchange'
        ? `<div class="big-what">Hand over ${o.qty} × full ${esc(o.size)}</div><p style="font-size:16px;">${o.withCylinder ? 'New cylinder sold — no empty to collect.' : `Collect ${o.qty} empty ${esc(o.size)} cylinder${o.qty > 1 ? 's' : ''}.`}</p>`
        : `<div class="big-what">Fill ${o.kg} kg${o.mode === 'size' && o.size ? ` <small style="font-size:16px;color:var(--muted)">(${esc(o.size)} cylinder)</small>` : ''}</div>
           <p style="color:var(--muted)">${o.type === 'autogas' ? 'Vehicle autogas' : 'Cylinder refill'} · weigh on the certified scale.</p>`;
      slot.innerHTML = `<div class="order-card ok"><div class="verdict ok">${A.icon('checkCircle', 24)} PAID — FILL NOW</div>
        <div style="display:flex;justify-content:space-between;align-items:center;"><span class="code-chip" style="font-size:22px;">${esc(o.code)}</span><b class="big-amt" style="font-size:20px;">${T.money(o.amount)}</b></div>
        ${instr}${orderKv(o)}
        ${o.type !== 'exchange' ? `<div class="grid2" style="margin-top:12px;"><div class="field"><label>Actual kg dispensed</label><input id="dKg" type="number" step="0.01" inputmode="decimal" value="${o.kg}"></div>
          <div class="field"><label>Note (optional)</label><input id="dNote" maxlength="120"></div></div>`
          : `<div class="field" style="margin-top:12px;"><label>Note (optional)</label><input id="dNote" maxlength="120"></div>`}
        <button class="btn btn-safe btn-xl btn-block" id="fillGo">${A.icon('check', 22)} Filled — complete order</button></div>`;
      slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      $('#fillGo').onclick = async () => {
        const kgIn = $('#dKg') ? parseFloat($('#dKg').value) : null;
        if (o.type !== 'exchange' && (!kgIn || kgIn <= 0)) { A.toast('Enter the kg dispensed', 'warn'); return; }
        if (kgIn && Math.abs(kgIn - o.kg) > Math.max(0.5, o.kg * 0.05) &&
            !(await A.confirm(`You entered ${kgIn} kg but the customer paid for ${o.kg} kg. Save anyway?`, 'Save anyway'))) return;
        $('#fillGo').disabled = true;
        try {
          await fulfil(o, kgIn, $('#dNote').value.trim());
          A.toast(`Order ${o.code} complete`);
          verdictOnly('ok', `Order ${o.code} filled`, `<p style="color:var(--muted)">${esc(T.describe(o))}</p>`);
          codeIn.value = '';
        } catch (e) {
          $('#fillGo').disabled = false;
          if (e.message === 'not-paid') { A.toast('Order was already filled or changed', 'warn'); open(await orderById(o.id), token); return; }
          A.err(e, 'Could not complete the order');
        }
      };
    }

    async function fulfil(o, kg, note) {
      const ref = db.collection('orders').doc(o.id);
      const sref = db.collection('stock').doc(o.outlet);
      await db.runTransaction(async tx => {
        const os = await tx.get(ref);
        const ss = await tx.get(sref);
        if (!os.exists || os.data().status !== 'paid') throw new Error('not-paid');
        tx.update(ref, { status: 'fulfilled', fulfilledAt: FV.serverTimestamp(), fulfilledBy: A.user.uid, fulfilledByName: A.me.name,
          dispensedKg: kg || null, fillNote: note || '' });
        if (ss.exists) {
          const s = ss.data();
          const upd = { updatedAt: FV.serverTimestamp(), updatedBy: A.me.name };
          if (o.type === 'exchange') {
            const full = { ...(s.cylFull || {}) }, empty = { ...(s.cylEmpty || {}) };
            full[o.size] = (full[o.size] || 0) - o.qty;
            if (!o.withCylinder) empty[o.size] = (empty[o.size] || 0) + o.qty;
            upd.cylFull = full; upd.cylEmpty = empty;
          } else upd.stockKg = T.round2((s.stockKg || 0) - (kg || o.kg));
          tx.set(sref, upd, { merge: true });
        }
      });
      await db.collection('orderCodes').doc(`${o.outlet}_${o.code}`).delete().catch(() => {});
      A.audit('order filled', o.code, `${T.outletName(o.outlet)} · ${T.describe(o)}${kg ? ` · ${kg} kg` : ''}`);
    }

    el.addEventListener('click', e => {
      const r = e.target.closest('[data-oid]'); if (!r) return;
      const o = live.find(x => x.id === r.dataset.oid); if (o) open(o, null);
    });
    listenStation(outlet, list => {
      live = list;
      const waiting = live.filter(o => o.status === 'paid').sort((a, b) => (T.toDate(a.paidAt) || 0) - (T.toDate(b.paidAt) || 0));
      const today = T.dayStr();
      const done = live.filter(o => o.status === 'fulfilled' && T.dayStr(T.toDate(o.fulfilledAt) || new Date()) === today)
        .sort((a, b) => (T.toDate(b.fulfilledAt) || 0) - (T.toDate(a.fulfilledAt) || 0));
      A.setCount('pump', waiting.length);
      A.safe('#waitN').textContent = waiting.length;
      A.safe('#waitList').innerHTML = waiting.length ? waiting.map(o => orderRow(o, `<small style="color:var(--muted)">paid ${A.fmtTime(o.paidAt)}</small>`)).join('') : '<div class="empty">Nobody waiting</div>';
      A.safe('#doneList').innerHTML = done.length ? done.slice(0, 12).map(o => orderRow(o, `<small style="color:var(--muted)">${A.fmtTime(o.fulfilledAt)}</small>`)).join('') : '<div class="empty">None yet today</div>';
      A.safe('#kFilled').textContent = done.length;
      A.safe('#kKg').textContent = T.round2(done.filter(o => o.type !== 'exchange').reduce((s, o) => s + (o.dispensedKg || o.kg || 0), 0));
    });
  };

  // ── ORDERS ──────────────────────────────────────────────────────────────
  A.openOrder = function (o, onChange) {
    const st = T.effectiveStatus(o);
    const canManage = A.can(['owner', 'coo', 'manager']);
    const { el, close } = A.modal(`<h2>Order ${esc(o.code)} ${A.statusBadge(o)}</h2>
      <div class="big-what" style="font-size:22px;">${esc(T.describe(o))}</div><div class="big-amt">${T.money(o.amount)}</div>
      ${o.status === 'paid' && o.qrToken ? '<div class="qrbox" id="mq"></div>' : ''}
      ${orderKv(o, `<dt>Order ID</dt><dd class="mono" style="font-size:11px;">${esc(o.id)}</dd>`)}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
        ${o.status === 'paid' ? `<button class="btn btn-primary" data-a="print">${A.icon('printer', 18)} Print slip</button>` : ''}
        ${st === 'pending' || st === 'expired' ? '<button class="btn btn-danger" data-a="cancel">Cancel order</button>' : ''}
        ${o.status === 'paid' && canManage ? '<button class="btn btn-danger" data-a="refund">Refund</button>' : ''}
        <a class="btn" href="order.html?id=${encodeURIComponent(o.id)}" target="_blank" rel="noopener">Customer page ↗</a>
      </div>`);
    if (o.status === 'paid' && o.qrToken) T.renderQR(el.querySelector('#mq'), T.qrPayload(o.id, o.qrToken), 5);
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      try {
        if (b.dataset.a === 'print') A.printSlip(o);
        if (b.dataset.a === 'cancel') { const r = await A.prompt('Cancel order ' + o.code, 'Reason', 'Customer changed mind'); if (!r) return; await cancelOrder(o, r); A.toast('Order cancelled'); close(); onChange && onChange(); }
        if (b.dataset.a === 'refund') { const r = await A.prompt('Refund order ' + o.code, 'Reason (money returned to customer)', ''); if (!r) return; await refundOrder(o, r); A.toast('Order refunded'); close(); onChange && onChange(); }
      } catch (err) { A.err(err); }
    });
  };

  A.views.orders = async function (el) {
    const state = { day: T.dayStr(), status: 'all', type: 'all', q: '' };
    el.innerHTML = `<div class="panel">
      <div class="toolbar">
        <input type="date" id="oDay" value="${state.day}" max="${T.dayStr()}">
        <select id="oStatus"><option value="all">All statuses</option>${Object.entries(T.STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        <select id="oType"><option value="all">All types</option><option value="refill">Refill</option><option value="exchange">Exchange</option><option value="autogas">Autogas</option></select>
        <input class="grow" id="oQ" placeholder="Search code, name or phone" type="search">
        <button class="btn btn-sm" id="oCsv">${A.icon('download', 16)} CSV</button>
      </div>
      <div class="kpis" id="oKpis"></div>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Code</th><th>Station</th><th>Customer</th><th>Order</th><th class="num">Amount</th><th>Pay</th><th>Status</th></tr></thead><tbody id="oBody"></tbody></table></div></div>`;
    let rows = [];
    const filtered = () => rows.filter(o =>
      (state.status === 'all' || T.effectiveStatus(o) === state.status) &&
      (state.type === 'all' || o.type === state.type) &&
      (!state.q || [o.code, o.customerName, o.phone].join(' ').toLowerCase().includes(state.q.toLowerCase())));
    function render() {
      const list = filtered();
      const sold = rows.filter(o => ['paid', 'fulfilled'].includes(o.status));
      A.safe('#oKpis').innerHTML = `
        <div class="kpi gold"><div class="v">${T.money(sold.reduce((s, o) => s + o.amount, 0))}</div><div class="l">Paid sales</div></div>
        <div class="kpi"><div class="v">${rows.length}</div><div class="l">Orders</div></div>
        <div class="kpi warn"><div class="v">${rows.filter(o => T.effectiveStatus(o) === 'pending').length}</div><div class="l">Awaiting payment</div></div>
        <div class="kpi safe"><div class="v">${rows.filter(o => o.status === 'fulfilled').length}</div><div class="l">Filled</div></div>`;
      A.safe('#oBody').innerHTML = list.length ? list.map(o => `<tr class="click" data-oid="${o.id}">
        <td class="mono">${A.fmtTime(o.createdAt)}</td><td><span class="code-chip" style="font-size:13px;">${esc(o.code)}</span></td>
        <td>${esc(T.outletName(o.outlet))}</td><td>${esc(o.customerName || 'Walk-in')}<br><small class="mono" style="color:var(--muted)">${o.phone !== '0000000000' ? esc(o.phone) : ''}</small></td>
        <td>${esc(T.describe(o))}</td><td class="num">${T.money(o.amount)}</td><td>${esc((o.payMethod || o.payPref || '').toUpperCase())}</td><td>${A.statusBadge(o)}</td></tr>`).join('')
        : '<tr><td colspan="8" class="empty">No orders</td></tr>';
    }
    async function load() {
      A.safe('#oBody').innerHTML = '<tr><td colspan="8" class="empty">Loading…</td></tr>';
      A.unsubs.forEach(u => u()); A.unsubs = [];
      const outlets = A.outletsInScope();
      const all = outlets.length === T.OUTLETS.length && A.isHQ();
      // Live for today, one-off fetch for past days.
      if (state.day === T.dayStr()) {
        const byKey = {};
        const queries = all ? [db.collection('orders').where('day', '==', state.day)]
          : outlets.map(o => db.collection('orders').where('outlet', '==', o).where('day', '==', state.day));
        queries.forEach((qq, i) => A.listen(qq, snap => {
          byKey[i] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          rows = [].concat(...Object.values(byKey)).sort((a, b) => (T.toDate(b.createdAt) || 0) - (T.toDate(a.createdAt) || 0));
          render();
        }, e => A.err(e)));
      } else {
        try { rows = await A.fetchOrders(outlets, [state.day]); render(); } catch (e) { A.err(e); }
      }
    }
    $('#oDay').onchange = e => { state.day = e.target.value || T.dayStr(); load(); };
    $('#oStatus').onchange = e => { state.status = e.target.value; render(); };
    $('#oType').onchange = e => { state.type = e.target.value; render(); };
    $('#oQ').oninput = e => { state.q = e.target.value.trim(); render(); };
    $('#oCsv').onclick = () => A.csv(`orders-${state.day}.csv`, filtered().map(o => ({
      time: A.fmtDateTime(o.createdAt), code: o.code, station: T.outletName(o.outlet), customer: o.customerName, phone: o.phone,
      order: T.describe(o), kg: o.kg, amount: o.amount, payMethod: o.payMethod || '', momoRef: o.momoRef || '', status: T.effectiveStatus(o),
      cashier: o.paidByName || '', attendant: o.fulfilledByName || '', source: o.source })));
    $('#oBody').onclick = e => { const r = e.target.closest('[data-oid]'); if (!r) return; const o = rows.find(x => x.id === r.dataset.oid); if (o) A.openOrder(o, load); };
    load();
  };

  // ── CASH-UP ─────────────────────────────────────────────────────────────
  A.views.cashup = async function (el) {
    const outlet = A.singleOutlet();
    const today = T.dayStr();
    const orders = await A.fetchOrders([outlet], [T.dayStr(new Date(Date.now() - DAY)), today]);
    const mine = orders.filter(o => o.paidBy === A.user.uid && ['paid', 'fulfilled', 'refunded'].includes(o.status) && T.dayStr(T.toDate(o.paidAt) || new Date()) === today);
    const sum = m => T.round2(mine.filter(o => o.payMethod === m && o.status !== 'refunded').reduce((s, o) => s + o.amount, 0));
    const exp = { cash: sum('cash'), momo: sum('momo'), card: sum('card') };
    const refunds = mine.filter(o => o.status === 'refunded');
    el.innerHTML = `<div class="cols">
      <div class="panel"><h3>My cash-up today <small>${esc(T.outletName(outlet))}</small></h3>
        <div class="kpis" style="grid-template-columns:repeat(3,1fr);">
          <div class="kpi"><div class="v">${T.money(exp.cash)}</div><div class="l">Cash expected</div></div>
          <div class="kpi"><div class="v">${T.money(exp.momo)}</div><div class="l">MoMo expected</div></div>
          <div class="kpi"><div class="v">${T.money(exp.card)}</div><div class="l">Card expected</div></div>
        </div>
        <p style="color:var(--muted);margin-bottom:12px;">${mine.length} payment${mine.length === 1 ? '' : 's'} confirmed by you today${refunds.length ? ` · ${refunds.length} refunded (excluded)` : ''}.</p>
        <form id="cuForm">
          <div class="grid3"><div class="field"><label>Cash counted</label><input name="cash" type="number" step="0.01" required inputmode="decimal"></div>
          <div class="field"><label>MoMo confirmed</label><input name="momo" type="number" step="0.01" value="${exp.momo}" inputmode="decimal"></div>
          <div class="field"><label>Card confirmed</label><input name="card" type="number" step="0.01" value="${exp.card}" inputmode="decimal"></div></div>
          <div class="field"><label>Notes</label><input name="notes" maxlength="200" placeholder="e.g. GH₵20 short, customer to bring tomorrow"></div>
          <div id="cuVar" style="margin-bottom:10px;"></div>
          <button class="btn btn-primary">Submit cash-up</button>
        </form></div>
      <div class="panel"><h3>Recent cash-ups</h3><div id="cuList"><div class="empty">Loading…</div></div></div></div>`;
    const f = $('#cuForm');
    const variance = () => {
      const d = A.formData(f);
      const v = T.round2((+d.cash || 0) + (+d.momo || 0) + (+d.card || 0) - exp.cash - exp.momo - exp.card);
      A.safe('#cuVar').innerHTML = d.cash === '' ? '' : `<span class="badge ${Math.abs(v) < 0.01 ? 'safe' : v < 0 ? 'danger' : 'warn'}">${v < 0 ? 'Short' : v > 0 ? 'Over' : 'Balanced'} ${T.money(Math.abs(v))}</span>`;
      return v;
    };
    f.oninput = variance;
    f.onsubmit = async e => {
      e.preventDefault();
      const d = A.formData(f);
      const v = variance();
      if (Math.abs(v) >= 0.01 && !d.notes.trim() && !(await A.confirm(`Variance of ${T.money(v)} with no note. Submit anyway?`, 'Submit'))) return;
      try {
        await A.addOps('cashups', { outlet, cashier: A.me.name, payments: mine.length,
          expectedCash: exp.cash, expectedMomo: exp.momo, expectedCard: exp.card,
          countedCash: +d.cash || 0, countedMomo: +d.momo || 0, countedCard: +d.card || 0, variance: v, notes: d.notes.trim() });
        A.audit('cash-up submitted', T.outletName(outlet), `variance ${T.money(v)}`);
        A.toast('Cash-up submitted'); A.refresh();
      } catch (err) { A.err(err); }
    };
    try {
      const list = await A.fetchOps('cashups', [outlet], A.daysBack(14));
      A.safe('#cuList').innerHTML = list.length ? list.map(c => `<div class="list-row"><div class="grow"><b>${esc(c.cashier)}</b><small>${A.fmtDay(c.day)} · ${c.payments} payments · expected ${T.money(c.expectedCash + c.expectedMomo + c.expectedCard)}${c.notes ? ' · ' + esc(c.notes) : ''}</small></div>
        <span class="badge ${Math.abs(c.variance) < 0.01 ? 'safe' : c.variance < 0 ? 'danger' : 'warn'}">${c.variance < 0 ? '−' : c.variance > 0 ? '+' : ''}${T.money(Math.abs(c.variance))}</span></div>`).join('') : '<div class="empty">No cash-ups yet</div>';
    } catch (e) { A.safe('#cuList').innerHTML = '<div class="empty">Could not load</div>'; }
  };

  // ── SHIFT NOTES ─────────────────────────────────────────────────────────
  A.views.notes = async function (el) {
    const outlets = A.outletsInScope();
    el.innerHTML = `<div class="cols"><div class="panel"><h3>Leave a note for the next shift</h3>
      <form id="nForm">${A.isHQ() ? `<div class="field"><label>Station</label><select name="outlet">${A.outletOptions(A.singleOutlet() || 'accra')}</select></div>` : ''}
        <div class="field"><label>Note</label><textarea name="note" required maxlength="500" placeholder="e.g. Scale 2 reading high, technician called"></textarea></div>
        <div class="field"><label>Priority</label><select name="priority"><option value="normal">Normal</option><option value="high">Important</option></select></div>
        <button class="btn btn-primary">Post note</button></form></div>
      <div class="panel"><h3>Notes · last 7 days</h3><div id="nList"><div class="empty">Loading…</div></div></div></div>`;
    $('#nForm').onsubmit = async e => {
      e.preventDefault();
      const d = A.formData(e.target);
      try { await A.addOps('shiftNotes', { outlet: d.outlet || A.me.outlet, note: d.note.trim(), priority: d.priority }); A.toast('Note posted'); A.refresh(); } catch (err) { A.err(err); }
    };
    try {
      const list = await A.fetchOps('shiftNotes', outlets, A.daysBack(7));
      A.safe('#nList').innerHTML = list.length ? list.map(n => `<div class="list-row"><div class="grow">${n.priority === 'high' ? '<span class="badge danger">Important</span> ' : ''}${esc(n.note)}
        <small>${esc(n.byName)} · ${esc(T.outletName(n.outlet))} · ${A.fmtDateTime(n.at)}</small></div></div>`).join('') : '<div class="empty">No notes</div>';
    } catch (e) { A.safe('#nList').innerHTML = '<div class="empty">Could not load</div>'; }
  };
})();
