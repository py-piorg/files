/* ==========================================================================
   TRIPLE A GAS — Staff portal core
   Auth, roles, navigation and shared helpers. Views live in
   js/admin-ops.js (selling) and js/admin-manage.js (running the business).
   Real permissions are enforced by firestore.rules; the UI only mirrors them.
   ========================================================================== */
(function () {
  const T = window.TAG;
  const { db, auth } = T.init();
  const FV = firebase.firestore.FieldValue;
  const EMAIL_DOMAIN = 'staff.tripleagas.com';

  const ROLES = {
    owner: 'Owner / Head Office', coo: 'COO', manager: 'Station Manager', cashier: 'Cashier',
    attendant: 'Pump Attendant', driver: 'Driver', secretary: 'Secretary'
  };
  const ALL = Object.keys(ROLES);
  const HQ = ['owner', 'coo'];
  const NAV = [
    ['Operations', [
      ['dashboard', '📊', 'Dashboard', ['owner', 'coo', 'manager']],
      ['cashier', '💵', 'Cashier', ['owner', 'coo', 'manager', 'cashier']],
      ['pump', '⛽', 'Pump / Scan', ['owner', 'coo', 'manager', 'attendant']],
      ['orders', '🧾', 'Orders', ['owner', 'coo', 'manager', 'cashier', 'secretary']],
      ['cashup', '🔒', 'Cash-up', ['owner', 'coo', 'manager', 'cashier']],
      ['notes', '📝', 'Shift notes', ALL]
    ]],
    ['Station', [
      ['stock', '🛢️', 'Stock & tank', ['owner', 'coo', 'manager', 'attendant']],
      ['deliveries', '🚚', 'Deliveries', ['owner', 'coo', 'manager', 'driver']],
      ['safety', '🦺', 'Safety checks', ['owner', 'coo', 'manager', 'attendant']],
      ['expenses', '💸', 'Expenses', ['owner', 'coo', 'manager']]
    ]],
    ['Management', [
      ['reports', '📈', 'Reports', ['owner', 'coo', 'manager']],
      ['stations', '📍', 'Stations', ['owner', 'coo', 'manager']],
      ['pricing', '🏷️', 'Pricing', HQ],
      ['staff', '👥', 'Staff', ['owner', 'coo', 'manager']],
      ['payroll', '💼', 'Payroll', HQ],
      ['enquiries', '✉️', 'Enquiries', ['owner', 'coo', 'manager', 'secretary']],
      ['audit', '🛡️', 'Audit log', HQ]
    ]]
  ];
  const HOME = { owner: 'dashboard', coo: 'dashboard', manager: 'dashboard', cashier: 'cashier', attendant: 'pump', driver: 'deliveries', secretary: 'orders' };
  // Views that work on one station at a time.
  const SINGLE_STATION = ['cashier', 'pump', 'stock', 'cashup'];

  const A = window.ADMIN = {
    T, db, auth, FV, ROLES, HQ, ALL,
    user: null, me: null, outlet: 'all', pricing: T.DEFAULT_PRICING, stations: {},
    views: {}, unsubs: [], current: null
  };

  // ── small helpers ───────────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const esc = T.esc;
  A.$ = $;
  A.esc = esc;
  A.isHQ = () => !!A.me && HQ.includes(A.me.role);
  A.can = roles => !!A.me && roles.includes(A.me.role);
  A.canSee = view => {
    if (view === 'account') return !!A.me;
    for (const [, items] of NAV) for (const [id, , , roles] of items) if (id === view) return A.can(roles);
    return false;
  };
  A.outletsInScope = () => (A.isHQ() ? (A.outlet === 'all' ? T.OUTLETS.map(o => o.id) : [A.outlet]) : [A.me.outlet]);
  A.singleOutlet = () => (A.isHQ() ? (A.outlet === 'all' ? null : A.outlet) : A.me.outlet);

  A.toast = function (msg, tone = 'safe') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (tone === 'safe' ? '' : tone);
    clearTimeout(A._tt);
    A._tt = setTimeout(() => t.classList.remove('show'), 3200);
  };

  A.modal = function (html, opts = {}) {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal-card ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Close">×</button>${html}</div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); if (opts.onClose) opts.onClose(); };
    m.querySelector('.modal-x').onclick = close;
    m.addEventListener('mousedown', e => { if (e.target === m) close(); });
    return { el: m, close };
  };
  A.confirm = function (msg, okLabel = 'Confirm', danger = false) {
    return new Promise(res => {
      const { el, close } = A.modal(`<h2>${esc(msg)}</h2><div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(okLabel)}</button></div>`,
        { onClose: () => res(false) });
      el.querySelector('[data-no]').onclick = () => { close(); };
      el.querySelector('[data-yes]').onclick = () => { el.remove(); res(true); };
    });
  };
  A.prompt = function (title, label, value = '') {
    return new Promise(res => {
      const { el, close } = A.modal(`<h2>${esc(title)}</h2><form><div class="field"><label>${esc(label)}</label><input name="v" value="${esc(value)}" required></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;"><button type="button" class="btn" data-no>Cancel</button><button class="btn btn-primary">OK</button></div></form>`,
        { onClose: () => res(null) });
      el.querySelector('[data-no]').onclick = () => close();
      el.querySelector('form').onsubmit = e => { e.preventDefault(); const v = e.target.v.value.trim(); el.remove(); res(v); };
      setTimeout(() => el.querySelector('input').focus(), 30);
    });
  };

  A.fmtTime = ts => { const d = T.toDate(ts); return d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'; };
  A.fmtDateTime = ts => { const d = T.toDate(ts); return d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; };
  A.fmtDay = s => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
  A.daysBack = n => { const out = []; for (let i = n - 1; i >= 0; i--) out.push(T.dayStr(new Date(Date.now() - i * 864e5))); return out; };
  A.daysBetween = (from, to) => {
    const out = []; let d = new Date(from + 'T00:00:00Z'); const end = new Date(to + 'T00:00:00Z');
    while (d <= end && out.length < 93) { out.push(T.dayStr(d)); d = new Date(d.getTime() + 864e5); }
    return out;
  };
  A.statusBadge = o => { const s = T.effectiveStatus(o); const i = T.STATUS[s] || { label: s, tone: 'neutral' }; return `<span class="badge ${i.tone}">${esc(i.label)}</span>`; };
  A.outletOptions = (sel, includeAll) =>
    (includeAll ? `<option value="all" ${sel === 'all' ? 'selected' : ''}>All stations</option>` : '') +
    T.OUTLETS.map(o => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
  A.formData = form => Object.fromEntries(new FormData(form).entries());
  A.csv = (filename, rows) => {
    if (!rows.length) { A.toast('Nothing to export', 'warn'); return; }
    const keys = Object.keys(rows[0]);
    const text = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] == null ? '' : r[k])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = filename; a.click();
  };
  A.err = (e, fallback) => {
    console.error(e);
    const msg = e && e.code === 'permission-denied' ? 'You do not have permission to do that.'
      : e && e.code === 'unavailable' ? 'No connection. Check the internet and try again.'
      : (fallback || 'Something went wrong. Please try again.');
    A.toast(msg, 'danger');
  };

  A.audit = function (action, target, detail) {
    return db.collection('audit').add({
      action, target: String(target || ''), detail: String(detail || ''),
      by: A.user.uid, byName: A.me.name, role: A.me.role, outlet: A.me.outlet, at: FV.serverTimestamp()
    }).catch(e => console.warn('audit failed', e));
  };

  A.listen = function (query, onData, onError) {
    const unsub = query.onSnapshot(onData, e => { console.error(e); if (onError) onError(e); });
    A.unsubs.push(unsub);
    return unsub;
  };

  /** Orders for the given stations and days, using equality-only queries (no custom indexes needed). */
  A.fetchOrders = async function (outlets, days) {
    const all = outlets.length === T.OUTLETS.length && A.isHQ();
    const jobs = [];
    for (const d of days) {
      if (all) jobs.push(db.collection('orders').where('day', '==', d).get());
      else for (const o of outlets) jobs.push(db.collection('orders').where('outlet', '==', o).where('day', '==', d).get());
    }
    const snaps = await Promise.all(jobs);
    const out = [];
    snaps.forEach(s => s.forEach(doc => out.push({ id: doc.id, ...doc.data() })));
    return out.sort((a, b) => (T.toDate(b.createdAt) || 0) - (T.toDate(a.createdAt) || 0));
  };
  A.fetchOps = async function (col, outlets, days) {
    const all = outlets.length === T.OUTLETS.length && A.isHQ();
    const jobs = [];
    for (const d of days) {
      if (all) jobs.push(db.collection(col).where('day', '==', d).get());
      else for (const o of outlets) jobs.push(db.collection(col).where('outlet', '==', o).where('day', '==', d).get());
    }
    const snaps = await Promise.all(jobs);
    const out = [];
    snaps.forEach(s => s.forEach(doc => out.push({ id: doc.id, ...doc.data() })));
    return out.sort((a, b) => (T.toDate(b.at) || 0) - (T.toDate(a.at) || 0));
  };
  A.addOps = function (col, data) {
    return db.collection(col).add({ ...data, day: T.dayStr(), by: A.user.uid, byName: A.me.name, at: FV.serverTimestamp() });
  };

  /** Print a customer slip (thermal receipt friendly) with the QR code. */
  A.printSlip = function (order) {
    const p = $('#printArea');
    p.innerHTML = `<h4>TRIPLE A GAS</h4><p>${esc(T.outletName(order.outlet))} station</p>
      ${order.status === 'paid' && order.qrToken ? `<div class="pq" id="pq"></div>` : ''}
      <div class="pc">${esc(order.code)}</div>
      <div class="pr"><span>${esc(T.describe(order))}</span></div>
      <div class="pr"><span>Total</span><b>${T.money(order.amount)}</b></div>
      <div class="pr"><span>Paid</span><span>${esc((order.payMethod || '').toUpperCase())} ${A.fmtDateTime(order.paidAt || new Date())}</span></div>
      <div class="pr"><span>Cashier</span><span>${esc(order.paidByName || A.me.name)}</span></div>
      <p>Show this slip at the pump.</p><p style="font-size:10px;">Ref ${esc((order.id || '').slice(0, 8).toUpperCase())}</p>`;
    if (order.status === 'paid' && order.qrToken) T.renderQR($('#pq'), T.qrPayload(order.id, order.qrToken), 4);
    setTimeout(() => window.print(), 50);
  };

  // ── auth screens ────────────────────────────────────────────────────────
  const authBody = () => $('#authBody');
  const toEmail = u => `${String(u).trim().toLowerCase()}@${EMAIL_DOMAIN}`;

  function authError(e) {
    const c = e && e.code;
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/invalid-login-credentials'].includes(c)) return 'Wrong username or password.';
    if (c === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
    if (c === 'auth/network-request-failed') return 'No internet connection.';
    if (c === 'auth/weak-password') return 'Password must be at least 8 characters.';
    if (c === 'auth/email-already-in-use') return 'That username is already taken.';
    if (c === 'auth/configuration-not-found' || c === 'auth/operation-not-allowed') return 'SETUP';
    console.error(e);
    return 'Could not sign in. Please try again.';
  }
  const SETUP_HELP = `<div class="note danger" style="margin-top:12px;">Staff sign-in is not switched on yet. In the
    <a href="https://console.firebase.google.com/project/triple-a-gas/authentication/providers" target="_blank" rel="noopener">Firebase console</a>
    open <b>Authentication → Sign-in method</b>, enable <b>Email/Password</b>, then reload this page.</div>`;

  function showLogin(msg) {
    authBody().innerHTML = `
      <h2>Sign in</h2><p class="sub">Use the username and password your manager gave you.</p>
      <form id="loginForm" autocomplete="on">
        <div class="field"><label for="lu">Username</label><input id="lu" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
        <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn btn-primary btn-block" id="loginGo">Sign in</button>
        <div class="err" id="loginErr">${msg ? esc(msg) : ''}</div>
      </form>
      <p class="sub" style="margin-top:14px;text-align:center;">Forgot your password? Ask the owner to reset your account.</p>`;
    $('#loginForm').onsubmit = async e => {
      e.preventDefault();
      const f = A.formData(e.target);
      $('#loginGo').disabled = true; $('#loginErr').textContent = '';
      try {
        await auth.signInWithEmailAndPassword(toEmail(f.username), f.password);
      } catch (err) {
        const m = authError(err);
        if (m === 'SETUP') $('#loginErr').innerHTML = SETUP_HELP; else $('#loginErr').textContent = m;
        $('#loginGo').disabled = false;
      }
    };
  }

  function showSetup() {
    authBody().innerHTML = `
      <h2>First-time setup</h2><p class="sub">Create the owner account. This can only be done once; after that the owner adds every other staff member.</p>
      <form id="setupForm">
        <div class="field"><label>Your full name</label><input name="name" required maxlength="60"></div>
        <div class="field"><label>Username</label><input name="username" required pattern="[a-z0-9._-]{3,30}" autocapitalize="none" placeholder="e.g. kofi.owner"></div>
        <div class="field"><label>Password (8+ characters)</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
        <button class="btn btn-primary btn-block" id="setupGo">Create owner account</button>
        <div class="err" id="setupErr"></div>
      </form>`;
    $('#setupForm').onsubmit = async e => {
      e.preventDefault();
      const f = A.formData(e.target);
      const username = f.username.trim().toLowerCase();
      $('#setupGo').disabled = true; $('#setupErr').textContent = '';
      try {
        A.settingUp = true;
        const cred = await auth.createUserWithEmailAndPassword(toEmail(username), f.password);
        const uid = cred.user.uid;
        const b = db.batch();
        b.set(db.collection('staff').doc(uid), { name: f.name.trim(), username, role: 'owner', outlet: 'accra', phone: '', active: true, createdAt: FV.serverTimestamp(), createdBy: uid });
        b.set(db.collection('settings').doc('bootstrap'), { ownerUid: uid, at: FV.serverTimestamp() });
        await b.commit();
        A.settingUp = false;
        await startApp(cred.user);
      } catch (err) {
        A.settingUp = false;
        const m = authError(err);
        if (m === 'SETUP') $('#setupErr').innerHTML = SETUP_HELP;
        else $('#setupErr').textContent = err.code === 'permission-denied' ? 'Setup was already completed. Please sign in.' : m;
        $('#setupGo').disabled = false;
      }
    };
  }

  async function showAuth(msg) {
    $('#app').classList.add('hidden');
    $('#authScreen').classList.remove('hidden');
    try {
      const b = await db.collection('settings').doc('bootstrap').get();
      if (b.exists) showLogin(msg); else showSetup();
    } catch (e) {
      showLogin(msg);
    }
  }

  // Creates the station, stock and pricing documents the first time HQ signs in.
  async function ensureSeed() {
    if (!A.isHQ()) return;
    try {
      const pr = await db.collection('settings').doc('pricing').get();
      if (!pr.exists || typeof pr.data().perKg !== 'number') {
        const p = T.normalizePricing(pr.exists ? pr.data() : null);
        await db.collection('settings').doc('pricing').set({
          perKg: p.perKg, autogasPerKg: p.autogasPerKg, minAmount: p.minAmount, exchange: p.exchange, deposit: p.deposit,
          ...T.legacyPricingFields(p), updatedAt: FV.serverTimestamp(), updatedBy: A.me.name
        }, { merge: true });
      }
      const zero = Object.fromEntries(T.SIZES.map(s => [s, 0]));
      for (const o of T.OUTLETS) {
        const [st, sk] = await Promise.all([db.collection('stations').doc(o.id).get(), db.collection('stock').doc(o.id).get()]);
        if (!st.exists && A.me.role === 'owner') await db.collection('stations').doc(o.id).set({ name: o.name, open: true, status: 'open', hours: '6:00am – 8:00pm', momoNumber: '', momoName: '', note: '' });
        if (!sk.exists) await db.collection('stock').doc(o.id).set({ stockKg: 0, capacityKg: 20000, lowStockKg: 3000, cylFull: zero, cylEmpty: zero, lowCyl: 5, updatedAt: FV.serverTimestamp() });
      }
    } catch (e) { console.warn('seed failed', e); }
  }

  async function loadShared() {
    A.pricing = await T.loadPricing();
    try {
      const snap = await db.collection('stations').get();
      snap.forEach(d => { A.stations[d.id] = d.data(); });
    } catch (e) { /* optional */ }
  }

  async function startApp(user) {
    let snap;
    try { snap = await db.collection('staff').doc(user.uid).get(); }
    catch (e) { await auth.signOut(); return showAuth('Could not load your account. Check your connection.'); }
    if (!snap.exists || snap.data().active !== true) {
      await auth.signOut();
      return showAuth('Your account is not active. Ask the owner to enable it.');
    }
    A.user = user;
    A.me = snap.data();
    A.outlet = A.isHQ() ? (sessionStorage.getItem('tag_outlet') || 'all') : A.me.outlet;
    await ensureSeed();
    await loadShared();

    $('#authScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#meName').textContent = A.me.name;
    $('#meRole').textContent = `${ROLES[A.me.role]} · ${A.isHQ() ? 'All stations' : T.outletName(A.me.outlet)}`;
    buildNav();
    const sel = $('#outletSelect');
    if (A.isHQ()) {
      sel.classList.remove('hidden');
      sel.innerHTML = A.outletOptions(A.outlet, true);
      sel.onchange = () => { A.outlet = sel.value; sessionStorage.setItem('tag_outlet', A.outlet); show(A.current); };
    } else sel.classList.add('hidden');
    const want = (location.hash || '').slice(1);
    show(A.canSee(want) ? want : HOME[A.me.role]);
  }

  // ── navigation ──────────────────────────────────────────────────────────
  function buildNav() {
    $('#nav').innerHTML = NAV.map(([group, items]) => {
      const visible = items.filter(([, , , roles]) => A.can(roles));
      if (!visible.length) return '';
      return `<div class="nav-group">${group}</div>` + visible.map(([id, ico, label]) =>
        `<button data-view="${id}"><span class="ico">${ico}</span>${label}<span class="count hidden" data-count="${id}"></span></button>`).join('');
    }).join('');
  }
  A.setCount = (view, n) => { const c = document.querySelector(`[data-count="${view}"]`); if (c) { c.textContent = n; c.classList.toggle('hidden', !n); } };

  function titleOf(view) {
    if (view === 'account') return 'My account';
    for (const [, items] of NAV) for (const [id, , label] of items) if (id === view) return label;
    return '';
  }

  function show(view) {
    if (!A.canSee(view)) view = HOME[A.me.role];
    A.unsubs.forEach(u => { try { u(); } catch (e) {} });
    A.unsubs = [];
    if (A.stopCamera) A.stopCamera();
    A.current = view;
    history.replaceState(null, '', '#' + view);
    document.querySelectorAll('#nav button, .side-foot [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#viewTitle').textContent = titleOf(view);
    $('#side').classList.remove('open'); $('#overlay').classList.remove('open');
    const el = $('#view');
    if (SINGLE_STATION.includes(view) && !A.singleOutlet()) {
      el.innerHTML = `<div class="panel"><h3>Choose a station</h3><p style="color:var(--muted);margin-bottom:12px;">${esc(titleOf(view))} works on one station at a time.</p>
        <div class="chips">${T.OUTLETS.map(o => `<button class="chip" data-pick="${o.id}">${esc(o.name)}</button>`).join('')}</div></div>`;
      el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
        A.outlet = b.dataset.pick; sessionStorage.setItem('tag_outlet', A.outlet);
        $('#outletSelect').value = A.outlet; show(view);
      });
      return;
    }
    const v = A.views[view];
    el.innerHTML = '<div class="empty">Loading…</div>';
    Promise.resolve(v ? v(el) : (el.innerHTML = '<div class="empty">Coming soon</div>')).catch(e => {
      console.error(e);
      el.innerHTML = `<div class="note danger">This page could not load${e && e.code === 'permission-denied' ? ': your role does not have access.' : '. Check your connection and try again.'}</div>`;
    });
  }
  A.show = show;
  A.refresh = () => show(A.current);

  // ── account view (everyone) ─────────────────────────────────────────────
  A.views.account = function (el) {
    el.innerHTML = `<div class="panel" style="max-width:520px;"><h3>My account</h3>
      <dl class="kv" style="margin-bottom:16px;"><dt>Name</dt><dd>${esc(A.me.name)}</dd><dt>Username</dt><dd class="mono">${esc(A.me.username)}</dd>
      <dt>Role</dt><dd>${esc(ROLES[A.me.role])}</dd><dt>Station</dt><dd>${A.isHQ() ? 'All stations' : esc(T.outletName(A.me.outlet))}</dd></dl>
      <form id="pwForm"><h3>Change password</h3>
        <div class="field"><label>Current password</label><input type="password" name="old" required autocomplete="current-password"></div>
        <div class="field"><label>New password (8+ characters)</label><input type="password" name="pw" minlength="8" required autocomplete="new-password"></div>
        <button class="btn btn-primary">Update password</button></form></div>`;
    $('#pwForm').onsubmit = async e => {
      e.preventDefault();
      const f = A.formData(e.target);
      try {
        const cred = firebase.auth.EmailAuthProvider.credential(A.user.email, f.old);
        await A.user.reauthenticateWithCredential(cred);
        await A.user.updatePassword(f.pw);
        e.target.reset();
        A.toast('Password updated');
        A.audit('password changed', A.me.username, '');
      } catch (err) { A.toast(authError(err) === 'Wrong username or password.' ? 'Current password is wrong' : authError(err), 'danger'); }
    };
  };

  // ── boot ────────────────────────────────────────────────────────────────
  function wireShell() {
    $('#menuBtn').onclick = () => { $('#side').classList.add('open'); $('#overlay').classList.add('open'); };
    $('#overlay').onclick = () => { $('#side').classList.remove('open'); $('#overlay').classList.remove('open'); };
    document.addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b && A.me) show(b.dataset.view); });
    $('#logoutBtn').onclick = async () => { if (await A.confirm('Sign out?', 'Sign out')) { A.unsubs.forEach(u => u()); A.unsubs = []; await auth.signOut(); } };
    const conn = () => $('#conn').classList.toggle('off', !navigator.onLine);
    window.addEventListener('online', conn); window.addEventListener('offline', conn); conn();
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireShell();
    if (T.useEmulator()) document.title = '[EMULATOR] ' + document.title;
    auth.onAuthStateChanged(user => {
      if (A.settingUp) return;
      if (user) startApp(user); else { A.user = null; A.me = null; showAuth(); }
    });
  });
})();
