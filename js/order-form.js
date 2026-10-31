/* ==========================================================================
   TRIPLE A GAS — public "Order LPG" sheet
   Any page can call openPublicOrderModal(). Needs js/tag-common.js.
   ========================================================================== */
(function () {
  const T = window.TAG;
  let pricing = T.DEFAULT_PRICING;
  let stations = {};
  let liveLoaded = false;
  const state = { type: 'refill', mode: 'size', size: '14.5kg', kg: 5, amount: 100, qty: 1, withCylinder: false, outlet: '', payPref: 'cash' };

  const svg = p => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    refill: svg('<path d="M8 3h8"/><path d="M10 3v2M14 3v2"/><rect x="6" y="5" width="12" height="16" rx="5"/><path d="M6 11h12"/>'),
    exchange: svg('<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>'),
    autogas: svg('<path d="M5 17h14M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm14 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 17V9l2-4h11l3 4h2v8"/>'),
    cash: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'),
    momo: svg('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>')
  };

  const css = `
  .tom{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;background:rgba(24,8,12,.55);padding:20px;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);}
  .tom.open{display:flex;animation:tomFade .2s ease;}
  .tom *{box-sizing:border-box;}
  .tom-card{background:#fff;color:#1b1215;width:100%;max-width:540px;max-height:min(92vh,880px);border-radius:24px;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(30,6,12,.35);font-family:Inter,system-ui,-apple-system,sans-serif;overflow:hidden;animation:tomRise .28s cubic-bezier(.2,.8,.2,1);}
  .tom-head{display:flex;align-items:flex-start;gap:12px;padding:22px 22px 14px;}
  .tom-head h3{font-family:Inter,system-ui,sans-serif;font-size:21px;font-weight:800;letter-spacing:-.02em;margin:0;color:#1b1215;}
  .tom-head p{font-size:13.5px;color:#6c5f62;margin:4px 0 0;line-height:1.45;}
  .tom-x{margin-left:auto;flex-shrink:0;border:none;background:#f3eeee;width:38px;height:38px;border-radius:50%;cursor:pointer;color:#4a3a3d;display:grid;place-items:center;}
  .tom-x svg{width:18px;height:18px;}
  .tom-steps{display:flex;gap:6px;padding:0 22px 14px;}
  .tom-steps span{flex:1;font-size:11.5px;font-weight:600;color:#9b8b8f;display:flex;flex-direction:column;gap:6px;}
  .tom-steps span::before{content:'';height:3px;border-radius:3px;background:#efe8e9;}
  .tom-steps span.on{color:#a8283a;} .tom-steps span.on::before{background:#a8283a;}
  .tom-body{overflow-y:auto;padding:4px 22px 18px;flex:1;overscroll-behavior:contain;}
  .tom-sec{margin-top:18px;}
  .tom-sec:first-child{margin-top:4px;}
  .tom-l{display:block;font-size:13px;font-weight:700;margin:0 0 8px;color:#3a2a2e;}
  .tom-grid{display:grid;gap:8px;}
  .tom-g3{grid-template-columns:repeat(3,1fr);} .tom-g2{grid-template-columns:repeat(2,1fr);} .tom-g4{grid-template-columns:repeat(4,1fr);} .tom-g5{grid-template-columns:repeat(5,1fr);}
  .tom-opt{position:relative;border:1.5px solid #e6dcde;background:#fff;border-radius:14px;padding:12px 10px;cursor:pointer;text-align:center;font-weight:600;font-size:14px;color:#1b1215;min-height:48px;transition:border-color .12s,background .12s,box-shadow .12s;font-family:inherit;line-height:1.25;}
  .tom-opt:hover{border-color:#c9b6ba;}
  .tom-opt small{display:block;font-weight:500;font-size:12px;color:#7a6669;margin-top:3px;}
  .tom-opt svg{display:block;margin:0 auto 6px;color:#a8283a;}
  .tom-opt[aria-pressed=true]{border-color:#a8283a;background:#fbf1f3;box-shadow:0 0 0 3px rgba(168,40,58,.1);}
  .tom-opt[aria-pressed=true]::after{content:'';position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;background:#a8283a;}
  .tom-opt:disabled{opacity:.4;cursor:not-allowed;}
  .tom-opt .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a;margin-right:6px;vertical-align:1px;}
  .tom-opt .dot.off{background:#dc2626;} .tom-opt .dot.lim{background:#d97706;}
  .tom-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;background:#f3eeef;padding:4px;border-radius:12px;gap:4px;}
  .tom-seg button{border:none;background:transparent;padding:9px 6px;border-radius:9px;font-weight:600;font-size:13.5px;cursor:pointer;color:#6c5f62;min-height:40px;font-family:inherit;}
  .tom-seg button[aria-pressed=true]{background:#fff;color:#1b1215;box-shadow:0 1px 3px rgba(30,10,15,.12);}
  .tom-seg button:disabled{opacity:.4;cursor:not-allowed;}
  .tom input[type=text],.tom input[type=tel],.tom input[type=number]{width:100%;padding:12px 14px;border:1.5px solid #e6dcde;border-radius:12px;font-size:16px;font-family:inherit;color:#1b1215;background:#fff;transition:border-color .12s,box-shadow .12s;}
  .tom input:focus{outline:none;border-color:#a8283a;box-shadow:0 0 0 4px rgba(168,40,58,.12);}
  .tom-unit{position:relative;}
  .tom-unit input{padding-left:52px!important;font-weight:600;}
  .tom-unit b{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:14px;color:#7a6669;font-weight:600;}
  .tom-unit.kg input{padding-left:14px!important;padding-right:44px!important;}
  .tom-unit.kg b{left:auto;right:14px;}
  .tom-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .tom-check{display:flex;gap:10px;align-items:center;margin-top:12px;font-size:14px;color:#3a2a2e;cursor:pointer;}
  .tom-check input{width:20px;height:20px;accent-color:#a8283a;}
  .tom-foot{border-top:1px solid #f0e8e9;padding:14px 22px calc(16px + env(safe-area-inset-bottom));background:#fff;}
  .tom-sum{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px;}
  .tom-sum span{font-size:13px;color:#6c5f62;}
  .tom-sum b{font-size:26px;font-weight:800;letter-spacing:-.02em;color:#1b1215;font-variant-numeric:tabular-nums;}
  .tom-go{width:100%;border:none;background:#a8283a;color:#fff;font-weight:700;font-size:16px;padding:15px;border-radius:14px;cursor:pointer;min-height:54px;display:flex;align-items:center;justify-content:center;gap:10px;font-family:inherit;transition:background .15s,transform .08s;}
  .tom-go:hover{background:#8e1b2c;} .tom-go:active{transform:scale(.99);}
  .tom-go:disabled{opacity:.7;cursor:wait;}
  .tom-go svg{width:20px;height:20px;}
  .tom-err{color:#c62828;font-size:13.5px;margin-top:10px;min-height:1em;text-align:center;}
  .tom-fine{font-size:12px;color:#8a7a7e;margin-top:10px;text-align:center;line-height:1.45;}
  @media (max-width:600px){
    .tom{padding:0;align-items:flex-end;}
    .tom-card{border-radius:24px 24px 0 0;max-height:94vh;animation:tomSheet .3s cubic-bezier(.2,.8,.2,1);}
    .tom-head{padding:18px 18px 12px;} .tom-steps{padding:0 18px 12px;} .tom-body{padding:4px 18px 16px;} .tom-foot{padding:12px 18px calc(14px + env(safe-area-inset-bottom));}
    .tom-g5{grid-template-columns:repeat(3,1fr);}
    .tom-g4{grid-template-columns:repeat(2,1fr);}
  }
  @keyframes tomFade{from{opacity:0}to{opacity:1}}
  @keyframes tomRise{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
  @keyframes tomSheet{from{transform:translateY(60px)}to{transform:none}}
  @media (prefers-reduced-motion: reduce){.tom *, .tom{animation:none!important;transition:none!important;}}
  `;

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function pressed(container, attr, val) {
    container.querySelectorAll(`[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));
  }

  function build() {
    if (document.getElementById('tagOrderModal')) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const m = el(`
    <div class="tom" id="tagOrderModal" role="dialog" aria-modal="true" aria-labelledby="tomTitle">
      <div class="tom-card">
        <div class="tom-head"><div><h3 id="tomTitle">Order LPG</h3><p>Skip the queue: order now, pay at the cashier, fill at the pump.</p></div>
          <button class="tom-x" type="button" aria-label="Close" data-close>${IC.x}</button></div>
        <div class="tom-steps" aria-hidden="true"><span class="on">1 · Order</span><span>2 · Pay cashier</span><span>3 · Scan &amp; fill</span></div>
        <form id="tomForm" novalidate style="display:contents;">
          <div class="tom-body">
            <div class="tom-sec"><span class="tom-l">Station</span><div class="tom-grid tom-g5" id="tomOutlets"></div></div>

            <div class="tom-sec"><span class="tom-l">What do you need?</span>
              <div class="tom-grid tom-g3" id="tomType">
                <button type="button" class="tom-opt" data-type="refill">${IC.refill}Refill<small>Your cylinder</small></button>
                <button type="button" class="tom-opt" data-type="exchange">${IC.exchange}Exchange<small>Swap for full</small></button>
                <button type="button" class="tom-opt" data-type="autogas">${IC.autogas}Vehicle<small>Autogas</small></button>
              </div></div>

            <div id="tomRefill">
              <div class="tom-sec"><span class="tom-l">Buy by</span>
                <div class="tom-seg" id="tomMode"><button type="button" data-mode="size">Full cylinder</button><button type="button" data-mode="amount">Amount (GH₵)</button><button type="button" data-mode="kg">Kilograms</button></div></div>
              <div class="tom-sec" id="tomSizeBox"><span class="tom-l">Cylinder size</span><div class="tom-grid tom-g4" id="tomSizes"></div></div>
              <div class="tom-sec" id="tomAmountBox"><span class="tom-l">How much?</span>
                <div class="tom-grid tom-g5" id="tomAmountChips" style="margin-bottom:8px;"></div>
                <label class="tom-unit"><b>GH₵</b><input type="number" id="tomAmount" min="1" step="1" inputmode="decimal" aria-label="Amount in cedis"></label></div>
              <div class="tom-sec" id="tomKgBox"><span class="tom-l">How many kilograms?</span>
                <label class="tom-unit kg"><input type="number" id="tomKg" min="0.5" step="0.5" inputmode="decimal" aria-label="Kilograms"><b>kg</b></label></div>
            </div>

            <div id="tomExchange">
              <div class="tom-sec"><span class="tom-l">Cylinder size</span><div class="tom-grid tom-g4" id="tomExSizes"></div></div>
              <div class="tom-sec"><span class="tom-l">How many cylinders?</span><div class="tom-seg" id="tomQty">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-qty="${n}">${n}</button>`).join('')}</div>
                <label class="tom-check"><input type="checkbox" id="tomNewCyl"> I don't have an empty cylinder (buy a new one)</label></div>
            </div>

            <div class="tom-sec tom-row">
              <label><span class="tom-l">Your name</span><input type="text" id="tomName" autocomplete="name" maxlength="60" placeholder="Ama Mensah"></label>
              <label><span class="tom-l">Phone</span><input type="tel" id="tomPhone" autocomplete="tel" inputmode="tel" placeholder="024 123 4567"></label>
            </div>

            <div class="tom-sec"><span class="tom-l">I'll pay with</span>
              <div class="tom-grid tom-g2" id="tomPay">
                <button type="button" class="tom-opt" data-pay="cash" style="display:flex;align-items:center;justify-content:center;gap:8px;">${IC.cash.replace('display:block', '')}Cash</button>
                <button type="button" class="tom-opt" data-pay="momo" style="display:flex;align-items:center;justify-content:center;gap:8px;">${IC.momo}Mobile Money</button>
              </div></div>
          </div>
          <div class="tom-foot">
            <div class="tom-sum"><span id="tomSummary"></span><b id="tomTotal">GH₵ 0.00</b></div>
            <button class="tom-go" type="submit" id="tomGo">Get my order code ${IC.arrow}</button>
            <div class="tom-err" id="tomErr" role="alert"></div>
            <p class="tom-fine" id="tomFine">Priced per kg. Filled by weight on a certified scale.</p>
          </div>
        </form>
      </div>
    </div>`);
    document.body.appendChild(m);
    m.querySelectorAll('#tomPay svg').forEach(s => { s.style.margin = '0'; });

    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.classList.contains('open')) close(); });
    const on = (sel, attr, fn) => m.querySelector(sel).addEventListener('click', e => { const b = e.target.closest(`[data-${attr}]`); if (b && !b.disabled) { fn(b.dataset[attr]); render(); } });
    on('#tomType', 'type', v => { state.type = v; if (v === 'autogas' && state.mode === 'size') state.mode = 'amount'; });
    on('#tomMode', 'mode', v => { state.mode = v; });
    on('#tomPay', 'pay', v => { state.payPref = v; });
    on('#tomOutlets', 'outlet', v => { state.outlet = v; });
    on('#tomSizes', 'size', v => { state.size = v; });
    on('#tomExSizes', 'size', v => { state.size = v; });
    on('#tomQty', 'qty', v => { state.qty = +v; });
    on('#tomAmountChips', 'amt', v => { state.amount = +v; m.querySelector('#tomAmount').value = state.amount; });
    m.querySelector('#tomAmount').addEventListener('input', e => { state.amount = parseFloat(e.target.value) || 0; render(false); });
    m.querySelector('#tomKg').addEventListener('input', e => { state.kg = parseFloat(e.target.value) || 0; render(false); });
    m.querySelector('#tomNewCyl').addEventListener('change', e => { state.withCylinder = e.target.checked; render(false); });
    m.querySelector('#tomForm').addEventListener('submit', submit);
    try {
      const saved = JSON.parse(localStorage.getItem('tag_customer') || '{}');
      if (saved.name) m.querySelector('#tomName').value = saved.name;
      if (saved.phone) m.querySelector('#tomPhone').value = saved.phone;
      if (saved.outlet) state.outlet = saved.outlet;
      if (saved.payPref) state.payPref = saved.payPref;
    } catch (e) {}
  }

  function stationInfo(id) {
    const s = stations[id];
    if (!s) return { open: true, cls: '', label: '' };
    if (s.open === false) return { open: false, cls: 'off', label: 'Closed' };
    if (s.status === 'limited') return { open: true, cls: 'lim', label: 'Limited' };
    return { open: true, cls: '', label: s.hours || 'Open' };
  }

  function render(full = true) {
    const m = document.getElementById('tagOrderModal');
    const p = pricing;
    if (full) {
      m.querySelector('#tomOutlets').innerHTML = T.OUTLETS.map(o => {
        const i = stationInfo(o.id);
        return `<button type="button" class="tom-opt" data-outlet="${o.id}" ${i.open ? '' : 'disabled'}>${T.esc(o.name)}<small><span class="dot ${i.cls}"></span>${i.open ? (i.cls ? 'Limited' : 'Open') : 'Closed'}</small></button>`;
      }).join('');
      const money0 = n => 'GH₵ ' + Number(n).toFixed(2);
      m.querySelector('#tomSizes').innerHTML = T.SIZES.map(s => `<button type="button" class="tom-opt" data-size="${s}">${s}<small>${money0(parseFloat(s) * p.perKg)}</small></button>`).join('');
      m.querySelector('#tomExSizes').innerHTML = T.SIZES.map(s => `<button type="button" class="tom-opt" data-size="${s}">${s}<small>${money0(p.exchange[s])}</small></button>`).join('');
      m.querySelector('#tomAmountChips').innerHTML = [50, 100, 150, 200, 300].map(a => `<button type="button" class="tom-opt" data-amt="${a}">${a}</button>`).join('');
      m.querySelector('#tomAmount').value = state.amount;
      m.querySelector('#tomKg').value = state.kg;
      m.querySelector('#tomFine').textContent = `${T.money(p.perKg)}/kg${p.live ? '' : ' (indicative)'} · filled by weight on a certified scale.`;
    }
    pressed(m.querySelector('#tomType'), 'type', state.type);
    pressed(m.querySelector('#tomMode'), 'mode', state.mode);
    pressed(m.querySelector('#tomPay'), 'pay', state.payPref);
    pressed(m.querySelector('#tomOutlets'), 'outlet', state.outlet);
    pressed(m.querySelector('#tomSizes'), 'size', state.size);
    pressed(m.querySelector('#tomExSizes'), 'size', state.size);
    pressed(m.querySelector('#tomQty'), 'qty', state.qty);
    pressed(m.querySelector('#tomAmountChips'), 'amt', state.amount);

    const isEx = state.type === 'exchange';
    m.querySelector('#tomRefill').style.display = isEx ? 'none' : '';
    m.querySelector('#tomExchange').style.display = isEx ? '' : 'none';
    m.querySelector('#tomMode [data-mode=size]').disabled = state.type === 'autogas';
    m.querySelector('#tomSizeBox').style.display = state.mode === 'size' ? '' : 'none';
    m.querySelector('#tomAmountBox').style.display = state.mode === 'amount' ? '' : 'none';
    m.querySelector('#tomKgBox').style.display = state.mode === 'kg' ? '' : 'none';

    const q = T.quote(state, pricing);
    m.querySelector('#tomTotal').textContent = T.money(q.amount);
    m.querySelector('#tomSummary').textContent = isEx
      ? `${q.qty} × ${q.size}${q.withCylinder ? ' + new cylinder' : ''}`
      : `${q.kg} kg ${state.type === 'autogas' ? 'autogas' : 'LPG'}`;
  }

  function validate() {
    const m = document.getElementById('tagOrderModal');
    const q = T.quote(state, pricing);
    if (!state.outlet) return 'Choose a station.';
    if (!stationInfo(state.outlet).open) return 'That station is closed right now. Please choose another.';
    if (state.type !== 'exchange' && state.mode === 'amount' && q.amount < (pricing.minAmount || 1)) return `The minimum order is ${T.money(pricing.minAmount || 1)}.`;
    if (state.type !== 'exchange' && q.kg < 0.5) return 'Enter at least 0.5 kg.';
    if (state.type !== 'exchange' && q.kg > (state.type === 'autogas' ? 300 : 1000)) return 'For large quantities please request bulk supply on the contact page.';
    if (!T.validPhone(m.querySelector('#tomPhone').value)) return 'Enter a valid Ghana phone number, e.g. 024 123 4567.';
    return '';
  }

  async function submit(e) {
    e.preventDefault();
    const m = document.getElementById('tagOrderModal');
    const errEl = m.querySelector('#tomErr');
    const btn = m.querySelector('#tomGo');
    errEl.textContent = '';
    const problem = validate();
    if (problem) {
      errEl.textContent = problem;
      if (!state.outlet) m.querySelector('#tomOutlets').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    btn.disabled = true; btn.textContent = 'Creating your order…';
    const name = m.querySelector('#tomName').value.trim();
    const phone = m.querySelector('#tomPhone').value;
    try { localStorage.setItem('tag_customer', JSON.stringify({ name, phone, outlet: state.outlet, payPref: state.payPref })); } catch (err) {}
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
      btn.disabled = false; btn.innerHTML = `Get my order code ${IC.arrow}`;
    }
  }

  async function loadLive() {
    if (liveLoaded) return;
    pricing = await T.loadPricing();
    try {
      const { db } = T.init();
      const snap = await db.collection('stations').get();
      snap.forEach(d => { stations[d.id] = d.data(); });
    } catch (e) { /* stations optional */ }
    liveLoaded = true;
    if (document.getElementById('tagOrderModal')?.classList.contains('open')) render();
  }

  function open(prefill) {
    build();
    if (prefill && prefill.outlet) state.outlet = prefill.outlet;
    if (prefill && prefill.type) state.type = prefill.type;
    if (prefill && prefill.size && T.SIZES.includes(prefill.size)) { state.size = prefill.size; if (state.type !== 'exchange') state.mode = 'size'; }
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
