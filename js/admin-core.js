/**
 * Triple A Gas Admin Portal - Core State & Utilities (js/admin-core.js)
 */

let currentUser = null;
let chartInstances = {};

function getDefaultDB() {
  return {
    staff:[], deliveries:[], inventory:[], inspections:[],
    shiftNotes:[], presence:[], cameras:[], compliance:{}, dsRequests:[], purchases:[],
    expenses:[], vehicles:[], trips:[], maintenance:[],
    customers:[], orders:[], suppliers:[], purchaseOrders:[],
    stockCounts:[], enquiries:[], stationStatuses:{},
    payroll:[
      {id:'pay1',staffId:'s1',staffName:'Kofi Asante',month:'2026-07',outlet:'Accra',baseSalary:1200,bonus:150,deductions:80,netPay:1270,paid:true,paidDate:'2026-07-28'},
      {id:'pay2',staffId:'s2',staffName:'Ama Owusu',month:'2026-07',outlet:'Antoa',baseSalary:950,bonus:0,deductions:50,netPay:900,paid:false,paidDate:''},
      {id:'pay3',staffId:'s3',staffName:'Kwame Boateng',month:'2026-07',outlet:'Accra',baseSalary:1500,bonus:200,deductions:100,netPay:1600,paid:true,paidDate:'2026-07-27'}
    ],
    licences:[],
    pricing:{'3kg':43.50,'6kg':87.00,'13kg':188.50,'14.5kg':210.25,'autogas':11.80,'bulk_per_kg':14.50},
    operationsTasks:[
      {id:'task1',outlet:'Accra',title:'Camera offline',severity:'high',owner:'Efua Owusu',due:'2026-07-30',notes:'Check network at forecourt',status:'open'},
      {id:'task2',outlet:'Prestea',title:'Low stock on 13kg',severity:'medium',owner:'Adjoa Mensah',due:'2026-07-31',notes:'Priority restock',status:'in_progress'}
    ],
    handoverSummaries:[],
    approvals:[
      {id:'apr-demo',outlet:'Bonwire',requestType:'expense',title:'Emergency fuel top-up',requestedBy:'Abena Osei',priority:'high',amount:350,notes:'Needed for urgent deliveries',status:'pending',createdAt:'2026-07-30 08:00'}
    ],
    auditTrail:[
      {id:'audit-demo',time:'2026-07-30 08:00',actor:'HQ Ops',action:'approval queued',target:'Emergency fuel top-up',detail:'Bonwire · expense'}
    ],
    offlineCaptures:[
      {id:'capture-demo',outlet:'Bogoso',captureType:'stock',notes:'Captured closing counts while network was weak',createdAt:'2026-07-30 07:45',status:'pending'}
    ],
    sopChecklists:[
      {id:'sop-demo',template:'opening',items:['Open tills','Verify stock counts','Check pump readiness'],notes:'Opening checklist completed',status:'complete',createdAt:'2026-07-30 06:30'}
    ],
    attachments:[
      {id:'att-demo',title:'Photo evidence',relatedTo:'Inspection',fileName:'IMG_0832.jpg',owner:'Efua',notes:'Captured after regulator check',createdAt:'2026-07-30 07:20'}
    ],
    routeFeeds:[
      {id:'route-demo',driver:'Kojo Mensah',outlet:'Accra',route:'East Legon loop',status:'en_route',eta:'15 mins',createdAt:'2026-07-30 07:50'}
    ],
    dailyReports:[],
    aiSummaries:[],
    kioskMode:{enabled:false}
  };
}

let DB = getDefaultDB();

// ── Persistence ──────────────────────────────────────────
function saveToLocal() {
  try { localStorage.setItem('tAG_db', JSON.stringify(DB)); } catch(e){}
}
function loadFromLocal() {
  try {
    const s = localStorage.getItem('tAG_db');
    if (s) {
      const p = JSON.parse(s);
      DB = { ...getDefaultDB(), ...p };
      if (!Array.isArray(DB.operationsTasks)) DB.operationsTasks = getDefaultDB().operationsTasks;
      if (!Array.isArray(DB.handoverSummaries)) DB.handoverSummaries = getDefaultDB().handoverSummaries;
      if (!Array.isArray(DB.approvals)) DB.approvals = getDefaultDB().approvals;
      if (!Array.isArray(DB.auditTrail)) DB.auditTrail = getDefaultDB().auditTrail;
      if (!Array.isArray(DB.offlineCaptures)) DB.offlineCaptures = getDefaultDB().offlineCaptures;
      if (!Array.isArray(DB.sopChecklists)) DB.sopChecklists = getDefaultDB().sopChecklists;
      if (!Array.isArray(DB.attachments)) DB.attachments = getDefaultDB().attachments;
      if (!Array.isArray(DB.routeFeeds)) DB.routeFeeds = getDefaultDB().routeFeeds;
      if (!Array.isArray(DB.dailyReports)) DB.dailyReports = getDefaultDB().dailyReports;
      if (!Array.isArray(DB.aiSummaries)) DB.aiSummaries = getDefaultDB().aiSummaries;
      if (!DB.kioskMode) DB.kioskMode = getDefaultDB().kioskMode;
    }
  } catch(e){}
}

function ensureDashboardCollections(){
  if (!Array.isArray(DB.operationsTasks)) DB.operationsTasks = [];
  if (!Array.isArray(DB.handoverSummaries)) DB.handoverSummaries = [];
  if (!Array.isArray(DB.approvals)) DB.approvals = [];
  if (!Array.isArray(DB.auditTrail)) DB.auditTrail = [];
  if (!Array.isArray(DB.offlineCaptures)) DB.offlineCaptures = [];
  if (!Array.isArray(DB.sopChecklists)) DB.sopChecklists = [];
  if (!Array.isArray(DB.attachments)) DB.attachments = [];
  if (!Array.isArray(DB.routeFeeds)) DB.routeFeeds = [];
  if (!Array.isArray(DB.dailyReports)) DB.dailyReports = [];
  if (!Array.isArray(DB.aiSummaries)) DB.aiSummaries = [];
  if (!DB.kioskMode) DB.kioskMode = {enabled:false};
}

// ── Helpers ───────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function badge(k,l){ const m={safe:'badge-safe',warn:'badge-warn',danger:'badge-danger',neutral:'badge-neutral',gold:'badge-gold'}; return `<span class="badge ${m[k]||'badge-neutral'}">${esc(l)}</span>`; }
function opts(arr,sel){ return arr.map(v=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(v)}</option>`).join(''); }

function toast(msg,k='safe'){
  const el=document.getElementById('toast');
  if(!el) return;
  const dot = el.querySelector('.dot');
  if(dot) dot.style.background = k==='safe'?'var(--safe)':k==='warn'?'var(--warn)':'var(--danger)';
  const msgEl = el.querySelector('.msg');
  if(msgEl) msgEl.textContent=msg;
  el.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>el.classList.remove('show'),3000);
}

function gaugeSVG(pct,color){
  const r=30,c=2*Math.PI*r,off=c-(Math.min(100,Math.max(0,pct))/100)*c;
  return `<svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/><circle cx="37" cy="37" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 37 37)"/></svg>`;
}

function scopedOutlet(){ return currentUser&&currentUser.role!=='Owner / Head Office'&&currentUser.role!=='COO'?currentUser.outlet:null; }
function isFinanceRole(){ return currentUser&&(currentUser.role==='Owner / Head Office'||currentUser.role==='COO'); }
function now(){ return new Date().toISOString().slice(0,16).replace('T',' '); }
function uid(pfx){ return `${pfx}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
function gh(n){ return 'GH₵'+Number(n||0).toFixed(2); }

function daysUntil(dateStr){
  if(!dateStr) return 9999;
  const d=new Date(dateStr), t=new Date();
  t.setHours(0,0,0,0); d.setHours(0,0,0,0);
  return Math.round((d-t)/(1000*60*60*24));
}

function exportCSV(data,filename){
  if(!data||!data.length){toast('No data to export','warn');return;}
  const keys=Object.keys(data[0]);
  const csv=[keys.join(','),...data.map(r=>keys.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  URL.revokeObjectURL(url);
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay') || document.getElementById('overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
}

function checkMobile() {
  const tb = document.getElementById('mobileTopbar');
  if (tb) tb.style.display = window.innerWidth <= 900 ? 'flex' : 'none';
}
window.addEventListener('resize', checkMobile);
document.addEventListener('DOMContentLoaded', checkMobile);

function getMonthRevenue(purchases, monthOffset) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0);
  return (purchases||[]).filter(p => {
    const d = new Date(p.time || p.date || 0);
    return d >= target && d <= end;
  }).reduce((sum, p) => sum + (Number(p.amount)||0), 0);
}

function trendBadge(current, previous) {
  if (!previous) return '';
  const pct = ((current - previous) / previous * 100).toFixed(1);
  const up = current >= previous;
  return `<span style="font-size:11px;font-family:var(--mono);margin-left:8px;color:${up?'var(--safe)':'var(--danger)'}">${up?'↑':'↓'} ${Math.abs(pct)}%</span>`;
}

// ── Chart helpers ─────────────────────────────────────────
function makeChart(id,type,labels,datasets,opts={}){
  if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; }
  const canvas=document.getElementById(id);
  if(!canvas)return;
  chartInstances[id]=new Chart(canvas,{
    type,
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#9aa5ad',font:{family:'IBM Plex Mono',size:11}}}},scales:type==='doughnut'?{}:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#9aa5ad',font:{family:'IBM Plex Mono',size:11}}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#9aa5ad',font:{family:'IBM Plex Mono',size:11}}}},...opts}
  });
}

// ── Date range filtering ──────────────────────────────────
function filterByRange(arr, range, dateField='time'){
  const now=new Date(), start=new Date();
  if(range==='today'){start.setHours(0,0,0,0);}
  else if(range==='week'){start.setDate(now.getDate()-7);}
  else if(range==='month'){start.setDate(1);start.setHours(0,0,0,0);}
  else return arr;
  return arr.filter(x=>{
    const d=x[dateField]||x.date||x.time||'';
    return new Date(d)>=start;
  });
}

// ── Theme Manager ─────────────────────────────────────────
const ThemeManager = {
  themeKey: 'tag_theme',

  init() {
    const saved = localStorage.getItem(this.themeKey);
    if (saved === 'light') {
      document.body.classList.add('light-theme');
    }
  },

  toggle() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem(this.themeKey, isLight ? 'light' : 'dark');
    toast(`Switched to ${isLight ? 'Light' : 'Dark'} Mode`, 'safe');
  }
};

document.addEventListener('DOMContentLoaded', () => ThemeManager.init());

// ── Record Audit Trail ────────────────────────────────────
function recordAudit(action, target, detail, actor = currentUser?.name || 'System') {
  if (!DB.auditTrail) DB.auditTrail = [];
  const entry = { id: uid('audit'), time: now(), actor, action, target, detail };
  DB.auditTrail.push(entry);
  saveToLocal();

  // Also send to backend
  if (typeof AdminAPI !== 'undefined' && AdminAPI.apiFetch) {
    AdminAPI.apiFetch('/api/audit-logs', 'POST', entry);
  }
  return entry;
}

// ── Fetch DB ─────────────────────────────────────────────
async function fetchDatabase(){
  try {
    const r = await AdminAPI.apiFetch('/api/data');
    if (r.ok && r.data && r.data.success && r.data.data) {
      DB = { ...getDefaultDB(), ...DB, ...r.data.data };
      if (typeof renderAll === 'function') renderAll();
      return;
    }
  } catch(e) {
    console.warn('API unavailable, falling back to local');
  }
  if (typeof syncFirestoreData === 'function') {
    const ok = await syncFirestoreData(d => {
      DB = { ...getDefaultDB(), ...DB, ...d };
      if (typeof renderAll === 'function') renderAll();
    });
    if (ok) return;
  }
  if (typeof renderAll === 'function') renderAll();
}
