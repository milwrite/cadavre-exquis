/* Keep the writing edge inside the visible phone viewport. Never reopen a
 * dismissed keyboard, and leave pinch zoom and manual scrolling available. */
(function () {
  const root = document.documentElement;
  const phone = matchMedia('(max-width: 48rem)');
  const viewport = window.visualViewport;
  let frame = 0;

  function reveal(field) {
    if (!phone.matches || !field || document.activeElement !== field) return;
    requestAnimationFrame(() => {
      const top = viewport?.offsetTop || 0;
      const height = viewport?.height || window.innerHeight;
      const box = field.getBoundingClientRect();
      const bottom = top + height - 48;
      const scroller = field.closest('#panel') || window;
      if (box.bottom > bottom) scroller.scrollBy(0, box.bottom - bottom);
      else if (box.top < top + 60) scroller.scrollBy(0, box.top - top - 60);
    });
  }

  function update() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // A pinch gesture changes visualViewport.height too; do not mistake it
      // for the software keyboard or resize the poem during the gesture.
      if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
      const height = viewport?.height || window.innerHeight;
      root.style.setProperty('--visual-height', height + 'px');
      const field = document.activeElement;
      const editing = field?.matches('input:not([type=checkbox]):not([type=range]), textarea');
      const keyboard = phone.matches && editing && window.innerHeight - height > 120;
      root.toggleAttribute('data-keyboard-open', Boolean(keyboard));
      if (keyboard) reveal(field);
    });
  }

  window.CadavreViewport = {
    phone: () => phone.matches,
    focus(field) {
      if (!phone.matches) field?.focus({ preventScroll: true });
    },
    reveal,
  };
  viewport?.addEventListener('resize', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
})();
