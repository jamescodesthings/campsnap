// The filter tracker: the DOM side of tracker-core.js (design review 2.7). It records slot downloads and runs the
// "What's loaded" button and dialog, cloned from pages.ejs's #tracker-template into the header's .tracker-anchor.
// Without JavaScript there is no button, and every download link still saves under the name in its download attribute.
import { createStorage } from './storage.js';
import {
  STORAGE_KEY,
  SLOTS,
  parseState,
  serialiseState,
  recordDownload,
  setSlot,
  setAutoUpdate,
  findFilter,
  serialiseSlotsFile,
  parseSlotsFile,
} from './tracker-core.js';

const DESK = '(orientation: landscape) and (min-width: 900px) and (min-height: 560px)';
const MAX_FILE_BYTES = 16 * 1024;
const NOT_A_SLOTS_FILE = "That doesn't look like a slots file. Nothing changed.";
const NO_SLOT_LINES = 'No slot lines found in that file. Nothing changed.';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function importedMessage(count, ignored) {
  const lead = `Imported ${plural(count, 'slot')}.`;
  return ignored ? `${lead} Ignored ${plural(ignored, 'line')} it didn't recognise.` : lead;
}

export function initTracker(win = window) {
  const doc = win.document;
  // Storage that throws (Safari private mode) leaves state in memory for the session.
  const store = createStorage(win);
  let state = parseState(store.get(STORAGE_KEY));
  let ui = null;
  // Blocked when localStorage can't be reached at all, or once a write fails (quota, private mode). From then on
  // the slots live only in memory, and the dialog says so.
  let storageBlocked = false;
  try {
    win.localStorage.getItem(STORAGE_KEY);
  } catch {
    storageBlocked = true;
  }

  // Another tab may have changed the slots since this page loaded. Not while blocked: storage then holds an older
  // copy (or nothing) and would overwrite what's in memory.
  const reload = () => {
    if (storageBlocked) return;
    const saved = store.get(STORAGE_KEY);
    if (saved !== null) state = parseState(saved);
  };
  const save = () => {
    if (storageBlocked) return;
    if (!store.set(STORAGE_KEY, serialiseState(state))) storageBlocked = true;
  };

  // A slot button records its filter on that slot when Auto-update is on. The name-save link
  // (a[data-namesave]) implies no slot, so it never records.
  doc.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-filter][data-slot]');
    if (!link) return;
    const slot = SLOTS.find(s => s.id === link.dataset.slot);
    if (!slot) return;
    reload();
    if (!state.autoUpdate) return;
    state = recordDownload(state, slot.id, link.dataset.name || link.dataset.filter);
    save();
    ui?.render();
    win.dispatchEvent(new win.CustomEvent('campsnap:slots', { detail: { slot: slot.id, name: state.slots[slot.id] } }));
  });

  ui = mountUi(win, {
    get: () => state,
    blocked: () => storageBlocked,
    update(change) {
      reload();
      state = change(state);
      save();
    },
    reload,
  });

  win.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    reload();
    ui?.render();
  });

  return {
    get state() {
      return state;
    },
  };
}

function mountUi(win, store) {
  const doc = win.document;
  const template = doc.getElementById('tracker-template');
  const anchor = doc.querySelector('.tracker-anchor');
  if (!template || !anchor || typeof template.content === 'undefined') return null;
  anchor.append(template.content.cloneNode(true));

  const button = anchor.querySelector('.tracker-button');
  const dialog = anchor.querySelector('#tracker-dialog');
  if (!button || !dialog || typeof dialog.showModal !== 'function') {
    anchor.replaceChildren();
    return null;
  }

  let filters = [];
  try {
    filters = JSON.parse(doc.getElementById('filter-data')?.textContent || '[]');
  } catch {
    filters = [];
  }

  const $ = sel => dialog.querySelector(sel);
  const views = { main: $('[data-tracker-view="main"]'), settings: $('[data-tracker-view="settings"]') };
  const title = $('#tracker-title');
  const dot = button.querySelector('.tracker-button__dot');
  const auto = $('[data-tracker-auto]');
  const statusLine = $('[data-tracker-status]');
  const settingsButton = $('[data-tracker-settings]');
  const backButton = $('[data-tracker-back]');
  const actions = $('[data-tracker-actions]');
  const fileInput = $('[data-tracker-file]');
  const importButton = $('[data-tracker-import]');
  const clearButton = $('[data-tracker-clear]');
  const confirm = $('[data-tracker-confirm]');
  const preview = $('[data-tracker-preview]');
  const blockedLine = $('[data-tracker-blocked]');
  const rows = Object.fromEntries(SLOTS.map(s => [s.id, $(`[data-tracker-slot="${s.id}"]`)]));
  const desk = win.matchMedia(DESK);

  let editing = null;
  let pending = null;
  // Set when a filter link in the dialog closes it: focus then goes to that filter, not back to the button.
  let followed = null;

  function status(message) {
    statusLine.textContent = message;
  }

  function render() {
    const { slots, autoUpdate } = store.get();
    const count = SLOTS.filter(s => slots[s.id]).length;
    button.setAttribute('aria-label', `Filter tracker, ${count} of 4 slots set`);
    dot.hidden = count === 0;
    auto.checked = autoUpdate;
    blockedLine.hidden = !store.blocked();
    for (const s of SLOTS) {
      const value = rows[s.id].querySelector('[data-tracker-value]');
      const name = slots[s.id];
      const filter = name ? findFilter(filters, name) : null;
      let node;
      if (filter) {
        node = doc.createElement('a');
        node.href = `#${filter.slug}`;
        node.dataset.trackerLink = '';
      } else {
        node = doc.createElement('span');
        if (!name) node.className = 'tracker__empty';
      }
      node.textContent = name || 'Empty';
      value.replaceChildren(node);
    }
  }

  function showView(name) {
    for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
  }

  function endEdit(focus) {
    if (!editing) return;
    const row = rows[editing];
    editing = null;
    row.querySelector('[data-tracker-form]').hidden = true;
    row.querySelector('[data-tracker-value]').hidden = false;
    row.querySelector('[data-tracker-edit]').hidden = false;
    if (focus) row.querySelector('[data-tracker-edit]').focus();
  }

  function startEdit(id) {
    endEdit(false);
    editing = id;
    const row = rows[id];
    const input = row.querySelector('input');
    row.querySelector('[data-tracker-value]').hidden = true;
    row.querySelector('[data-tracker-edit]').hidden = true;
    row.querySelector('[data-tracker-form]').hidden = false;
    input.value = store.get().slots[id];
    input.focus();
    input.select();
  }

  function hideConfirm() {
    confirm.hidden = true;
    clearButton.hidden = false;
  }

  function hidePreview() {
    pending = null;
    preview.hidden = true;
    actions.hidden = false;
  }

  function reset() {
    endEdit(false);
    hideConfirm();
    hidePreview();
    showView('main');
    status('');
  }

  // The desk gets a non-modal popover under the button; the stack gets a full-screen modal sheet.
  function present() {
    if (desk.matches) dialog.show();
    else dialog.showModal();
    button.setAttribute('aria-expanded', 'true');
  }

  function open() {
    if (dialog.open) return;
    store.reload();
    reset();
    render();
    present();
    title.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  dialog.addEventListener('close', () => {
    // The close event is queued: after a layout swap the dialog is already open again.
    if (dialog.open) return;
    endEdit(false);
    button.setAttribute('aria-expanded', 'false');
    if (followed) {
      // Let the hash change (and the desk archive) show the filter first, then put focus on its heading.
      const heading = doc.getElementById(`${followed}-title`);
      followed = null;
      if (heading) {
        win.setTimeout(() => {
          if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        }, 50);
        return;
      }
    }
    const active = doc.activeElement;
    // Back to the button, unless an outside click already put focus on something else.
    if (!active || active === doc.body || dialog.contains(active)) button.focus({ preventScroll: true });
  });

  button.addEventListener('click', () => (dialog.open ? close() : open()));

  // Rotating between the layouts swaps a popover for a sheet (or back) without losing the view.
  desk.addEventListener('change', () => {
    if (!dialog.open) return;
    dialog.close();
    present();
    if (editing) rows[editing].querySelector('input').focus();
    else title.focus();
  });

  // Esc: leave an edit, the Clear all confirmation or an import preview first; a second Esc closes.
  function onEscape(event) {
    if (editing) {
      endEdit(true);
    } else if (!confirm.hidden) {
      hideConfirm();
      clearButton.focus();
    } else if (pending) {
      hidePreview();
      importButton.focus();
      status('Nothing changed.');
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  }

  dialog.addEventListener('cancel', event => {
    onEscape(event);
  });

  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !dialog.open) return;
    if (onEscape(event)) {
      event.stopPropagation();
      return;
    }
    if (!dialog.matches(':modal')) {
      event.preventDefault();
      close();
    }
  });

  // A click outside the popover closes it (the sheet covers the page, so there is no outside).
  doc.addEventListener('click', event => {
    if (!dialog.open || dialog.matches(':modal')) return;
    if (dialog.contains(event.target) || button.contains(event.target)) return;
    close();
  });

  dialog.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.matches('[data-tracker-close]')) close();
    else if (target.matches('[data-tracker-link]')) {
      followed = target.getAttribute('href').slice(1);
      close();
    }
    else if (target.matches('[data-tracker-edit]')) startEdit(target.closest('[data-tracker-slot]').dataset.trackerSlot);
    else if (target.matches('[data-tracker-cancel]')) endEdit(true);
    else if (target === settingsButton) {
      endEdit(false);
      status('');
      showView('settings');
      backButton.focus();
    } else if (target === backButton) {
      hideConfirm();
      hidePreview();
      status('');
      showView('main');
      settingsButton.focus();
    } else if (target.matches('[data-tracker-export]')) exportFile();
    else if (target === importButton) fileInput.click();
    else if (target === clearButton) {
      clearButton.hidden = true;
      confirm.hidden = false;
      confirm.querySelector('[data-tracker-clear-no]').focus();
    } else if (target.matches('[data-tracker-clear-no]')) {
      hideConfirm();
      clearButton.focus();
    } else if (target.matches('[data-tracker-clear-yes]')) {
      store.update(s => SLOTS.reduce((acc, slot) => setSlot(acc, slot.id, ''), s));
      hideConfirm();
      render();
      clearButton.focus();
      status('Cleared all four slots.');
    } else if (target.matches('[data-tracker-replace]')) replace();
    else if (target.matches('[data-tracker-import-cancel]')) {
      hidePreview();
      importButton.focus();
      status('Nothing changed.');
    }
  });

  dialog.addEventListener('submit', event => {
    const form = event.target.closest('[data-tracker-form]');
    if (!form) return;
    event.preventDefault();
    const id = form.closest('[data-tracker-slot]').dataset.trackerSlot;
    const value = form.querySelector('input').value;
    store.update(s => setSlot(s, id, value));
    render();
    endEdit(true);
  });

  auto.addEventListener('change', () => {
    store.update(s => setAutoUpdate(s, auto.checked));
    render();
  });

  function exportFile() {
    const blob = new Blob([serialiseSlotsFile(store.get(), new Date())], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = 'campsnap-slots.txt';
    link.hidden = true;
    dialog.append(link);
    link.click();
    link.remove();
    // Some browsers start the download after the click returns; give them time before the URL goes.
    win.setTimeout(() => URL.revokeObjectURL(url), 15000);
    status('Exported campsnap-slots.txt.');
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    hidePreview();
    // Size first: a big file is never read.
    if (file.size > MAX_FILE_BYTES) {
      status(NOT_A_SLOTS_FILE);
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      status(NOT_A_SLOTS_FILE);
      return;
    }
    const result = parseSlotsFile(text);
    if (!result.ok) {
      status(result.reason === 'no-slots' ? NO_SLOT_LINES : NOT_A_SLOTS_FILE);
      return;
    }
    pending = result;
    for (const s of SLOTS) {
      const cell = preview.querySelector(`[data-tracker-preview-slot="${s.id}"] .tracker__preview-value`);
      const has = Object.hasOwn(result.slots, s.id);
      cell.textContent = has ? result.slots[s.id] || 'Empty' : 'No change';
      cell.classList.toggle('tracker__empty', !has || !result.slots[s.id]);
    }
    status('');
    actions.hidden = true;
    preview.hidden = false;
    preview.querySelector('.tracker__preview-title').focus();
  });

  function replace() {
    if (!pending) return;
    const { slots, ignored } = pending;
    store.update(s => Object.entries(slots).reduce((acc, [id, name]) => setSlot(acc, id, name), s));
    hidePreview();
    render();
    showView('main');
    title.focus();
    status(importedMessage(Object.keys(slots).length, ignored));
  }

  render();
  return { render, status };
}
