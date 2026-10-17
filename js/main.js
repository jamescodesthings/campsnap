import { initTheme } from './theme.js';
import { initTracker } from './tracker.js';
import { initArchive, DESK } from './archive.js';

initTheme();
initTracker();
initArchive();

// The hero's two crops show different bands (5 on the stack, 8 on the desk), so its alt follows the crop on show.
const heroImg = document.querySelector('.hero__img[data-desk-alt]');
if (heroImg) {
  const stackAlt = heroImg.alt;
  const deskQuery = window.matchMedia(DESK);
  const syncAlt = () => {
    heroImg.alt = deskQuery.matches ? heroImg.dataset.deskAlt : stackAlt;
  };
  syncAlt();
  deskQuery.addEventListener('change', syncAlt);
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
