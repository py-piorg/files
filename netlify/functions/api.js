/* Netlify Function: API proxy for admin dashboard to Firestore using firebase-admin
   Expects FIREBASE_SERVICE_ACCOUNT environment variable (JSON string).
   Routes mirrored from original server.js (/api/*).
*/

const adminLib = require('firebase-admin');
let firestore = null;

function initFirestore() {
  if (firestore) return firestore;
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is required');
  let credObj = null;
  try {
    credObj = typeof svc === 'string' ? JSON.parse(svc) : svc;
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid JSON');
  }

  if (!adminLib.apps.length) {
    adminLib.initializeApp({ credential: adminLib.credential.cert(credObj) });
  }
  firestore = adminLib.firestore();
  return firestore;
}

async function readAllCollections(db) {
  const collections = ['staff', 'deliveries', 'inventory', 'inspections', 'shiftNotes', 'presence', 'cameras', 'dsRequests', 'purchases', 'inventoryMovements'];
  const out = {};
  for (const name of collections) {
    try {
      const snap = await db.collection(name).get();
      out[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      out[name] = [];
    }
  }
  try {
    const compDoc = await db.collection('settings').doc('compliance').get();
    out.compliance = compDoc.exists ? compDoc.data() : {};
  } catch (e) {
    out.compliance = {};
  }
  return out;
}

function formatNow(d) {
  const now = d ? (d instanceof Date ? d : d.toDate ? d.toDate() : new Date(d)) : new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function resolvePurchaseSize(item) {
  if (!item) return null;
  const normalized = item.toLowerCase().replace(/\s+/g, '');
  if (normalized.includes('14.5kg') || normalized.includes('14.5')) return '14.5kg';
  if (normalized.includes('13kg') || normalized.includes('13')) return '13kg';
  if (normalized.includes('6kg') || normalized.includes('6')) return '6kg';
  if (normalized.includes('3kg') || normalized.includes('3')) return '3kg';
  return null;
}

exports.handler = async function (event, context) {
  // Determine route path. Redirect passes ?path=/api/xxx
  const qs = event.queryStringParameters || {};
  const rawPath = qs.path || event.path || '';
  const method = event.httpMethod || 'GET';

  // Normalize to route after /api
  let route = rawPath;
  if (!route.startsWith('/')) route = '/' + route;

  try {
    const db = initFirestore();

    // GET /api/data
    if (method === 'GET' && route.startsWith('/api/data')) {
      const data = await readAllCollections(db);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data })
      };
    }

    // Helper to parse body
    let body = {};
    if (event.body) {
      try { body = JSON.parse(event.body); } catch (e) { body = {}; }
    }

    // POST /api/deliveries
    if (method === 'POST' && route.startsWith('/api/deliveries')) {
      const nowStr = formatNow();
      const doc = { ...body, time: nowStr, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('deliveries').add(doc);
      const snap = await ref.get();
      const saved = snap.data() || {};
      if (saved.createdAt && saved.createdAt.toDate) saved.time = formatNow(saved.createdAt.toDate());
      if (!saved.time) saved.time = nowStr;
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...saved } }) };
    }

    // POST /api/inventory/adjust
    if (method === 'POST' && route.startsWith('/api/inventory/adjust')) {
      const { outlet, size, delta } = body;
      if (!outlet || !size || delta === undefined) return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Outlet, size, and delta required' }) };
      const docId = `${outlet}_${size}`;
      const docRef = db.collection('inventory').doc(docId);
      const docSnap = await docRef.get();
      let newQty = 0;
      if (docSnap.exists) {
        const cur = docSnap.data();
        newQty = Math.max(0, (parseInt(cur.qty || 0) + parseInt(delta)));
      } else {
        newQty = Math.max(0, parseInt(delta));
      }
      const newStatus = newQty <= 5 ? 'critical' : newQty <= 12 ? 'low' : 'ok';
      await docRef.set({ outlet, size, qty: newQty, status: newStatus, updatedAt: adminLib.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await db.collection('inventoryMovements').add({
        outlet,
        size,
        qty: parseInt(delta),
        source: 'manual',
        item: 'Inventory adjustment',
        time: formatNow(),
        createdAt: adminLib.firestore.FieldValue.serverTimestamp()
      });
      return { statusCode: 200, body: JSON.stringify({ success: true, data: { outlet, size, qty: newQty, status: newStatus } }) };
    }

    // POST /api/inspections
    if (method === 'POST' && route.startsWith('/api/inspections')) {
      const nowStr = formatNow();
      const doc = { ...body, time: nowStr, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('inspections').add(doc);
      const snap = await ref.get();
      const saved = snap.data() || {};
      if (saved.createdAt && saved.createdAt.toDate) saved.time = formatNow(saved.createdAt.toDate());
      if (!saved.time) saved.time = nowStr;
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...saved } }) };
    }

    // POST /api/shift-notes
    if (method === 'POST' && route.startsWith('/api/shift-notes')) {
      const nowStr = formatNow();
      const doc = { ...body, time: nowStr, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('shiftNotes').add(doc);
      const snap = await ref.get();
      const saved = snap.data() || {};
      if (saved.createdAt && saved.createdAt.toDate) saved.time = formatNow(saved.createdAt.toDate());
      if (!saved.time) saved.time = nowStr;
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...saved } }) };
    }

    // POST /api/staff
    if (method === 'POST' && route.startsWith('/api/staff')) {
      const nowStr = formatNow();
      const doc = { ...body, time: nowStr, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('staff').add(doc);
      const snap = await ref.get();
      const saved = snap.data() || {};
      if (saved.createdAt && saved.createdAt.toDate) saved.time = formatNow(saved.createdAt.toDate());
      if (!saved.time) saved.time = nowStr;
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...saved } }) };
    }

    // POST /api/presence
    if (method === 'POST' && route.startsWith('/api/presence')) {
      const nowStr = formatNow();
      const doc = { ...body, time: nowStr, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('presence').add(doc);
      const snap = await ref.get();
      const saved = snap.data() || {};
      if (saved.createdAt && saved.createdAt.toDate) saved.time = formatNow(saved.createdAt.toDate());
      if (!saved.time) saved.time = nowStr;
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...saved } }) };
    }

    // POST /api/compliance
    if (method === 'POST' && route.startsWith('/api/compliance')) {
      const payload = {
        rawVideoRetentionDays: parseInt(body.rawVideoRetentionDays) || 30,
        matchMetadataRetentionDays: parseInt(body.matchMetadataRetentionDays) || 180
      };
      await db.collection('settings').doc('compliance').set(payload, { merge: true });
      const doc = (await db.collection('settings').doc('compliance').get()).data();
      return { statusCode: 200, body: JSON.stringify({ success: true, data: doc }) };
    }

    // POST /api/purchases
    if (method === 'POST' && route.startsWith('/api/purchases')) {
      const nowStr = formatNow();
      const parsedQty = parseInt(body.qty) || 1;
      const parsedUnitPrice = parseFloat(body.unitPrice) || 0;
      const doc = {
        ...body,
        qty: parsedQty,
        unitPrice: parsedUnitPrice,
        amount: parseFloat((parsedQty * parsedUnitPrice).toFixed(2)),
        time: nowStr,
        createdAt: adminLib.firestore.FieldValue.serverTimestamp()
      };
      const ref = await db.collection('purchases').add(doc);
      const snap = await ref.get();
      const saved = snap.data() || {};
      if (saved.createdAt && saved.createdAt.toDate) saved.time = formatNow(saved.createdAt.toDate());
      if (!saved.time) saved.time = nowStr;
      let inventoryUpdate = null;
      const size = resolvePurchaseSize(saved.item);
      if (size && saved.outlet) {
        const docId = `${saved.outlet}_${size}`;
        const invRef = db.collection('inventory').doc(docId);
        const invSnap = await invRef.get();
        let newQty = 0;
        if (invSnap.exists) {
          newQty = Math.max(0, (parseInt(invSnap.data().qty || 0) - parsedQty));
        }
        const newStatus = newQty <= 5 ? 'critical' : newQty <= 12 ? 'low' : 'ok';
        await invRef.set({ outlet: saved.outlet, size, qty: newQty, status: newStatus, updatedAt: adminLib.firestore.FieldValue.serverTimestamp() }, { merge: true });
        inventoryUpdate = { outlet: saved.outlet, size, qty: newQty, status: newStatus };
        await db.collection('inventoryMovements').add({
          outlet: saved.outlet,
          size,
          qty: -parsedQty,
          source: 'sale',
          item: saved.item,
          purchaseId: ref.id,
          time: nowStr,
          createdAt: adminLib.firestore.FieldValue.serverTimestamp()
        });
      }
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...saved }, inventoryUpdate }) };
    }

    // POST /api/ds-requests
    if (method === 'POST' && route.startsWith('/api/ds-requests')) {
      const nowStr = formatNow();
      const doc = { ...body, status: 'open', time: nowStr, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('dsRequests').add(doc);
      const snap = await ref.get();
      const saved = snap.data() || {};
      if (saved.createdAt && saved.createdAt.toDate) saved.time = formatNow(saved.createdAt.toDate());
      if (!saved.time) saved.time = nowStr;
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...saved } }) };
    }

    // PATCH /api/ds-requests/:id/resolve
    if ((method === 'PATCH' || method === 'POST') && route.match(/^\/api\/ds-requests\/[^\/]+\/resolve/)) {
      const parts = route.split('/');
      const id = parts[3];
      const docRef = db.collection('dsRequests').doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) return { statusCode: 404, body: JSON.stringify({ success: false, error: 'Request not found' }) };
      await docRef.update({ status: 'resolved', resolvedAt: adminLib.firestore.FieldValue.serverTimestamp() });
      const updated = (await docRef.get()).data();
      return { statusCode: 200, body: JSON.stringify({ success: true, data: updated }) };
    }

    return { statusCode: 404, body: JSON.stringify({ success: false, error: 'Route not found' }) };

  } catch (err) {
    console.error('Function error', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message || String(err) }) };
  }
};
