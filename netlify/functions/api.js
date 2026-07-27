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
  const collections = ['staff', 'deliveries', 'inventory', 'inspections', 'shiftNotes', 'presence', 'cameras', 'dsRequests'];
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
      const doc = { ...body, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('deliveries').add(doc);
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...doc } }) };
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
      return { statusCode: 200, body: JSON.stringify({ success: true, data: { outlet, size, qty: newQty, status: newStatus } }) };
    }

    // POST /api/inspections
    if (method === 'POST' && route.startsWith('/api/inspections')) {
      const doc = { ...body, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('inspections').add(doc);
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...doc } }) };
    }

    // POST /api/shift-notes
    if (method === 'POST' && route.startsWith('/api/shift-notes')) {
      const doc = { ...body, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('shiftNotes').add(doc);
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...doc } }) };
    }

    // POST /api/staff
    if (method === 'POST' && route.startsWith('/api/staff')) {
      const doc = { ...body, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('staff').add(doc);
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...doc } }) };
    }

    // POST /api/presence
    if (method === 'POST' && route.startsWith('/api/presence')) {
      const doc = { ...body, createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('presence').add(doc);
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...doc } }) };
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

    // POST /api/ds-requests
    if (method === 'POST' && route.startsWith('/api/ds-requests')) {
      const doc = { ...body, status: 'open', createdAt: adminLib.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection('dsRequests').add(doc);
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: ref.id, ...doc } }) };
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
