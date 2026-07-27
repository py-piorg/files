const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db_store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed dataset
const SEED_DATA = {
  staff: [
    { id: "s1", name: "Akua Adu Mensah", role: "Owner", outlet: "Accra", consent: "n/a" },
    { id: "s2", name: "Frank Adu Mensah", role: "Owner", outlet: "Accra", consent: "n/a" },
    { id: "s3", name: "Nana Kwame Owusu Boateng", role: "COO", outlet: "Accra", consent: "n/a" },
    { id: "s4", name: "Ama Boakye Waa Boating", role: "Secretary", outlet: "Accra", consent: "n/a" },
    { id: "s5", name: "Kojo Mensah", role: "Driver", outlet: "Accra", consent: "enrolled" },
    { id: "s6", name: "Efua Owusu", role: "Station Manager", outlet: "Accra", consent: "enrolled" },
    { id: "s7", name: "Yaw Boateng", role: "Station Manager", outlet: "Antoa", consent: "enrolled" },
    { id: "s8", name: "Abena Osei", role: "Driver", outlet: "Bonwire", consent: "not_enrolled" },
    { id: "s9", name: "Kwabena Asante", role: "Station Manager", outlet: "Bogoso", consent: "enrolled" },
    { id: "s10", name: "Adjoa Mensah", role: "Station Manager", outlet: "Prestea", consent: "revoked" }
  ],
  deliveries: [
    { id: "d1", time: "2026-07-27 07:41", outlet: "Accra", driver: "Kojo Mensah", size: "14.5kg", qty: 2, customer: "A. Mensah — East Legon", status: "done" },
    { id: "d2", time: "2026-07-27 08:10", outlet: "Antoa", driver: "Yaw Boateng", size: "13kg", qty: 4, customer: "Antoa Chop Bar", status: "done" },
    { id: "d3", time: "2026-07-27 09:02", outlet: "Bogoso", driver: "Kwabena Asante", size: "6kg", qty: 1, customer: "Walk-in", status: "in_transit" }
  ],
  inventory: [
    { outlet: "Accra", size: "3kg", qty: 22, status: "ok" },
    { outlet: "Accra", size: "6kg", qty: 38, status: "ok" },
    { outlet: "Accra", size: "13kg", qty: 14, status: "low" },
    { outlet: "Accra", size: "14.5kg", qty: 46, status: "ok" },
    { outlet: "Antoa", size: "3kg", qty: 9, status: "low" },
    { outlet: "Antoa", size: "6kg", qty: 18, status: "ok" },
    { outlet: "Antoa", size: "13kg", qty: 12, status: "ok" },
    { outlet: "Antoa", size: "14.5kg", qty: 20, status: "ok" },
    { outlet: "Bonwire", size: "3kg", qty: 5, status: "critical" },
    { outlet: "Bonwire", size: "6kg", qty: 14, status: "ok" },
    { outlet: "Bonwire", size: "13kg", qty: 10, status: "ok" },
    { outlet: "Bonwire", size: "14.5kg", qty: 16, status: "ok" },
    { outlet: "Bogoso", size: "3kg", qty: 11, status: "ok" },
    { outlet: "Bogoso", size: "6kg", qty: 8, status: "low" },
    { outlet: "Bogoso", size: "13kg", qty: 15, status: "ok" },
    { outlet: "Bogoso", size: "14.5kg", qty: 19, status: "ok" },
    { outlet: "Prestea", size: "3kg", qty: 13, status: "ok" },
    { outlet: "Prestea", size: "6kg", qty: 10, status: "ok" },
    { outlet: "Prestea", size: "13kg", qty: 3, status: "critical" },
    { outlet: "Prestea", size: "14.5kg", qty: 21, status: "ok" }
  ],
  inspections: [
    { id: "i1", time: "2026-07-27 08:15", outlet: "Accra", item: "Bulk tank #04", inspector: "Efua Owusu", result: "due", nextDue: "2026-07-28" },
    { id: "i2", time: "2026-07-25 10:00", outlet: "Antoa", item: "Forecourt hose set", inspector: "Yaw Boateng", result: "pass", nextDue: "2026-08-25" },
    { id: "i3", time: "2026-07-20 09:00", outlet: "Prestea", item: "Regulator bank", inspector: "Adjoa Mensah", result: "overdue", nextDue: "2026-07-24" }
  ],
  shiftNotes: [
    { id: "n1", time: "2026-07-27 08:52", outlet: "Accra", staff: "Kwame A.", note: "Low stock on 6kg — reorder before Friday." },
    { id: "n2", time: "2026-07-26 17:10", outlet: "Bonwire", staff: "Abena Osei", note: "Customer complained about slow refill line at peak hours — may need a second attendant on Saturdays." }
  ],
  presence: [
    { id: "p1", time: "2026-07-27 07:38", outlet: "Accra", worker: "Kojo Mensah", confidence: 96, status: "confirmed" },
    { id: "p2", time: "2026-07-27 08:05", outlet: "Antoa", worker: "Yaw Boateng", confidence: 91, status: "confirmed" },
    { id: "p3", time: "2026-07-27 08:47", outlet: "Bogoso", worker: "Unknown", confidence: 54, status: "review" }
  ],
  cameras: [
    { name: "Accra-Forecourt", outlet: "Accra", status: "online" },
    { name: "Antoa-Forecourt", outlet: "Antoa", status: "online" },
    { name: "Bonwire-Forecourt", outlet: "Bonwire", status: "offline" },
    { name: "Bogoso-Forecourt", outlet: "Bogoso", status: "online" },
    { name: "Prestea-Forecourt", outlet: "Prestea", status: "online" }
  ],
  compliance: {
    dpcRegistered: true,
    dpcRegNo: "DPC-GH-2026-8891",
    dpiaComplete: true,
    dpiaDate: "2026-06-10",
    rawVideoRetentionDays: 30,
    matchMetadataRetentionDays: 180
  },
  dsRequests: [
    { id: "r1", time: "2026-07-15 11:20", staff: "Abena Osei", type: "access", status: "resolved", note: "Requested a copy of her presence log history." },
    { id: "r2", time: "2026-07-22 09:05", staff: "Adjoa Mensah", type: "deletion", status: "open", note: "Requested deletion of biometric enrollment after consent revoked." }
  ],
  purchases: []
};

// Database persistence wrapper
class DatabaseStore {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const seeded = JSON.parse(JSON.stringify(SEED_DATA));
        const merged = { ...seeded, ...parsed };
        if (!Array.isArray(merged.purchases)) merged.purchases = [];
        this.save(merged);
        return merged;
      }
    } catch (err) {
      console.error("Error loading database file, re-initializing:", err);
    }
    this.save(SEED_DATA);
    return JSON.parse(JSON.stringify(SEED_DATA));
  }

  save(data = this.data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error("Error saving database file:", err);
    }
  }

  getAll() {
    return this.data;
  }

  addDelivery(delivery) {
    this.data.deliveries.push(delivery);
    this.save();
    return delivery;
  }

  adjustInventory(outlet, size, delta) {
    const row = this.data.inventory.find(i => i.outlet === outlet && i.size === size);
    const qty = Math.max(0, delta);
    const statusForQty = q => q <= 5 ? "critical" : q <= 12 ? "low" : "ok";

    if (row) {
      row.qty = Math.max(0, row.qty + delta);
      row.status = statusForQty(row.qty);
      this.save();
      return row;
    }

    const newQty = qty;
    const newRow = { outlet, size, qty: newQty, status: statusForQty(newQty) };
    this.data.inventory.push(newRow);
    this.save();
    return newRow;
  }

  addInspection(inspection) {
    this.data.inspections.push(inspection);
    this.save();
    return inspection;
  }

  addShiftNote(note) {
    this.data.shiftNotes.push(note);
    this.save();
    return note;
  }

  addStaff(staffMember) {
    this.data.staff.push(staffMember);
    this.save();
    return staffMember;
  }

  addPresence(event) {
    this.data.presence.push(event);
    this.save();
    return event;
  }

  updateCompliance(settings) {
    this.data.compliance = { ...this.data.compliance, ...settings };
    this.save();
    return this.data.compliance;
  }

  addDsRequest(request) {
    this.data.dsRequests.push(request);
    this.save();
    return request;
  }
 
  resolvePurchaseSize(item) {
    if (!item) return null;
    const normalized = item.toLowerCase().replace(/\s+/g, '');
    if (normalized.includes('14.5kg') || normalized.includes('14.5')) return '14.5kg';
    if (normalized.includes('13kg') || normalized.includes('13')) return '13kg';
    if (normalized.includes('6kg') || normalized.includes('6')) return '6kg';
    if (normalized.includes('3kg') || normalized.includes('3')) return '3kg';
    return null;
  }
 
  addPurchase(purchase) {
    this.data.purchases.push(purchase);
    const size = this.resolvePurchaseSize(purchase.item);
    if (size) {
      this.adjustInventory(purchase.outlet, size, -purchase.qty);
    }
    this.save();
    return purchase;
  }
 
  resolveDsRequest(id) {
    const req = this.data.dsRequests.find(r => r.id === id);
    if (req) {
      req.status = "resolved";
      this.save();
      return req;
    }
    return null;
  }
}

module.exports = new DatabaseStore();
