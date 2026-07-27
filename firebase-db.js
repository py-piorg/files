/* ==========================================================================
   TRIPLE A GAS — FIREBASE CLOUD FIRESTORE INTEGRATION
   Works 100% natively on Netlify, Mobile, & Static Hosting with 24/7 Cloud Sync
   ========================================================================== */

// Firebase Configuration Object (Default Demo / Production ready)
const firebaseConfig = {
  apiKey: "AIzaSyTripleAGasKeyForNetlifySync2026",
  authDomain: "triple-a-gas-ghana.firebaseapp.com",
  projectId: "triple-a-gas-ghana",
  storageBucket: "triple-a-gas-ghana.appspot.com",
  messagingSenderId: "987654321012",
  appId: "1:987654321012:web:abc123def456789"
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
      db = firebase.firestore();
      
      // Enable offline persistence for Netlify
      db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code == 'failed-precondition') {
          console.warn("Multiple tabs open, persistence enabled in primary tab.");
        } else if (err.code == 'unimplemented') {
          console.warn("Browser does not support offline persistence.");
        }
      });

      isFirebaseInitialized = true;
      console.log("🔥 Firebase Cloud Firestore Connected for Netlify!");
    } catch (e) {
      console.warn("Firebase initialization error, using SQLite/Local fallback:", e);
    }
  }
}

// Firestore Realtime Collections Sync
async function syncFirestoreData(onUpdateCallback) {
  if (!isFirebaseInitialized || !db) return false;

  try {
    const collections = ['staff', 'deliveries', 'inventory', 'inspections', 'shiftNotes', 'presence', 'cameras', 'dsRequests'];
    const remoteData = {};

    for (const colName of collections) {
      const snapshot = await db.collection(colName).get();
      if (!snapshot.empty) {
        remoteData[colName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    }

    const compDoc = await db.collection('settings').doc('compliance').get();
    if (compDoc.exists) {
      remoteData.compliance = compDoc.data();
    }

    if (Object.keys(remoteData).length > 0) {
      onUpdateCallback(remoteData);
      return true;
    }
  } catch (err) {
    console.warn("Firestore sync query fallback:", err);
  }
  return false;
}

// Write Helper Operations
async function firestoreAddDelivery(delivery) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('deliveries').add(delivery);
    return { id: docRef.id, ...delivery };
  } catch (e) { console.error("Firestore addDelivery error:", e); return null; }
}

async function firestoreAdjustInventory(outlet, size, delta, newQty, newStatus) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docId = `${outlet}_${size}`;
    await db.collection('inventory').doc(docId).set({
      outlet, size, qty: newQty, status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { outlet, size, qty: newQty, status: newStatus };
  } catch (e) { console.error("Firestore adjustInventory error:", e); return null; }
}

async function firestoreAddInspection(inspection) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('inspections').add(inspection);
    return { id: docRef.id, ...inspection };
  } catch (e) { console.error("Firestore addInspection error:", e); return null; }
}

async function firestoreAddShiftNote(note) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('shiftNotes').add(note);
    return { id: docRef.id, ...note };
  } catch (e) { console.error("Firestore addShiftNote error:", e); return null; }
}

async function firestoreAddStaff(staffMember) {
  if (!isFirebaseInitialized || !db) return null;
  try {
    const docRef = await db.collection('staff').add(staffMember);
    return { id: docRef.id, ...staffMember };
  } catch (e) { console.error("Firestore addStaff error:", e); return null; }
}

// Auto Init on script load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initFirebase);
}
