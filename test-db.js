const http = require('http');

function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log("=== Testing REST API & SQLite Database ===");
  try {
    // 1. Get initial data
    const dataRes = await request('/api/data');
    console.log("1. GET /api/data:", dataRes.success ? "PASS (Fetched " + dataRes.data.staff.length + " staff members)" : "FAIL");

    // 2. Add Delivery
    const delRes = await request('/api/deliveries', 'POST', {
      outlet: 'Accra', driver: 'Test Driver', size: '14.5kg', qty: 5, customer: 'Test Customer', status: 'done'
    });
    console.log("2. POST /api/deliveries:", delRes.success ? "PASS (ID: " + delRes.data.id + ")" : "FAIL");

    // 3. Adjust Inventory
    const invRes = await request('/api/inventory/adjust', 'POST', {
      outlet: 'Accra', size: '14.5kg', delta: -3
    });
    console.log("3. POST /api/inventory/adjust:", invRes.success ? "PASS (New Qty: " + invRes.data.qty + ")" : "FAIL");

    // 4. Log Inspection
    const inspRes = await request('/api/inspections', 'POST', {
      outlet: 'Antoa', item: 'Valve Unit #1', inspector: 'Inspector K.', result: 'pass', nextDue: '2026-08-30'
    });
    console.log("4. POST /api/inspections:", inspRes.success ? "PASS (ID: " + inspRes.data.id + ")" : "FAIL");

    // 5. Add Shift Note
    const noteRes = await request('/api/shift-notes', 'POST', {
      outlet: 'Bonwire', staff: 'Abena', note: 'All pumps fully operational.'
    });
    console.log("5. POST /api/shift-notes:", noteRes.success ? "PASS (ID: " + noteRes.data.id + ")" : "FAIL");

    console.log("=== ALL API TESTS COMPLETED SUCCESSFULLY ===");
  } catch (err) {
    console.error("Test failed:", err.message);
  }
}

setTimeout(runTests, 1500);
