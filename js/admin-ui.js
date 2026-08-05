/**
 * Triple A Gas Admin Portal - UI & Interaction Module (js/admin-ui.js)
 * Command Palette (Ctrl+K), Table Search & Pagination, UI Controls.
 */

// ── Command Palette (Ctrl+K) ──────────────────────────────────
const CommandPalette = {
  commands: [
    { title: 'Dashboard', category: 'Navigation', icon: '📊', action: () => showView('dashboard') },
    { title: 'Deliveries Log', category: 'Navigation', icon: '🚚', action: () => showView('deliveries') },
    { title: 'Cylinder Inventory', category: 'Navigation', icon: '⛽', action: () => showView('inventory') },
    { title: 'Cashier & POS Sales', category: 'Navigation', icon: '💵', action: () => showView('cashier') },
    { title: 'Finance & P&L', category: 'Navigation', icon: '📈', action: () => showView('finance') },
    { title: 'Pricing Engine', category: 'Navigation', icon: '🏷️', action: () => showView('pricing') },
    { title: 'Stock Count Verification', category: 'Navigation', icon: '📋', action: () => showView('stockcount') },
    { title: 'Fleet & Vehicle Log', category: 'Navigation', icon: '🚛', action: () => showView('fleet') },
    { title: 'Customer Directory', category: 'Navigation', icon: '👥', action: () => showView('customers') },
    { title: 'Suppliers & Reordering', category: 'Navigation', icon: '🏭', action: () => showView('suppliers') },
    { title: 'Payroll Manager', category: 'Navigation', icon: '💳', action: () => showView('payroll') },
    { title: 'Staff Roster', category: 'Navigation', icon: '👤', action: () => showView('staff') },
    { title: 'Safety Inspections', category: 'Navigation', icon: '🦺', action: () => showView('inspections') },
    { title: 'Shift Handover Notes', category: 'Navigation', icon: '📝', action: () => showView('shiftNotes') },
    { title: 'Biometric Presence', category: 'Navigation', icon: '📷', action: () => showView('presence') },
    { title: 'Regulatory Compliance', category: 'Navigation', icon: '🏛️', action: () => showView('compliance') },
    { title: 'Licence Renewals', category: 'Navigation', icon: '📜', action: () => showView('licences') },
    { title: 'Reports & Export', category: 'Navigation', icon: '📁', action: () => showView('reports') },
    { title: 'Toggle Light / Dark Theme', category: 'Action', icon: '🌓', action: () => ThemeManager.toggle() },
    { title: 'Sync Offline Queue', category: 'Action', icon: '🔄', action: () => AdminAPI.syncOfflineQueue() }
  ],

  init() {
    this.createDOM();
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.open();
      }
      if (e.key === 'Escape') {
        this.close();
      }
    });
  },

  createDOM() {
    if (document.getElementById('cmdPaletteModal')) return;
    const modal = document.createElement('div');
    modal.id = 'cmdPaletteModal';
    modal.className = 'cmd-modal';
    modal.innerHTML = `
      <div class="cmd-overlay" onclick="CommandPalette.close()"></div>
      <div class="cmd-box">
        <div class="cmd-header">
          <span class="cmd-search-icon">🔍</span>
          <input type="text" id="cmdInput" placeholder="Type a command or view... (Ctrl+K)" autocomplete="off" />
          <span class="cmd-esc-hint">ESC</span>
        </div>
        <div class="cmd-results" id="cmdResults"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const input = document.getElementById('cmdInput');
    if (input) {
      input.addEventListener('input', () => this.filter(input.value));
    }
  },

  open() {
    const modal = document.getElementById('cmdPaletteModal');
    const input = document.getElementById('cmdInput');
    if (modal && input) {
      modal.classList.add('open');
      input.value = '';
      this.filter('');
      setTimeout(() => input.focus(), 50);
    }
  },

  close() {
    const modal = document.getElementById('cmdPaletteModal');
    if (modal) modal.classList.remove('open');
  },

  filter(query) {
    const resultsContainer = document.getElementById('cmdResults');
    if (!resultsContainer) return;
    const q = query.toLowerCase().trim();
    const matches = this.commands.filter(c => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));

    if (matches.length === 0) {
      resultsContainer.innerHTML = `<div class="cmd-empty">No matching commands found</div>`;
      return;
    }

    resultsContainer.innerHTML = matches.map((c, idx) => `
      <div class="cmd-item" data-idx="${idx}">
        <span class="cmd-item-icon">${c.icon}</span>
        <span class="cmd-item-title">${esc(c.title)}</span>
        <span class="cmd-item-cat">${esc(c.category)}</span>
      </div>
    `).join('');

    resultsContainer.querySelectorAll('.cmd-item').forEach((el, idx) => {
      el.addEventListener('click', () => {
        matches[idx].action();
        this.close();
      });
    });
  }
};

// ── Table Search & Pagination ────────────────────────────────
function setupTablePagination(tableBodyId, searchInputId, paginationContainerId, itemsPerPage = 8) {
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;

  const originalRows = Array.from(tbody.querySelectorAll('tr'));
  let currentPage = 1;
  let filteredRows = [...originalRows];

  function renderPage() {
    const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;

    originalRows.forEach(row => row.style.display = 'none');
    filteredRows.slice(start, end).forEach(row => row.style.display = '');

    const pagContainer = document.getElementById(paginationContainerId);
    if (pagContainer) {
      pagContainer.innerHTML = `
        <div class="table-pag-controls">
          <span class="table-pag-info">Showing ${filteredRows.length === 0 ? 0 : start + 1}-${Math.min(end, filteredRows.length)} of ${filteredRows.length}</span>
          <div class="table-pag-btns">
            <button class="btn btn-ghost btn-sm" ${currentPage <= 1 ? 'disabled' : ''} onclick="changePage('${tableBodyId}', -1)">Prev</button>
            <span class="table-pag-cur">${currentPage} / ${totalPages}</span>
            <button class="btn btn-ghost btn-sm" ${currentPage >= totalPages ? 'disabled' : ''} onclick="changePage('${tableBodyId}', 1)">Next</button>
          </div>
        </div>
      `;
    }
  }

  tbody._renderPage = renderPage;
  tbody._changePage = (dir) => { currentPage += dir; renderPage(); };

  const searchInput = document.getElementById(searchInputId);
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      filteredRows = originalRows.filter(row => row.textContent.toLowerCase().includes(q));
      currentPage = 1;
      renderPage();
    });
  }

  renderPage();
}

function changePage(tableBodyId, dir) {
  const tbody = document.getElementById(tableBodyId);
  if (tbody && tbody._changePage) {
    tbody._changePage(dir);
  }
}

// ── Printable Thermal Receipt & Tax Invoice Generator ──
function printThermalReceipt(item) {
  const receiptArea = document.getElementById('receipt-print-area');
  if (!receiptArea) return;
  const time = item.time || new Date().toLocaleString();
  const customer = item.customer || item.customerName || 'Walk-in Customer';
  const outlet = item.outlet || 'Accra';
  const size = item.size || item.item || '14.5kg Cylinder';
  const qty = item.qty || 1;
  const amount = Number(item.amount || (qty * (item.unitPrice || 210.25))).toFixed(2);
  const vat = (amount * 0.15).toFixed(2);
  const total = (Number(amount) + Number(vat)).toFixed(2);

  receiptArea.innerHTML = `
    <h2>TRIPLE A GAS</h2>
    <p>LPG Refill Station · ${esc(outlet)}</p>
    <hr>
    <p><b>Date:</b> ${esc(time)}</p>
    <p><b>Customer:</b> ${esc(customer)}</p>
    <hr>
    <p><b>Item:</b> ${esc(qty)}x ${esc(size)}</p>
    <p><b>Subtotal:</b> GH₵ ${amount}</p>
    <p><b>VAT/NHIL (15%):</b> GH₵ ${vat}</p>
    <p style="font-size:16px;"><b>Total Paid:</b> GH₵ ${total}</p>
    <hr>
    <p style="text-align:center;">Thank you for fueling with Triple A Gas!</p>
  `;
  receiptArea.classList.add('printing');
  window.print();
  setTimeout(() => receiptArea.classList.remove('printing'), 1000);
}

function printTaxInvoice(item) {
  const invoiceArea = document.getElementById('invoice-print-area');
  if (!invoiceArea) return;
  const invNo = item.id || `INV-${Math.floor(10000 + Math.random() * 90000)}`;
  const date = item.time || new Date().toISOString().slice(0,10);
  const customer = item.customer || item.customerName || 'Corporate Client';
  const outlet = item.outlet || 'Accra Station';
  const size = item.size || item.item || 'Bulk LPG Delivery';
  const qty = item.qty || 1;
  const unitPrice = item.unitPrice || (item.amount ? (item.amount / qty) : 210.25);
  const subtotal = Number(qty * unitPrice).toFixed(2);
  const nhil = (subtotal * 0.025).toFixed(2);
  const getfund = (subtotal * 0.025).toFixed(2);
  const vat = (subtotal * 0.15).toFixed(2);
  const grandTotal = (Number(subtotal) + Number(nhil) + Number(getfund) + Number(vat)).toFixed(2);

  invoiceArea.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #8E1B2C;padding-bottom:12px;">
      <div>
        <h1>TRIPLE A GAS LIMITED</h1>
        <p>Licensed LPG Marketing Company · Ghana GRA TIN: 1002938481</p>
        <p>Station: ${esc(outlet)}</p>
      </div>
      <div style="text-align:right;">
        <h2>TAX INVOICE</h2>
        <p><b>Invoice No:</b> ${esc(invNo)}</p>
        <p><b>Date:</b> ${esc(date)}</p>
      </div>
    </div>
    <div class="inv-meta" style="margin:20px 0;">
      <div><b>Billed To:</b> ${esc(customer)}</div>
      <div><b>Payment Terms:</b> Immediate / Cash on Delivery</div>
    </div>
    <table>
      <thead>
        <tr><th>Description</th><th>Qty</th><th>Unit Price (GH₵)</th><th>Total (GH₵)</th></tr>
      </thead>
      <tbody>
        <tr><td>${esc(size)} Refill &amp; Delivery</td><td>${qty}</td><td>${Number(unitPrice).toFixed(2)}</td><td>${subtotal}</td></tr>
      </tbody>
    </table>
    <div class="inv-total">
      <p>Subtotal: GH₵ ${subtotal}</p>
      <p>NHIL (2.5%): GH₵ ${nhil}</p>
      <p>GETFund (2.5%): GH₵ ${getfund}</p>
      <p>Standard VAT (15%): GH₵ ${vat}</p>
      <h3>Grand Total: GH₵ ${grandTotal}</h3>
    </div>
  `;
  invoiceArea.classList.add('printing');
  window.print();
  setTimeout(() => invoiceArea.classList.remove('printing'), 1000);
}

// ── SMS / WhatsApp Notification Simulator ──
async function sendSimulatedSMS(recipient, message, channel = 'SMS') {
  if (typeof toast === 'function') toast(`Sending ${channel} alert to ${recipient}...`, 'safe');
  if (typeof AdminAPI !== 'undefined' && AdminAPI.apiFetch) {
    await AdminAPI.apiFetch('/api/notifications/send', 'POST', { recipient, message, channel });
  }
}

// ── Predictive Stock Runout Forecast UI Renderer ──
async function renderStockRunoutPredictor() {
  const container = document.getElementById('stockPredictorContainer');
  if (!container) return;

  try {
    const res = await AdminAPI.apiFetch('/api/predictions/stockouts');
    if (res.ok && res.data && res.data.success) {
      const list = res.data.data;
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px;">
          ${list.map(p => `
            <div style="background:var(--panel-2);border:1px solid ${p.risk === 'CRITICAL' ? 'var(--danger)' : p.risk === 'WARNING' ? 'var(--warn)' : 'var(--border)'};border-radius:12px;padding:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;color:#fff;">${esc(p.outlet)}</span>
                <span class="badge ${p.risk === 'CRITICAL' ? 'badge-danger' : p.risk === 'WARNING' ? 'badge-warn' : 'badge-safe'}">${p.risk}</span>
              </div>
              <div style="font-size:20px;font-family:var(--mono);font-weight:800;color:#fff;margin:8px 0 4px;">${p.size}: ${p.currentQty} units</div>
              <div style="font-size:12px;color:var(--text-dim);">Est. Sales: ${p.avgDailySales}/day</div>
              <div style="font-size:12px;font-weight:700;color:${p.daysRemaining <= 2 ? 'var(--danger)' : 'var(--gold)'};margin-top:4px;">
                ⏱️ Run-out in ~${p.daysRemaining} days
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (e) {
    console.warn('Failed to fetch stock predictor:', e);
  }
}

// Attach to global window
window.CommandPalette = CommandPalette;
window.setupTablePagination = setupTablePagination;
window.changePage = changePage;
window.printThermalReceipt = printThermalReceipt;
window.printTaxInvoice = printTaxInvoice;
window.sendSimulatedSMS = sendSimulatedSMS;
window.renderStockRunoutPredictor = renderStockRunoutPredictor;

document.addEventListener('DOMContentLoaded', () => {
  CommandPalette.init();
});
