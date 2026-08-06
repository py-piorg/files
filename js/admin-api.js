/**
 * Triple A Gas Admin Portal - API & Sync Module (js/admin-api.js)
 * Handles Auth Tokens, SSE Real-Time Sync, and Offline Transaction Queueing.
 */

const AdminAPI = {
  authTokenKey: 'tag_auth_token',

  getToken() {
    return localStorage.getItem(this.authTokenKey) || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem(this.authTokenKey, token);
    } else {
      localStorage.removeItem(this.authTokenKey);
    }
  },

  async apiFetch(url, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const result = await response.json();
      return { ok: response.ok, status: response.status, data: result };
    } catch (err) {
      console.warn(`[API] Fetch failed for ${url}:`, err);
      return { ok: false, offline: true, error: err.message };
    }
  },

  // ── Real-Time SSE Listener ──
  // On static / Netlify hosting the /api/events endpoint does not exist.
  // We probe with a HEAD request first and skip EventSource silently if 404.
  initSSE(onUpdateCallback) {
    if (!window.EventSource) return;
    fetch('/api/events', { method: 'HEAD' })
      .then(res => {
        if (!res.ok) return; // 404 on static host — skip silently
        try {
          const sse = new EventSource('/api/events');
          sse.onmessage = (e) => {
            try {
              const payload = JSON.parse(e.data);
              if (onUpdateCallback) onUpdateCallback(payload);
            } catch (err) {}
          };
          sse.addEventListener('db_update', () => {
            if (typeof fetchDatabase === 'function') fetchDatabase();
            if (typeof toast === 'function') toast('Live data synced', 'safe');
          });
          sse.onerror = () => { /* auto-reconnects */ };
        } catch (e) {
          // ignore
        }
      })
      .catch(() => { /* network offline — skip */ });
  },

  // ── Offline Queue Manager ──
  offlineQueueKey: 'tag_offline_queue',

  getQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.offlineQueueKey) || '[]');
    } catch (e) {
      return [];
    }
  },

  enqueue(type, data) {
    const q = this.getQueue();
    q.push({ id: `q_${Date.now()}_${Math.random().toString(36).substring(2,6)}`, type, data, time: new Date().toISOString() });
    localStorage.setItem(this.offlineQueueKey, JSON.stringify(q));
    if (typeof toast === 'function') toast('Offline: Transaction queued for sync', 'warn');
  },

  async syncOfflineQueue() {
    const q = this.getQueue();
    if (!q || !q.length) return;
    if (!navigator.onLine) return;

    console.log(`[OfflineQueue] Attempting sync of ${q.length} items...`);
    const res = await this.apiFetch('/api/sync/batch', 'POST', { items: q });
    if (res.ok && res.data && res.data.success) {
      localStorage.removeItem(this.offlineQueueKey);
      if (typeof toast === 'function') toast(`Synced ${res.data.count || q.length} offline transactions!`, 'safe');
      if (typeof fetchDatabase === 'function') fetchDatabase();
    }
  },

  initOfflineListeners() {
    window.addEventListener('online', () => {
      if (typeof toast === 'function') toast('Connection restored. Syncing offline data...', 'safe');
      this.syncOfflineQueue();
    });
    window.addEventListener('offline', () => {
      if (typeof toast === 'function') toast('Operating in Offline Mode', 'warn');
    });
  }
};

// Initialize listeners on load
document.addEventListener('DOMContentLoaded', () => {
  AdminAPI.initOfflineListeners();
  AdminAPI.initSSE();
  AdminAPI.syncOfflineQueue();
});
