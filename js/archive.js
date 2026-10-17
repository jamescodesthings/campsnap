// The archive: on the desk layout the index and the 23 filters become a tabs pattern, flipped one filter at a time
// (design review 2.5). On the stack nothing here changes the markup: the filters are a vertical scroll. Without this
// script the desk shows every filter as its own full-height panel, and every link still works.

export const DESK = '(orientation: landscape) and (min-width: 900px) and (min-height: 560px)';

const FADE_MS = 240;

// A malformed hash (a stray %) must never stop the page's script.
function slugFromHash(hash) {
  const raw = (hash || '').slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isEditable(el) {
  return Boolean(el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

export function initArchive(win = window) {
  const doc = win.document;
  const archive = doc.querySelector('.archive');
  if (!archive) return null;
  const stage = archive.querySelector('.stage');
  const list = archive.querySelector('.index__list');
  const panels = [...stage.querySelectorAll('.filter')];
  const tabs = [...list.querySelectorAll('.index__link')];
  const status = archive.querySelector('[data-archive-status]');
  if (!panels.length || panels.length !== tabs.length) return null;

  const desk = win.matchMedia(DESK);
  const portrait = win.matchMedia('(orientation: portrait)');
  const reduce = win.matchMedia('(prefers-reduced-motion: reduce)');
  const motionOff = () => {
    const pref = doc.documentElement.getAttribute('data-motion');
    return pref === 'reduce' || (pref !== 'full' && reduce.matches);
  };

  let active = 0;
  let carousel = false;
  // Which filter the reader last reached, and whether they are reading one right now (a panel, or the desk's stage,
  // crosses a line 40% down the screen). Kept up to date on both layouts, so a rotation or a resize across the
  // switch puts the same filter back in view, and leaves the page alone when the reader is anywhere else (the
  // contact sheet, the hero).
  let current = 0;
  let onPanel = false;
  let onIndex = false;
  const leaving = new Map();

  const indexOfSlug = slug => panels.findIndex(p => p.id === slug);

  function keyImage(panel) {
    return panel.querySelector('.filter__key');
  }

  function preload(i) {
    const img = keyImage(panels[i] || {});
    if (!img) return;
    const pre = new win.Image();
    pre.decoding = 'async';
    pre.sizes = img.getAttribute('sizes') || '';
    pre.srcset = img.getAttribute('srcset') || '';
    pre.src = img.getAttribute('src');
  }

  function preloadNeighbours(i) {
    const idle = win.requestIdleCallback || (fn => win.setTimeout(fn, 200));
    idle(() => {
      if (i > 0) preload(i - 1);
      if (i < panels.length - 1) preload(i + 1);
    });
  }

  function keepTabInView(tab) {
    // Scroll only the index column, never the page.
    const top = tab.offsetTop - list.offsetTop;
    const bottom = top + tab.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  function select(i, { animate = true, hash = true, announce = true } = {}) {
    if (i < 0 || i >= panels.length) return;
    const prev = panels[active];
    const next = panels[i];
    if (carousel && prev !== next && animate && !motionOff()) {
      prev.classList.add('is-leaving');
      win.clearTimeout(leaving.get(prev));
      leaving.set(prev, win.setTimeout(() => prev.classList.remove('is-leaving'), FADE_MS + 20));
      next.classList.add('is-entering');
      win.setTimeout(() => next.classList.remove('is-entering'), FADE_MS + 20);
    }
    prev.classList.remove('is-active');
    next.classList.add('is-active');
    active = i;
    current = i;
    tabs.forEach((tab, k) => {
      const on = k === i;
      tab.classList.toggle('is-current', on);
      if (carousel) {
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      }
    });
    if (!carousel) return;
    const img = keyImage(next);
    if (img) img.loading = 'eager';
    keepTabInView(tabs[i]);
    if (hash && win.history?.replaceState) win.history.replaceState(null, '', `#${next.id}`);
    if (announce && status) {
      const name = next.querySelector('.filter__name')?.textContent.replace(/^\s*\d+\.\s*/, '').trim();
      status.textContent = `Filter ${i + 1} of ${panels.length}, ${name}`;
    }
    preloadNeighbours(i);
  }

  // Swap a sample photo (or the mountain) into the panel's main frame; the first thumb is the key photo.
  function showFrame(panel, link) {
    const img = keyImage(panel);
    if (!img || !link) return;
    if (img.getAttribute('src') !== link.getAttribute('href')) {
      img.loading = 'eager';
      img.sizes = link.dataset.sizes;
      img.srcset = link.dataset.srcset;
      img.src = link.getAttribute('href');
      img.width = Number(link.dataset.width);
      img.height = Number(link.dataset.height);
    }
    panel.querySelectorAll('a.frame').forEach(a => {
      const on = a === link;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  function enable() {
    carousel = true;
    archive.setAttribute('data-carousel', '');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-orientation', 'vertical');
    list.setAttribute('aria-label', 'Filters');
    tabs.forEach((tab, k) => {
      tab.parentElement.setAttribute('role', 'presentation');
      tab.setAttribute('role', 'tab');
      tab.id = `tab-${panels[k].id}`;
      tab.setAttribute('aria-controls', panels[k].id);
    });
    panels.forEach((panel, k) => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `tab-${panels[k].id}`);
      // There's room on the desk, so the notes start open; a reader's own choice is left alone.
      const notes = panel.querySelector('details.notes');
      if (notes && !notes.open && !notes.hasAttribute('data-touched')) {
        notes.open = true;
        notes.setAttribute('data-auto-open', '');
      }
    });
    select(current, { animate: false, hash: false, announce: false });
  }

  function disable() {
    carousel = false;
    archive.removeAttribute('data-carousel');
    for (const attr of ['role', 'aria-orientation', 'aria-label']) list.removeAttribute(attr);
    tabs.forEach((tab, k) => {
      tab.parentElement.removeAttribute('role');
      for (const attr of ['role', 'id', 'aria-controls', 'aria-selected', 'tabindex']) tab.removeAttribute(attr);
      tab.classList.remove('is-current');
      const panel = panels[k];
      panel.classList.remove('is-active', 'is-leaving', 'is-entering');
      panel.removeAttribute('role');
      panel.setAttribute('aria-labelledby', `${panel.id}-title`);
      // The stack shows the key photo only, so put it back.
      const first = panel.querySelector('a.frame');
      if (first && !first.classList.contains('is-current')) showFrame(panel, first);
      const notes = panel.querySelector('details.notes[data-auto-open]');
      if (notes) {
        notes.open = false;
        notes.removeAttribute('data-auto-open');
      }
    });
  }

  const crossesLine = (el, line) => {
    const r = el.getBoundingClientRect();
    return r.top <= line && r.bottom > line;
  };

  // Where the reader is. Stack: the filter crossing the line, or none. Desk: whether the stage crosses it.
  // The stack's contact sheet is the desk's index column, so a reader on it stays on it across the switch.
  const index = archive.querySelector('.index');

  function track() {
    const line = win.innerHeight * 0.4;
    if (carousel) {
      onPanel = crossesLine(stage, line);
      onIndex = false;
      return;
    }
    const found = panels.findIndex(p => crossesLine(p, line));
    onPanel = found >= 0;
    onIndex = !onPanel && Boolean(index) && crossesLine(index, line);
    if (onPanel) current = found;
  }

  let frame = 0;
  win.addEventListener(
    'scroll',
    () => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(track);
    },
    { passive: true },
  );

  // Only ever moves the page when the reader was on a filter, or (across the switch) on the contact sheet.
  function bringBack(switched = false) {
    let target = null;
    if (onPanel) target = carousel ? archive : panels[current];
    else if (onIndex && switched && carousel) target = archive;
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function applyLayout() {
    const wasOn = onPanel;
    const wasIndex = onIndex;
    if (desk.matches && !carousel) enable();
    else if (!desk.matches && carousel) disable();
    const restore = () => {
      onPanel = wasOn;
      onIndex = wasIndex;
      bringBack(true);
    };
    restore();
    // Once more after the new layout has settled (scroll snapping and late reflow can nudge it).
    win.requestAnimationFrame(() => win.requestAnimationFrame(restore));
  }

  desk.addEventListener('change', applyLayout);
  // Turning a phone or tablet without crossing the switch still reflows every unit.
  portrait.addEventListener('change', () => win.requestAnimationFrame(() => bringBack()));

  // Tabs: a click selects; arrows move focus along the list; Enter or Space select.
  list.addEventListener('click', event => {
    if (!carousel) return;
    const tab = event.target.closest('.index__link');
    if (!tab) return;
    event.preventDefault();
    select(tabs.indexOf(tab));
  });

  list.addEventListener('keydown', event => {
    if (!carousel) return;
    const tab = event.target.closest('.index__link');
    if (!tab) return;
    const at = tabs.indexOf(tab);
    let to = -1;
    if (event.key === 'ArrowDown') to = Math.min(at + 1, tabs.length - 1);
    else if (event.key === 'ArrowUp') to = Math.max(at - 1, 0);
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = tabs.length - 1;
    else if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      select(at);
      return;
    } else return;
    event.preventDefault();
    tabs.forEach((t, k) => (t.tabIndex = k === to ? 0 : -1));
    tabs[to].focus();
    keepTabInView(tabs[to]);
  });

  // Leaving the list with focus on a tab that isn't selected: Tab back in lands on the selected one.
  list.addEventListener('focusout', event => {
    if (!carousel || list.contains(event.relatedTarget)) return;
    tabs.forEach((t, k) => (t.tabIndex = k === active ? 0 : -1));
  });

  // Left and Right anywhere in the archive flip to the previous or next filter.
  archive.addEventListener('keydown', event => {
    if (!carousel || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditable(event.target)) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const to = active + (event.key === 'ArrowRight' ? 1 : -1);
    if (to < 0 || to >= panels.length) return;
    event.preventDefault();
    const fromTab = event.target.closest?.('.index__link');
    select(to);
    if (fromTab) tabs[to].focus();
  });

  // Previous and Next: anchors without the script, a flip with it. Focus follows to the same control.
  stage.addEventListener('click', event => {
    const pager = event.target.closest('a[data-step]');
    if (pager && carousel) {
      event.preventDefault();
      const step = Number(pager.dataset.step);
      select(active + step);
      const again = panels[active].querySelector(`a[data-step="${step}"]`) || panels[active].querySelector('a[data-step]');
      again?.focus();
      return;
    }
    const frameLink = event.target.closest('a.frame');
    if (frameLink && carousel) {
      event.preventDefault();
      showFrame(frameLink.closest('.filter'), frameLink);
    }
  });

  // A reader who opens or closes the notes has decided; the layout switch leaves them as they are.
  panels.forEach(panel => {
    panel.querySelector('details.notes > summary')?.addEventListener('click', () => {
      const notes = panel.querySelector('details.notes');
      notes.setAttribute('data-touched', '');
      notes.removeAttribute('data-auto-open');
    });
  });

  // Any link to a filter (the hero's band numbers, a shared URL) flips the archive to it.
  win.addEventListener('hashchange', () => {
    const i = indexOfSlug(slugFromHash(win.location.hash));
    if (i < 0) return;
    current = i;
    if (!carousel) return;
    select(i, { hash: false });
    archive.scrollIntoView({ block: 'start', behavior: motionOff() ? 'instant' : 'smooth' });
  });

  const fromHash = indexOfSlug(slugFromHash(win.location.hash));
  if (fromHash >= 0) current = fromHash;
  track();
  if (desk.matches) {
    enable();
    if (fromHash >= 0) archive.scrollIntoView({ block: 'start', behavior: 'instant' });
    track();
  }

  return {
    get active() {
      return active;
    },
    select,
  };
}
