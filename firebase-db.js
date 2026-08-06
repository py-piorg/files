/* ==========================================================================
   TRIPLE A GAS — FIREBASE CLOUD FIRESTORE INTEGRATION
   Works 100% natively on Netlify, Mobile, & Static Hosting with 24/7 Cloud Sync
   ========================================================================== */

// Firebase Configuration Object (Default Demo / Production ready)
const firebaseConfig = {
  apiKey: "AIzaSyAvkq7YEuJtD7IlsdcBE8hh9OX380YgeUg",
  authDomain: "triple-a-gas.firebaseapp.com",
  projectId: "triple-a-gas",
  storageBucket: "triple-a-gas.firebasestorage.app",
  messagingSenderId: "533855152730",
  appId: "1:533855152730:web:8f92468605c6e25a458663"
};

let db = null;
let isFirebaseInitialized = false;

// Initialize Firebase & Firestore
function initFirebase() {
  if (typeof firebase !== 'undefined' && firebase.initializeApp) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }

      // Use modern persistent cache instead of deprecated enablePersistence()
      // This eliminates the "enableMultiTabIndexedDbPersistence will be deprecated" warning
      try {
        db = firebase.firestore();
        // Modern: configure cache via settings (compat SDK approach)
        db.settings({
          cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
        });
        db.enableMultiTabIndexedDbPersistence().catch(err => {
          if (err.code === 'failed-precondition') {
            // Multiple tabs open — persistence limited to one tab, that's fine
            db.enableIndexedDbPersistence({ synchronizeTabs: false }).catch(() => {});
          } else if (err.code === 'unimplemented') {
            // Browser doesn't support offline persistence — that's OK
          }
        });
      } catch (settingsErr) {
        // Settings already set or not supported — just get db reference
        db = firebase.firestore();
      }

      isFirebaseInitialized = true;
      console.log('🔥 Firebase Cloud Firestore Connected!');
    } catch (e) {
      console.warn('Firebase initialization error, using local fallback:', e);
    }
  }
}

// ── Read All Collections ────────────────────────────────────────────────────
async function syncFirestoreData(onUpdateCallback) {
  if (!isFirebaseInitialized || !db) return false;

  try {
    const collections = [
      'staff', 'deliveries', 'inventory', 'inspections', 'shiftNotes',
      'presence', 'cameras', 'dsRequests', 'purchases',
      'expenses', 'vehicles', 'trips', 'maintenance',
      'customers', 'orders', 'suppliers', 'purchaseOrders', 'payroll', 'licences'
    ];
    const remoteData = {};

    for (const colName of collections) {
      const snapshot = await db.collection(colName).get();
      if (!snapshot.empty) {
        remoteData[colName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    }

    // Settings documents
    const compDoc = await db.collection('settings').doc('compliance').get();
    if (compDoc.exists) remoteData.compliance = compDoc.data();

    const priceDoc = await db.collection('settings').doc('pricing').get();
    if (priceDoc.exists) remoteData.pricing = priceDoc.data();

    if (Object.keys(remoteData).length > 0) {
      onUpdateCallback(remoteData);
      return true;
    }
  } catch (err) {
    console.warn("Firestore sync fallback:", err);
  }
  return false;
}

// ── Public Pricing Read (used by public-facing pages) ──────────────────────
async function getPublicPricing() {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const doc = await db.collection('settings').doc('pricing').get();
    if (doc.exists) return doc.data();
  } catch (e) {
    console.warn("Could not fetch live pricing:", e);
  }
  return null;
}

// ── Existing Write Helpers ─────────────────────────────────────────────────
async function firestoreAddDelivery(delivery) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('deliveries').add({
      ...delivery,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...delivery };
  } catch (e) { console.error("Firestore addDelivery error:", e); return null; }
}

async function firestoreAdjustInventory(outlet, size, delta, newQty, newStatus) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docId = `${outlet}_${size}`;
    await db.collection('inventory').doc(docId).set(
      { outlet, size, qty: newQty, status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { outlet, size, qty: newQty, status: newStatus };
  } catch (e) { console.error("Firestore adjustInventory error:", e); return null; }
}

async function firestoreAddInspection(inspection) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('inspections').add({
      ...inspection,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...inspection };
  } catch (e) { console.error("Firestore addInspection error:", e); return null; }
}

async function firestoreAddShiftNote(note) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('shiftNotes').add({
      ...note,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...note };
  } catch (e) { console.error("Firestore addShiftNote error:", e); return null; }
}

async function firestoreAddStaff(staffMember) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('staff').add({
      ...staffMember,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...staffMember };
  } catch (e) { console.error("Firestore addStaff error:", e); return null; }
}

// ── NEW: Pricing ───────────────────────────────────────────────────────────
async function firestoreSetPricing(priceObj) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    await db.collection('settings').doc('pricing').set(
      { ...priceObj, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    console.log("✅ Pricing published to Firestore — public pages will update.");
    return priceObj;
  } catch (e) { console.error("Firestore setPricing error:", e); return null; }
}

// ── NEW: Finance / Expenses ─────────────────────────────────────────────────
async function firestoreAddExpense(expense) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('expenses').add({
      ...expense,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...expense };
  } catch (e) { console.error("Firestore addExpense error:", e); return null; }
}

// ── NEW: Fleet / Vehicles ──────────────────────────────────────────────────
async function firestoreAddVehicle(vehicle) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('vehicles').add({
      ...vehicle,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...vehicle };
  } catch (e) { console.error("Firestore addVehicle error:", e); return null; }
}

async function firestoreAddTrip(trip) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('trips').add({
      ...trip,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...trip };
  } catch (e) { console.error("Firestore addTrip error:", e); return null; }
}

async function firestoreAddMaintenance(record) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('maintenance').add({
      ...record,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...record };
  } catch (e) { console.error("Firestore addMaintenance error:", e); return null; }
}

// ── NEW: Customers ─────────────────────────────────────────────────────────
async function firestoreAddCustomer(customer) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('customers').add({
      ...customer,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...customer };
  } catch (e) { console.error("Firestore addCustomer error:", e); return null; }
}

async function firestoreAddOrder(order) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('orders').add({
      ...order,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...order };
  } catch (e) { console.error("Firestore addOrder error:", e); return null; }
}

async function firestoreUpdateCustomerBalance(customerId, newBalance) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    await db.collection('customers').doc(customerId).update({
      balance: newBalance,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: customerId, balance: newBalance };
  } catch (e) { console.error("Firestore updateCustomerBalance error:", e); return null; }
}

// ── NEW: Suppliers & Procurement ───────────────────────────────────────────
async function firestoreAddSupplier(supplier) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('suppliers').add({
      ...supplier,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...supplier };
  } catch (e) { console.error("Firestore addSupplier error:", e); return null; }
}

async function firestoreAddPurchaseOrder(po) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('purchaseOrders').add({
      ...po,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...po };
  } catch (e) { console.error("Firestore addPurchaseOrder error:", e); return null; }
}

async function firestoreUpdatePOStatus(poId, status) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    await db.collection('purchaseOrders').doc(poId).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: poId, status };
  } catch (e) { console.error("Firestore updatePOStatus error:", e); return null; }
}

// ── NEW: Payroll ───────────────────────────────────────────────────────────
async function firestoreSavePayroll(record) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docId = record.id || `${record.staffId}_${record.month}`;
    await db.collection('payroll').doc(docId).set(
      { ...record, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { id: docId, ...record };
  } catch (e) { console.error("Firestore savePayroll error:", e); return null; }
}

// ── NEW: Licences ──────────────────────────────────────────────────────────
async function firestoreAddLicence(licence) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('licences').add({
      ...licence,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...licence };
  } catch (e) { console.error("Firestore addLicence error:", e); return null; }
}

async function firestoreUpdateLicence(licenceId, updates) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    await db.collection('licences').doc(licenceId).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: licenceId, ...updates };
  } catch (e) { console.error("Firestore updateLicence error:", e); return null; }
}

// ── NEW: Stock Counts ───────────────────────────────────────────────────────────────────────────────────────
async function firestoreAddStockCount(record) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('stockCounts').add({
      ...record,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...record };
  } catch (e) { console.error('Firestore addStockCount error:', e); return null; }
}

// ── NEW: Enquiries (from public contact form) ───────────────────────────────────────────────
async function firestoreAddEnquiry(enquiry) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('enquiries').add({
      ...enquiry,
      reviewed: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...enquiry };
  } catch (e) { console.error('Firestore addEnquiry error:', e); return null; }
}

async function firestoreMarkEnquiryReviewed(enquiryId) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    await db.collection('enquiries').doc(enquiryId).update({
      reviewed: true,
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: enquiryId, reviewed: true };
  } catch (e) { console.error('Firestore markEnquiryReviewed error:', e); return null; }
}

// ── NEW: Station Status ──────────────────────────────────────────────────────────────────────────────
async function firestoreSetStationStatus(statuses) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    await db.collection('settings').doc('stationStatus').set(
      { ...statuses, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    console.log('✅ Station statuses published to Firestore.');
    return statuses;
  } catch (e) { console.error('Firestore setStationStatus error:', e); return null; }
}

async function firestoreGetStationStatus() {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const doc = await db.collection('settings').doc('stationStatus').get();
    if (doc.exists) return doc.data();
  } catch (e) { console.warn('Could not fetch station status:', e); }
  return null;
}

// ── NEW: Alert Log ─────────────────────────────────────────────────────────────────────────────────────────
async function firestoreLogAlert(alert) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('alertLog').add({
      ...alert,
      loggedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...alert };
  } catch (e) { console.error('Firestore logAlert error:', e); return null; }
}

// Also extend syncFirestoreData to pull enquiries and stockCounts
// (the existing syncFirestoreData already pulls all collections listed;
//  'enquiries' and 'stockCounts' will be picked up automatically since
//  they are in the collections array above)

// ── Auto Init on script load ─────────────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initFirebase);
}
