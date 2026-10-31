/* Triple A Gas — live prices on public pages.
   [data-live-price="14.5kg"]  → refill price for that cylinder size
   [data-live-perkg-line]      → "LPG today: GH₵ x/kg" line (shown once loaded)
   Prices come from the staff portal (Pricing). Needs js/tag-common.js. */
(function () {
  if (!window.TAG) return;
  const T = window.TAG;
  async function apply() {
    const sizeEls = document.querySelectorAll("[data-live-price]");
    const lineEls = document.querySelectorAll("[data-live-perkg-line]");
    if (!sizeEls.length && !lineEls.length) return;
    const p = await T.loadPricing();
    if (!p.live) return; // keep the page's own text if prices are unavailable
    sizeEls.forEach((el) => {
      const kg = parseFloat(el.dataset.livePrice);
      if (kg) el.textContent = `${T.money(kg * p.perKg)} refill`;
    });
    lineEls.forEach((el) => {
      el.textContent = `LPG today: ${T.money(p.perKg)}/kg · pay at the cashier, fill at the pump.`;
      el.hidden = false;
    });
  }
  function start() {
    apply();
    // Links like index.html#order open the order form straight away.
    if (location.hash === "#order" && typeof window.openPublicOrderModal === "function") window.openPublicOrderModal();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
