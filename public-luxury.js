(function(){
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  function revealElements(){
    const elements = Array.from(document.querySelectorAll('section, .hero-inner, .page-hero-inner, .section-head, .card, .prod-card, .surface, .feature-card, .safety-card, .photo-frame, .quote, .trust-strip, .site-footer'));
    elements.forEach((el, index) => {
      if (!el.classList.contains('reveal')) {
        el.classList.add('reveal');
      }
      if (el.classList.contains('hero-inner') || el.classList.contains('page-hero-inner')) {
        el.classList.add('reveal-delay-1');
      }
      if (el.classList.contains('section-head')) {
        el.classList.add('reveal-delay-2');
      }
      if (index % 2 === 0) {
        el.classList.add('reveal-delay-3');
      }
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add('in-view');
      }
    });
  }

  function onScroll(){
    document.querySelectorAll('.reveal').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add('in-view');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      revealElements();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      requestAnimationFrame(onScroll);
    });
  } else {
    revealElements();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    requestAnimationFrame(onScroll);
  }
})();
