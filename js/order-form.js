/* ==========================================================================
   TRIPLE A GAS — public "Order LPG" form
   Any page can call openPublicOrderModal(). Needs js/tag-common.js.
   ========================================================================== */
(function () {
  const T = window.TAG;
  let pricing = T.DEFAULT_PRICING;
  let stations = {};
  const state = { type: 'refill', mode: 'size', size: '14.5kg', kg: 5, amount: 100, qty: 1, withCylinder: false, outlet: '', payPref: 'cash' };

  const css = `
  .tag-om{position:fixed;inset:0;z-index:3000;display:none;align-items:flex-start;justify-content:center;background:rgba(20,6,9,.72);padding:20px 16px;overflow-y:auto;}
  .tag-om.open{display:flex;}
  .tag-om *{box-sizing:border-box;}
  .tag-om-card{background:#fff;color:#221417;width:100%;max-width:520px;border-radius:18px;padding:24px 22px 22px;margin:auto;box-shadow:0 30px 70px rgba(0,0,0,.35);font-family:Inter,system-ui,sans-serif;position:relative;}
  .tag-om h3{font-family:'Archivo Expanded',Inter,sans-serif;font-size:19px;margin:0 0 4px;color:#3E0B14;}
  .tag-om .sub{font-size:13px;color:#7A6669;margin:0 0 18px;}
  .tag-om .x{position:absolute;top:12px;right:12px;border:none;background:#F3EBEC;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;color:#4A3A3D;}
  .tag-om label.l{display:block;font-size:12px;font-weight:700;letter-spacing:.02em;margin:14px 0 6px;color:#4A3A3D;text-transform:uppercase;}
  .tag-om .chips{display:flex;flex-wrap:wrap;gap:8px;}
  .tag-om .chip{border:1.5px solid #D9C9CC;background:#fff;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:600;cursor:pointer;color:#221417;min-height:44px;}
  .tag-om .chip small{display:block;font-weight:500;font-size:11.5px;color:#7A6669;}
  .tag-om .chip[aria-pressed=true]{border-color:#A8283A;background:#F7E7EA;color:#6E1524;}
  .tag-om .chip:disabled{opacity:.45;cursor:not-allowed;}
  .tag-om .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#F3EBEC;padding:4px;border-radius:12px;}
  .tag-om .seg button{border:none;background:transparent;padding:10px 6px;border-radius:9px;font-weight:700;font-size:13px;cursor:pointer;color:#4A3A3D;min-height:44px;}
  .tag-om .seg button[aria-pressed=true]{background:#fff;color:#A8283A;box-shadow:0 2px 8px rgba(0,0,0,.08);}
  .tag-om input[type=text],.tag-om input[type=tel],.tag-om input[type=number]{width:100%;padding:12px 13px;border:1.5px solid #D9C9CC;border-radius:10px;font-size:16px;font-family:inherit;}
  .tag-om input:focus{outline:none;border-color:#A8283A;box-shadow:0 0 0 3px rgba(168,40,58,.15);}
  .tag-om .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .tag-om .check{display:flex;gap:10px;align-items:center;margin-top:12px;font-size:14px;}
  .tag-om .check input{width:20px;height:20px;}
  .tag-om .total{margin-top:18px;background:#3E0B14;color:#fff;border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;}
  .tag-om .total b{font-family:'IBM Plex Mono',monospace;font-size:22px;color:#E9C46A;}
  .tag-om .total span{font-size:12.5px;opacity:.85;}
  .tag-om .go{margin-top:14px;width:100%;border:none;background:#A8283A;color:#fff;font-weight:800;font-size:16px;padding:15px;border-radius:12px;cursor:pointer;min-height:50px;}
  .tag-om .go:disabled{opacity:.6;cursor:wait;}
  .tag-om .err{color:#C62828;font-size:13px;margin-top:10px;min-height:1em;}
  .tag-om .how{font-size:12.5px;color:#7A6669;margin-top:12px;line-height:1.5;}
  @media (max-width:420px){.tag-om .seg button{font-size:12px;}}
  `;

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function pressed(container, attr, val) {
    container.querySelectorAll(`[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));
  }

  function build() {
    if (document.getElementById('tagOrderModal')) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const m = el(`
    <div class="tag-om" id="tagOrderModal" role="dialog" aria-modal="true" aria-labelledby="tagOmTitle">
      <div class="tag-om-card">
        <button class="x" type="button" aria-label="Close" data-close>&times;</button>
        <h3 id="tagOmTitle">Order LPG</h3>
        <p class="sub">Order here, get a 4-digit code, pay at the cashier, then show your QR code at the pump.</p>
        <form id="tagOmForm" novalidate>
          <label class="l">Station</label>
          <div class="chips" id="tagOmOutlets"></div>

          <label class="l">What do you need?</label>
          <div class="seg" id="tagOmType">
            <button type="button" data-type="refill">Cylinder refill</button>
            <button type="button" data-type="exchange">Exchange</button>
            <button type="button" data-type="autogas">Vehicle gas</button>
          </div>

          <div id="tagOmRefill">
            <label class="l">Buy by</label>
            <div class="seg" id="tagOmMode">
              <button type="button" data-mode="size">Full cylinder</button>
              <button type="button" data-mode="amount">Cedi amount</button>
              <button type="button" data-mode="kg">Kilograms</button>
            </div>
            <div id="tagOmSizeBox"><label class="l">Cylinder size</label><div class="chips" id="tagOmSizes"></div></div>
            <div id="tagOmAmountBox">
              <label class="l" for="tagOmAmount">Amount (GH₵)</label>
              <div class="chips" id="tagOmAmountChips" style="margin-bottom:8px;"></div>
              <input type="number" id="tagOmAmount" min="1" step="1" inputmode="decimal">
            </div>
            <div id="tagOmKgBox"><label class="l" for="tagOmKg">Kilograms</label><input type="number" id="tagOmKg" min="0.5" step="0.5" inputmode="decimal"></div>
          </div>

          <div id="tagOmExchange">
            <label class="l">Cylinder size</label><div class="chips" id="tagOmExSizes"></div>
            <div class="row2">
              <div><label class="l" for="tagOmQty">How many</label><input type="number" id="tagOmQty" min="1" max="5" value="1" inputmode="numeric"></div>
              <div></div>
            </div>
            <label class="check"><input type="checkbox" id="tagOmNewCyl"> I don't have an empty cylinder to swap (buy a new one)</label>
          </div>

          <div class="row2">
            <div><label class="l" for="tagOmName">Your name</label><input type="text" id="tagOmName" autocomplete="name" maxlength="60" placeholder="e.g. Ama Mensah"></div>
            <div><label class="l" for="tagOmPhone">Phone</label><input type="tel" id="tagOmPhone" autocomplete="tel" inputmode="tel" placeholder="024 123 4567"></div>
          </div>

          <label class="l">I'll pay with</label>
          <div class="seg" id="tagOmPay" style="grid-template-columns:1fr 1fr;">
            <button type="button" data-pay="cash">Cash</button>
            <button type="button" data-pay="momo">Mobile Money</button>
          </div>

          <div class="total"><div><span id="tagOmSummary"></span></div><b id="tagOmTotal">GH₵ 0.00</b></div>
          <button class="go" type="submit" id="tagOmGo">Get my order code</button>
          <div class="err" id="tagOmErr" role="alert"></div>
          <p class="how">Prices are set per kg and update with each NPA pricing window. The pump attendant fills by weight on a certified scale.</p>
        </form>
      </div>
    </div>`);
    document.body.appendChild(m);

    m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.classList.contains('open')) close(); });
    m.querySelector('#tagOmType').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) { state.type = b.dataset.type; if (state.type === 'autogas' && state.mode === 'size') state.mode = 'amount'; render(); } });
    m.querySelector('#tagOmMode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b && !b.disabled) { state.mode = b.dataset.mode; render(); } });
    m.querySelector('#tagOmPay').addEventListener('click', e => { const b = e.target.closest('[data-pay]'); if (b) { state.payPref = b.dataset.pay; render(); } });
    m.querySelector('#tagOmOutlets').addEventListener('click', e => { const b = e.target.closest('[data-outlet]'); if (b && !b.disabled) { state.outlet = b.dataset.outlet; render(); } });
    m.querySelector('#tagOmSizes').addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (b) { state.size = b.dataset.size; render(); } });
    m.querySelector('#tagOmExSizes').addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (b) { state.size = b.dataset.size; render(); } });
    m.querySelector('#tagOmAmountChips').addEventListener('click', e => { const b = e.target.closest('[data-amt]'); if (b) { state.amount = +b.dataset.amt; m.querySelector('#tagOmAmount').value = state.amount; render(); } });
    m.querySelector('#tagOmAmount').addEventListener('input', e => { state.amount = parseFloat(e.target.value) || 0; render(false); });
    m.querySelector('#tagOmKg').addEventListener('input', e => { state.kg = parseFloat(e.target.value) || 0; render(false); });
    m.querySelector('#tagOmQty').addEventListener('input', e => { state.qty = parseInt(e.target.value, 10) || 1; render(false); });
    m.querySelector('#tagOmNewCyl').addEventListener('change', e => { state.withCylinder = e.target.checked; render(false); });
    m.querySelector('#tagOmForm').addEventListener('submit', submit);
    try { const saved = JSON.parse(localStorage.getItem('tag_customer') || '{}'); if (saved.name) m.querySelector('#tagOmName').value = saved.name; if (saved.phone) m.querySelector('#tagOmPhone').value = saved.phone; if (saved.outlet) state.outlet = saved.outlet; } catch (e) {}
  }

  function stationOpen(id) {
    const s = stations[id];
    return !s || s.open !== false;
  }

  function render(full = true) {
    const m = document.getElementById('tagOrderModal');
    const p = pricing;
    if (full) {
      m.querySelector('#tagOmOutlets').innerHTML = T.OUTLETS.map(o => {
        const open = stationOpen(o.id);
        return `<button type="button" class="chip" data-outlet="${o.id}" ${open ? '' : 'disabled'}>${T.esc(o.name)}${open ? '' : '<small>Closed now</small>'}</button>`;
      }).join('');
      m.querySelector('#tagOmSizes').innerHTML = T.SIZES.map(s => `<button type="button" class="chip" data-size="${s}">${s}<small>${T.money(parseFloat(s) * p.perKg)}</small></button>`).join('');
      m.querySelector('#tagOmExSizes').innerHTML = T.SIZES.map(s => `<button type="button" class="chip" data-size="${s}">${s}<small>${T.money(p.exchange[s])}</small></button>`).join('');
      m.querySelector('#tagOmAmountChips').innerHTML = [50, 100, 150, 200, 300].map(a => `<button type="button" class="chip" data-amt="${a}">GH₵ ${a}</button>`).join('');
      m.querySelector('#tagOmAmount').value = state.amount;
      m.querySelector('#tagOmKg').value = state.kg;
      m.querySelector('#tagOmQty').value = state.qty;
    }
    pressed(m.querySelector('#tagOmType'), 'type', state.type);
    pressed(m.querySelector('#tagOmMode'), 'mode', state.mode);
    pressed(m.querySelector('#tagOmPay'), 'pay', state.payPref);
    pressed(m.querySelector('#tagOmOutlets'), 'outlet', state.outlet);
    pressed(m.querySelector('#tagOmSizes'), 'size', state.size);
    pressed(m.querySelector('#tagOmExSizes'), 'size', state.size);
    pressed(m.querySelector('#tagOmAmountChips'), 'amt', state.amount);

    const isEx = state.type === 'exchange';
    m.querySelector('#tagOmRefill').style.display = isEx ? 'none' : '';
    m.querySelector('#tagOmExchange').style.display = isEx ? '' : 'none';
    m.querySelector('#tagOmMode [data-mode=size]').disabled = state.type === 'autogas';
    m.querySelector('#tagOmSizeBox').style.display = state.mode === 'size' ? '' : 'none';
    m.querySelector('#tagOmAmountBox').style.display = state.mode === 'amount' ? '' : 'none';
    m.querySelector('#tagOmKgBox').style.display = state.mode === 'kg' ? '' : 'none';

    const q = T.quote(state, pricing);
    m.querySelector('#tagOmTotal').textContent = T.money(q.amount);
    m.querySelector('#tagOmSummary').textContent = isEx
      ? `${q.qty} × ${q.size}${q.withCylinder ? ' + new cylinder' : ''}`
      : `${q.kg} kg @ ${T.money(q.unitPrice)}/kg`;
  }

  function validate() {
    const m = document.getElementById('tagOrderModal');
    const q = T.quote(state, pricing);
    if (!state.outlet) return 'Choose a station.';
    if (!stationOpen(state.outlet)) return 'That station is closed right now. Please choose another.';
    if (state.type !== 'exchange' && state.mode === 'amount' && q.amount < (pricing.minAmount || 1)) return `Minimum order is ${T.money(pricing.minAmount || 1)}.`;
    if (state.type !== 'exchange' && q.kg < 0.5) return 'Enter at least 0.5 kg.';
    if (state.type !== 'exchange' && q.kg > (state.type === 'autogas' ? 300 : 1000)) return 'For large quantities please request bulk supply on the contact page.';
    if (state.type === 'exchange' && (state.qty < 1 || state.qty > 5)) return 'You can exchange 1 to 5 cylinders per order.';
    if (!T.validPhone(m.querySelector('#tagOmPhone').value)) return 'Enter a valid Ghana phone number, e.g. 024 123 4567.';
    return '';
  }

  async function submit(e) {
    e.preventDefault();
    const m = document.getElementById('tagOrderModal');
    const errEl = m.querySelector('#tagOmErr');
    const btn = m.querySelector('#tagOmGo');
    errEl.textContent = '';
    const problem = validate();
    if (problem) { errEl.textContent = problem; return; }
    btn.disabled = true; btn.textContent = 'Creating your order…';
    const name = m.querySelector('#tagOmName').value.trim();
    const phone = m.querySelector('#tagOmPhone').value;
    try { localStorage.setItem('tag_customer', JSON.stringify({ name, phone, outlet: state.outlet })); } catch (err) {}
    try {
      pricing = await T.loadPricing(); // never charge on stale prices
      const order = await T.createOrder({ ...state, customerName: name, phone, source: 'online' }, pricing);
      T.rememberOrder(order);
      location.href = `order.html?id=${encodeURIComponent(order.id)}`;
    } catch (err) {
      console.error(err);
      errEl.textContent = navigator.onLine === false
        ? 'You appear to be offline. Check your connection and try again.'
        : 'Sorry, we could not create your order. Please try again in a moment.';
      btn.disabled = false; btn.textContent = 'Get my order code';
    }
  }

  async function loadLive() {
    pricing = await T.loadPricing();
    try {
      const { db } = T.init();
      const snap = await db.collection('stations').get();
      snap.forEach(d => { stations[d.id] = d.data(); });
    } catch (e) { /* stations optional */ }
    if (document.getElementById('tagOrderModal')?.classList.contains('open')) render();
  }

  function open(prefill) {
    build();
    if (prefill && prefill.outlet) state.outlet = prefill.outlet;
    if (prefill && prefill.type) state.type = prefill.type;
    render();
    document.getElementById('tagOrderModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    loadLive();
  }
  function close() {
    const m = document.getElementById('tagOrderModal');
    if (m) m.classList.remove('open');
    document.body.style.overflow = '';
  }

  window.openPublicOrderModal = open;
  window.closePublicOrderModal = close;
})();
