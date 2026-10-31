/* Triple A Gas — live station status on station cards.
   Reads the public stations/{id} documents managers update in the staff
   portal (Stations page). Station cards carry data-station-id (the
   company-info.js id) and a .stock-badge element. Needs js/tag-common.js. */

window.STOCK = {
  _status: {}, // keyed by company-info.js station id

  getStock(stationId) {
    const s = this._status[stationId];
    if (!s) return { label: "Call to check", badgeClass: "hazard", note: "Call the station to confirm availability." };
    if (s.open === false || s.status === "closed")
      return { label: "Closed now", badgeClass: "danger", note: s.note || "This station is closed right now." };
    if (s.status === "limited")
      return { label: "Limited stock", badgeClass: "hazard", note: s.note || "Some sizes may be unavailable." };
    return { label: "Open · in stock", badgeClass: "safe", note: s.note || s.hours || "" };
  },

  async fetchStock() {
    if (!window.TAG) return;
    try {
      const { db } = window.TAG.init();
      const snap = await db.collection("stations").get();
      snap.forEach((doc) => {
        const outlet = window.TAG.OUTLETS.find((o) => o.id === doc.id);
        if (outlet) this._status[outlet.site] = doc.data();
      });
    } catch (err) {
      // Badges keep their "Call to check" default.
    }
  },

  renderBadges() {
    document.querySelectorAll("[data-station-id]").forEach((el) => {
      const stock = this.getStock(parseInt(el.dataset.stationId, 10));
      const badgeEl = el.querySelector(".stock-badge");
      if (badgeEl) {
        badgeEl.className = `stock-badge badge badge-${stock.badgeClass}`;
        badgeEl.textContent = stock.label;
        badgeEl.title = stock.note;
      }
      const noteEl = el.querySelector(".stock-note");
      if (noteEl) noteEl.textContent = stock.note;
    });
  },

  init() {
    this.fetchStock().then(() => this.renderBadges());
    // Station cards are re-rendered by search and filters; keep badges current.
    ["station-grid", "station-teaser"].forEach((id) => {
      const grid = document.getElementById(id);
      if (grid) new MutationObserver(() => this.renderBadges()).observe(grid, { childList: true });
    });
  },
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => window.STOCK.init());
} else {
  window.STOCK.init();
}
