import { initTheme } from './theme.js';
import { initTracker } from './tracker.js';

initTheme();
initTracker();

// A preview strip scrolls sideways only on narrow screens. There it becomes a labelled, focusable region so a
// keyboard can scroll it; where it fits, it stays out of the tab order. Touch scrolling needs none of this.
const strips = [...document.querySelectorAll('.strip')];
function syncStrips() {
  for (const strip of strips) {
    if (strip.scrollWidth > strip.clientWidth + 1) {
      strip.setAttribute('tabindex', '0');
      strip.setAttribute('role', 'region');
      strip.setAttribute('aria-label', strip.dataset.label || 'Sample shots, scrolls sideways');
    } else {
      strip.removeAttribute('tabindex');
      strip.removeAttribute('role');
      strip.removeAttribute('aria-label');
    }
  }
}
if (strips.length) {
  syncStrips();
  let frame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(syncStrips);
  });
  // Images are lazy, but width and height are set, so the layout is final before they load; this is a backstop.
  window.addEventListener('load', syncStrips);
}

// Phone nav collapses into a <details> menu; from 768px it sits inline. As base-website src/js/main.js.
const menu = document.querySelector('.site-menu');
if (menu) {
  const wide = window.matchMedia('(min-width: 768px)');
  const sync = () => {
    if (wide.matches) {
      menu.open = true;
      menu.setAttribute('data-inline', '');
    } else {
      menu.open = false;
      menu.removeAttribute('data-inline');
    }
  };
  sync();
  wide.addEventListener('change', sync);

  menu.addEventListener('click', event => {
    if (!wide.matches && event.target.closest('a')) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !wide.matches && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
}
