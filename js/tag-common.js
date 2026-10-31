/* ==========================================================================
   TRIPLE A GAS — shared order & pricing logic
   Used by the public order form (index.html), the customer order page
   (order.html) and the staff portal (admin.html).
   Requires firebase-app-compat + firebase-firestore-compat (+ auth on admin).
   ========================================================================== */
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAvkq7YEuJtD7IlsdcBE8hh9OX380YgeUg",
    authDomain: "triple-a-gas.firebaseapp.com",
    projectId: "triple-a-gas",
    storageBucket: "triple-a-gas.firebasestorage.app",
    messagingSenderId: "533855152730",
    appId: "1:533855152730:web:8f92468605c6e25a458663"
  };

  // `site` is the station id used by js/company-info.js on the public pages.
  const OUTLETS = [
    { id: 'accra',   name: 'Agbogba', label: 'Agbogba (Accra head office)', site: 1 },
    { id: 'klagon',  name: 'Klagon',  label: 'Klagon',  site: 2 },
    { id: 'apam',    name: 'Apam',    label: 'Apam',    site: 3 },
    { id: 'antoa',   name: 'Antoa',   label: 'Antoa',   site: 4 },
    { id: 'bonwire', name: 'Bonwire', label: 'Bonwire', site: 5 },
    { id: 'bogoso',  name: 'Bogoso',  label: 'Bogoso',  site: 6 },
    { id: 'prestea', name: 'Prestea', label: 'Prestea', site: 7 }
  ];
  const SIZES = ['3kg', '6kg', '12.5kg', '14.5kg'];

  // Used until the owner publishes prices from the portal.
  const DEFAULT_PRICING = {
    perKg: 14.5,
    autogasPerKg: 9,
    minAmount: 10,
    exchange: { '3kg': 43.5, '6kg': 87, '12.5kg': 181.25, '14.5kg': 210.25 },
    deposit:  { '3kg': 150, '6kg': 250, '12.5kg': 450, '14.5kg': 500 }
  };

  const STATUS = {
    pending:   { label: 'Awaiting payment', tone: 'warn' },
    paid:      { label: 'Paid — ready to fill', tone: 'gold' },
    fulfilled: { label: 'Filled', tone: 'safe' },
    cancelled: { label: 'Cancelled', tone: 'neutral' },
    refunded:  { label: 'Refunded', tone: 'danger' },
    expired:   { label: 'Expired', tone: 'neutral' }
  };

  const ORDER_TTL_MS = 12 * 60 * 60 * 1000;

  // ── Firebase ────────────────────────────────────────────────────────────
  let db = null, auth = null;
  function useEmulator() {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!local) return false;
    const q = new URLSearchParams(location.search).get('emu');
    try {
      if (q === '1') localStorage.setItem('tag_emu', '1');
      if (q === '0') localStorage.removeItem('tag_emu');
      return localStorage.getItem('tag_emu') === '1';
    } catch (e) { return q === '1'; }
  }
  function init() {
    if (db) return { db, auth };
    if (typeof firebase === 'undefined') throw new Error('Firebase SDK not loaded');
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    db = app.firestore();
    const emu = useEmulator();
    if (emu) db.useEmulator(location.hostname, 8080);
    if (firebase.auth) {
      auth = app.auth();
      if (emu) auth.useEmulator(`http://${location.hostname}:9099`);
    }
    return { db, auth };
  }
  // A second app instance lets the owner create staff logins without being
  // signed out of their own session.
  function secondaryAuth() {
    const existing = firebase.apps.find(a => a.name === 'staff-creator');
    const app = existing || firebase.initializeApp(firebaseConfig, 'staff-creator');
    const a = app.auth();
    if (!existing && useEmulator()) a.useEmulator(`http://${location.hostname}:9099`);
    return a;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const money = n => 'GH₵ ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dayStr = (d = new Date()) => d.toISOString().slice(0, 10); // Ghana is UTC+0
  const outletName = id => (OUTLETS.find(o => o.id === id) || { name: id }).name;
  function randomString(len, alphabet) {
    const a = alphabet || 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint32Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => a[b % a.length]).join('');
  }
  const genCode = () => randomString(4, '0123456789');
  const genToken = () => randomString(16);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toDate(ts) {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    return new Date(ts);
  }
  function normalizePhone(p) {
    let s = String(p || '').replace(/[^\d+]/g, '');
    if (s.startsWith('+233')) s = '0' + s.slice(4);
    else if (s.startsWith('233') && s.length === 12) s = '0' + s.slice(3);
    return s;
  }
  const validPhone = p => /^0\d{9}$/.test(normalizePhone(p));

  // ── Pricing ─────────────────────────────────────────────────────────────
  function normalizePricing(raw) {
    const p = JSON.parse(JSON.stringify(DEFAULT_PRICING));
    if (!raw) return p;
    if (typeof raw.perKg === 'number') {
      Object.assign(p, raw, {
        exchange: { ...p.exchange, ...(raw.exchange || {}) },
        deposit: { ...p.deposit, ...(raw.deposit || {}) }
      });
    } else {
      // Legacy flat price document
      if (typeof raw.bulk_per_kg === 'number') p.perKg = raw.bulk_per_kg;
      if (typeof raw.autogas === 'number') p.autogasPerKg = raw.autogas;
      SIZES.forEach(s => { if (typeof raw[s] === 'number') p.exchange[s] = raw[s]; });
    }
    p.updatedAt = raw.updatedAt || null;
    p.live = true;
    return p;
  }
  async function loadPricing() {
    try {
      const { db } = init();
      const snap = await db.collection('settings').doc('pricing').get();
      return normalizePricing(snap.exists ? snap.data() : null);
    } catch (e) {
      console.warn('Pricing unavailable, using defaults', e);
      return normalizePricing(null);
    }
  }
  // Fields written alongside the new structure so older pages keep working.
  function legacyPricingFields(p) {
    const out = { bulk_per_kg: p.perKg, autogas: p.autogasPerKg };
    SIZES.forEach(s => { out[s] = p.exchange[s]; });
    return out;
  }

  /**
   * Work out kg / amount for an order request.
   *   { type:'refill'|'autogas', mode:'kg'|'amount'|'size', kg, amount, size }
   *   { type:'exchange', size, qty, withCylinder }
   */
  function quote(req, pricing) {
    const p = pricing || DEFAULT_PRICING;
    if (req.type === 'exchange') {
      const qty = Math.max(1, Math.min(5, parseInt(req.qty, 10) || 1));
      const gas = p.exchange[req.size] || 0;
      const dep = req.withCylinder ? (p.deposit[req.size] || 0) : 0;
      return { type: 'exchange', size: req.size, qty, withCylinder: !!req.withCylinder, kg: parseFloat(req.size) * qty,
               unitPrice: gas, amount: round2(qty * (gas + dep)) };
    }
    const rate = req.type === 'autogas' ? p.autogasPerKg : p.perKg;
    let kg, amount;
    if (req.mode === 'amount') {
      // Customer pays exactly what they asked for; the kg follows from it.
      amount = round2(req.amount);
      kg = Math.round((amount / rate) * 1000) / 1000;
    } else {
      kg = round2(req.mode === 'size' ? parseFloat(req.size) : req.kg);
      amount = round2(kg * rate);
    }
    return { type: req.type, mode: req.mode, size: req.mode === 'size' ? req.size : null, kg, unitPrice: rate, amount };
  }

  function describe(o) {
    if (!o) return '';
    if (o.type === 'exchange') return `${o.qty} × ${o.size} cylinder exchange${o.withCylinder ? ' (incl. new cylinder)' : ''}`;
    const what = o.type === 'autogas' ? 'Autogas (vehicle)' : 'LPG refill';
    if (o.mode === 'size' && o.size) return `${what} — fill ${o.size} cylinder (${o.kg} kg)`;
    return `${what} — ${o.kg} kg`;
  }

  function effectiveStatus(o) {
    if (o.status === 'pending') {
      const c = toDate(o.createdAt);
      if (c && Date.now() - c.getTime() > ORDER_TTL_MS) return 'expired';
    }
    return o.status;
  }

  // ── Orders ──────────────────────────────────────────────────────────────
  /**
   * Create an order with a station-unique 4-digit code.
   * Writes orders/{id} and orderCodes/{outlet_code} in one batch; the rules
   * reject the batch if that code is still held by a live order, so retry.
   */
  async function createOrder(fields, pricing) {
    const { db } = init();
    const q = quote(fields, pricing);
    const base = {
      outlet: fields.outlet,
      type: q.type,
      mode: q.type === 'exchange' ? 'size' : q.mode,
      kg: q.kg,
      size: q.size || null,
      amount: q.amount,
      unitPrice: q.unitPrice,
      customerName: String(fields.customerName || '').trim().slice(0, 60),
      phone: normalizePhone(fields.phone),
      payPref: fields.payPref === 'momo' ? 'momo' : 'cash',
      status: 'pending',
      day: dayStr(),
      source: fields.source || 'online',
      notes: String(fields.notes || '').slice(0, 200)
    };
    if (q.type === 'exchange') { base.qty = q.qty; base.withCylinder = q.withCylinder; }
    if (fields.createdBy) { base.createdBy = fields.createdBy; base.createdByName = fields.createdByName || ''; }

    let lastErr = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = genCode();
      const ref = db.collection('orders').doc();
      const codeRef = db.collection('orderCodes').doc(`${base.outlet}_${code}`);
      const batch = db.batch();
      batch.set(ref, { ...base, code, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      batch.set(codeRef, { orderId: ref.id, expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + ORDER_TTL_MS) });
      try {
        await batch.commit();
        return { id: ref.id, code, ...base };
      } catch (e) {
        lastErr = e;
        if (e.code !== 'permission-denied') break;
      }
    }
    throw lastErr || new Error('Could not create order');
  }

  // Customer's device remembers its orders so it can reopen them.
  const MY_ORDERS_KEY = 'tag_my_orders';
  function rememberOrder(o) {
    try {
      const list = JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || '[]').filter(x => x.id !== o.id);
      list.unshift({ id: o.id, code: o.code, outlet: o.outlet, amount: o.amount, at: Date.now() });
      localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(list.slice(0, 20)));
    } catch (e) {}
  }
  function myOrders() {
    try { return JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || '[]'); } catch (e) { return []; }
  }

  // ── QR ──────────────────────────────────────────────────────────────────
  const QR_PREFIX = 'TAG1';
  const qrPayload = (id, token) => `${QR_PREFIX}:${id}:${token}`;
  function parseQr(text) {
    const parts = String(text || '').trim().split(':');
    if (parts.length !== 3 || parts[0] !== QR_PREFIX) return null;
    return { id: parts[1], token: parts[2] };
  }
  function renderQR(el, text, cell) {
    if (typeof qrcode !== 'function') { el.textContent = text; return; }
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: cell || 6, margin: 2, scalable: true });
  }

  window.TAG = {
    OUTLETS, SIZES, DEFAULT_PRICING, STATUS, ORDER_TTL_MS,
    init, secondaryAuth, useEmulator,
    round2, money, dayStr, outletName, randomString, genCode, genToken, esc, toDate, normalizePhone, validPhone,
    normalizePricing, loadPricing, legacyPricingFields, quote, describe, effectiveStatus,
    createOrder, rememberOrder, myOrders,
    qrPayload, parseQr, renderQR
  };
})();
