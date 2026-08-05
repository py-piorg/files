const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

function resolvePurchaseSize(item) {
  if (!item) return null;
  const normalized = item.toLowerCase().replace(/\s+/g, '');
  if (normalized.includes('14.5kg') || normalized.includes('14.5')) return '14.5kg';
  if (normalized.includes('13kg') || normalized.includes('13')) return '13kg';
  if (normalized.includes('6kg') || normalized.includes('6')) return '6kg';
  if (normalized.includes('3kg') || normalized.includes('3')) return '3kg';
  return null;
}

app.use(cors());
app.use(express.json());

// Serve static web app files
app.use(express.static(path.join(__dirname)));

// ── SSE Real-Time Clients ──
let sseClients = [];

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (e) {
      // client disconnected
    }
  });
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// ── Auth & Role Middleware ──
function getAuthUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer tag_token_')) return null;
  try {
    const raw = Buffer.from(auth.replace('Bearer tag_token_', ''), 'base64').toString('utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function requireRole(roles = []) {
  return (req, res, next) => {
    const user = getAuthUser(req);
    if (!user) {
      return next(); // Fallback mode
    }
    const isSuper = ['Owner', 'COO', 'Owner / Head Office'].includes(user.role);
    if (isSuper || roles.includes(user.role)) {
      req.user = user;
      return next();
    }
    return res.status(403).json({ success: false, error: 'Access denied: Restricted role' });
  };
}

// ── Login Endpoint ──
app.post('/api/login', (req, res) => {
  const { name, role, outlet } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }
  const result = db.authenticateStaff(name, role, outlet);
  const token = 'tag_token_' + Buffer.from(JSON.stringify(result.user)).toString('base64');
  db.addAuditLog({
    action: 'LOGIN',
    target: 'Auth',
    detail: `Logged in as ${result.user.role} (${result.user.outlet || 'All Outlets'})`,
    actor: result.user.name
  });
  broadcast('audit_log', { action: 'LOGIN', actor: result.user.name });
  res.json({ success: true, token, user: result.user });
});

// ── REST API Endpoints for Admin Portal ──

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
  broadcast('db_update', { type: 'delivery', data: added });
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
    broadcast('db_update', { type: 'inventory', data: updated });
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
  broadcast('db_update', { type: 'inspection', data: added });
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
  broadcast('db_update', { type: 'shiftNote', data: added });
  res.status(201).json({ success: true, data: added });
});

// 6. Add staff member
app.post('/api/staff', requireRole(['Owner', 'COO', 'Station Manager']), (req, res) => {
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
  broadcast('db_update', { type: 'staff', data: added });
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
  broadcast('db_update', { type: 'presence', data: added });
  res.status(201).json({ success: true, data: added });
});

// 8. Update compliance settings
app.post('/api/compliance', requireRole(['Owner', 'COO']), (req, res) => {
  const { rawVideoRetentionDays, matchMetadataRetentionDays, dpcRegistered, dpiaComplete } = req.body;
  const updated = db.updateCompliance({
    rawVideoRetentionDays: parseInt(rawVideoRetentionDays) || 30,
    matchMetadataRetentionDays: parseInt(matchMetadataRetentionDays) || 180,
    ...(dpcRegistered !== undefined && { dpcRegistered }),
    ...(dpiaComplete !== undefined && { dpiaComplete })
  });
  broadcast('db_update', { type: 'compliance', data: updated });
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
  const size = resolvePurchaseSize(item);
  let inventoryUpdate = null;
  if (size) {
    inventoryUpdate = db.getAll().inventory.find(i => i.outlet === outlet && i.size === size) || null;
  }

  broadcast('db_update', { type: 'purchase', data: added });
  res.status(201).json({ success: true, data: added, inventoryUpdate });
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
  broadcast('db_update', { type: 'dsRequest', data: added });
  res.status(201).json({ success: true, data: added });
});

// 11. Resolve Data Subject request
app.patch('/api/ds-requests/:id/resolve', (req, res) => {
  const { id } = req.params;
  const updated = db.resolveDsRequest(id);
  if (updated) {
    broadcast('db_update', { type: 'dsRequest_resolved', data: updated });
    res.json({ success: true, data: updated });
  } else {
    res.status(404).json({ success: false, error: 'Request not found' });
  }
});

// 12. Audit log creation endpoint
app.post('/api/audit-logs', (req, res) => {
  const { action, target, detail, actor } = req.body;
  const added = db.addAuditLog({ action, target, detail, actor });
  broadcast('audit_log', added);
  res.status(201).json({ success: true, data: added });
});

// 13. Batch Sync endpoint for offline queueing
app.post('/api/sync/batch', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'Items array required' });
  }
  const processed = [];
  items.forEach(item => {
    if (item.type === 'delivery') {
      processed.push(db.addDelivery(item.data));
    } else if (item.type === 'purchase') {
      processed.push(db.addPurchase(item.data));
    } else if (item.type === 'inspection') {
      processed.push(db.addInspection(item.data));
    } else if (item.type === 'shiftNote') {
      processed.push(db.addShiftNote(item.data));
    }
  });
  broadcast('db_update', { type: 'batch_sync', count: processed.length });
  res.json({ success: true, count: processed.length });
});
app.post('/api/public/orders', (req, res) => {
  const { customerName, phone, outlet, size, qty, address, amount } = req.body;
  if (!customerName || !phone || !outlet || !size) {
    return res.status(400).json({ success: false, error: 'Name, phone, outlet, and cylinder size are required' });
  }
  const order = db.addPublicOrder({ customerName, phone, outlet, size, qty, address, amount });
  broadcast('db_update', { type: 'public_order', data: order });
  res.status(201).json({ success: true, data: order });
});

// 15. Public customer order status tracking
app.get('/api/public/orders/:id', (req, res) => {
  const order = db.getPublicOrder(req.params.id);
  if (order) {
    res.json({ success: true, data: order });
  } else {
    res.status(404).json({ success: false, error: 'Order not found. Please verify your Order ID or phone number.' });
  }
});

// 15b. Update public order status (admin panel)
app.patch('/api/public/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['received','confirmed','dispatched','delivered'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  const updated = db.updatePublicOrderStatus(req.params.id, status);
  if (updated) {
    broadcast('db_update', { type: 'public_order_status', data: updated });
    res.json({ success: true, data: updated });
  } else {
    res.status(404).json({ success: false, error: 'Order not found' });
  }
});

// 16. Predictive stock runout forecast
app.get('/api/predictions/stockouts', (req, res) => {
  const predictions = db.predictStockouts();
  res.json({ success: true, data: predictions });
});

// 17. Vehicle trip & fuel efficiency logger
app.post('/api/vehicles/trips', (req, res) => {
  const { plate, driver, outlet, kmDriven, fuelLiters, fuelCost } = req.body;
  const trip = db.addVehicleTrip({ plate, driver, outlet, kmDriven, fuelLiters, fuelCost });
  broadcast('db_update', { type: 'vehicle_trip', data: trip });
  res.status(201).json({ success: true, data: trip });
});

// 18. Hydro-testing safety log
app.post('/api/inspections/hydro', (req, res) => {
  const { outlet, equipment, serialNo, status, nextDue, inspector } = req.body;
  const test = db.addHydroTest({ outlet, equipment, serialNo, status, nextDue, inspector });
  broadcast('db_update', { type: 'hydro_test', data: test });
  res.status(201).json({ success: true, data: test });
});

// 19. Simulated SMS / WhatsApp Dispatch Alert Webhook
app.post('/api/notifications/send', (req, res) => {
  const { recipient, message, channel } = req.body;
  console.log(`[NOTIFICATION SENT via ${channel || 'SMS'}] To ${recipient}: ${message}`);
  res.json({ success: true, sentAt: new Date().toISOString(), recipient, channel: channel || 'SMS' });
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
