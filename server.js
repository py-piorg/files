const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static web app files
app.use(express.static(path.join(__dirname)));

// REST API Endpoints for Admin Portal

// 1. Get full database state
app.get('/api/data', (req, res) => {
  res.json({ success: true, data: db.getAll() });
});

// 2. Add delivery
app.post('/api/deliveries', (req, res) => {
  const { outlet, driver, size, qty, customer, status } = req.body;
  if (!outlet || !size) {
    return res.status(400).json({ success: false, error: 'Outlet and size are required' });
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const delivery = {
    id: `d_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    time: timeStr,
    outlet,
    driver: driver || 'Staff',
    size,
    qty: parseInt(qty) || 1,
    customer: customer || 'Walk-in',
    status: status || 'done'
  };

  const added = db.addDelivery(delivery);
  res.status(201).json({ success: true, data: added });
});

// 3. Adjust inventory stock
app.post('/api/inventory/adjust', (req, res) => {
  const { outlet, size, delta } = req.body;
  if (!outlet || !size || delta === undefined) {
    return res.status(400).json({ success: false, error: 'Outlet, size, and delta are required' });
  }

  const updated = db.adjustInventory(outlet, size, parseInt(delta));
  if (updated) {
    res.json({ success: true, data: updated });
  } else {
    res.status(404).json({ success: false, error: 'Inventory row not found' });
  }
});

// 4. Log inspection
app.post('/api/inspections', (req, res) => {
  const { outlet, item, inspector, result, nextDue } = req.body;
  if (!outlet || !item) {
    return res.status(400).json({ success: false, error: 'Outlet and item are required' });
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const inspection = {
    id: `i_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    time: timeStr,
    outlet,
    item,
    inspector: inspector || 'Staff',
    result: result || 'pass',
    nextDue: nextDue || '—'
  };

  const added = db.addInspection(inspection);
  res.status(201).json({ success: true, data: added });
});

// 5. Add shift note
app.post('/api/shift-notes', (req, res) => {
  const { outlet, staff, note } = req.body;
  if (!outlet || !note) {
    return res.status(400).json({ success: false, error: 'Outlet and note content are required' });
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const shiftNote = {
    id: `n_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    time: timeStr,
    outlet,
    staff: staff || 'Staff',
    note
  };

  const added = db.addShiftNote(shiftNote);
  res.status(201).json({ success: true, data: added });
});

// 6. Add staff member
app.post('/api/staff', (req, res) => {
  const { name, role, outlet, consent } = req.body;
  if (!name || !role || !outlet) {
    return res.status(400).json({ success: false, error: 'Name, role, and outlet are required' });
  }

  const staffMember = {
    id: `s_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name,
    role,
    outlet,
    consent: consent || 'enrolled'
  };

  const added = db.addStaff(staffMember);
  res.status(201).json({ success: true, data: added });
});

// 7. Add presence event
app.post('/api/presence', (req, res) => {
  const { outlet, worker, confidence, status } = req.body;
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const event = {
    id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    time: timeStr,
    outlet,
    worker,
    confidence: confidence || 95,
    status: status || 'confirmed'
  };

  const added = db.addPresence(event);
  res.status(201).json({ success: true, data: added });
});

// 8. Update compliance settings
app.post('/api/compliance', (req, res) => {
  const { rawVideoRetentionDays, matchMetadataRetentionDays, dpcRegistered, dpiaComplete } = req.body;
  const updated = db.updateCompliance({
    rawVideoRetentionDays: parseInt(rawVideoRetentionDays) || 30,
    matchMetadataRetentionDays: parseInt(matchMetadataRetentionDays) || 180,
    ...(dpcRegistered !== undefined && { dpcRegistered }),
    ...(dpiaComplete !== undefined && { dpiaComplete })
  });
  res.json({ success: true, data: updated });
});

// 9. Add purchase log
app.post('/api/purchases', (req, res) => {
  const { outlet, cashier, customer, item, qty, unitPrice, paymentMethod, notes } = req.body;
  if (!outlet || !item || !cashier) {
    return res.status(400).json({ success: false, error: 'Outlet, cashier, and item are required' });
  }
 
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const parsedQty = parseInt(qty) || 1;
  const parsedUnitPrice = parseFloat(unitPrice) || 0;
 
  const purchase = {
    id: `pu_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    time: timeStr,
    outlet,
    cashier,
    customer: customer || 'Walk-in',
    item,
    qty: parsedQty,
    unitPrice: parsedUnitPrice,
    amount: parseFloat((parsedQty * parsedUnitPrice).toFixed(2)),
    paymentMethod: paymentMethod || 'cash',
    notes: notes || '—'
  };
 
  const added = db.addPurchase(purchase);
  res.status(201).json({ success: true, data: added });
});
 
// 10. Add Data Subject request
app.post('/api/ds-requests', (req, res) => {
  const { staff, type, note } = req.body;
  if (!staff || !type) {
    return res.status(400).json({ success: false, error: 'Staff name and type are required' });
  }
 
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 
  const request = {
    id: `r_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    time: timeStr,
    staff,
    type,
    status: 'open',
    note: note || '—'
  };
 
  const added = db.addDsRequest(request);
  res.status(201).json({ success: true, data: added });
});
 
// 11. Resolve Data Subject request
app.patch('/api/ds-requests/:id/resolve', (req, res) => {
  const { id } = req.params;
  const updated = db.resolveDsRequest(id);
  if (updated) {
    res.json({ success: true, data: updated });
  } else {
    res.status(404).json({ success: false, error: 'Request not found' });
  }
});

// Fallback route to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` TRIPLE A GAS Server & SQLite Database Active!`);
  console.log(` Access Server at: http://localhost:${PORT}`);
  console.log(` Admin Portal:      http://localhost:${PORT}/admin.html`);
  console.log(`====================================================`);
});
