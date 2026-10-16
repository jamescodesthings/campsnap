// Filter tracker and slot downloads: the DOM side of tracker-core.js. The card ships hidden and is shown here, so a
// visitor without JavaScript never sees a dead control; their download links still save as the default slot name.
import { createStorage } from './storage.js';
import {
  STORAGE_KEY,
  SLOTS,
  parseState,
  serialiseState,
  setSlot,
  setAutoUpdate,
  recordDownload,
  findFilter,
} from './tracker-core.js';

const slotById = id => SLOTS.find(s => s.id === id);

function readFilters(doc) {
  try {
    const data = JSON.parse(doc.getElementById('filter-data')?.textContent || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// A malformed hash (a stray %) must never stop the page's script.
function decodeHash(hash) {
  const raw = hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch (e) {
    return raw;
  }
}

function el(doc, tag, attrs = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

export function initTracker(win = window) {
  const doc = win.document;
  const card = doc.getElementById('tracker');
  const rows = doc.getElementById('tracker-rows');
  const auto = doc.getElementById('tracker-auto');
  const status = doc.getElementById('tracker-status');
  const filters = readFilters(doc);
  // Storage that throws (Safari private mode) leaves state in memory for the session.
  const store = createStorage(win);
  let state = parseState(store.get(STORAGE_KEY));
  let editing = null;

  const save = () => store.set(STORAGE_KEY, serialiseState(state));
  const announce = text => {
    if (status) status.textContent = text;
  };

  function valueNode(slot) {
    const name = state.slots[slot.id];
    if (!name) return el(doc, 'span', { class: 'tracker-row__empty', text: 'Not set' });
    const match = findFilter(filters, name);
    if (!match) return el(doc, 'span', { class: 'tracker-row__name', text: name });
    return el(doc, 'a', { class: 'tracker-row__name', href: `#${match.slug}`, text: match.name });
  }

  function editButton(slot) {
    const btn = el(doc, 'button', {
      type: 'button',
      class: 'tracker-row__edit',
      'data-edit': slot.id,
      'aria-label': `Edit ${slot.label} slot`,
    });
    btn.innerHTML =
      '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" /></svg><span>Edit</span>';
    btn.addEventListener('click', () => {
      editing = slot.id;
      render();
      const input = rows.querySelector('.tracker-row__input');
      if (input) {
        input.focus();
        input.select();
      }
    });
    return btn;
  }

  function editor(slot) {
    const inputId = `tracker-input-${slot.id}`;
    const input = el(doc, 'input', {
      id: inputId,
      class: 'tracker-row__input',
      type: 'text',
      list: 'tracker-filters',
      autocomplete: 'off',
      maxlength: '80',
      'aria-label': `Filter on the ${slot.label} slot`,
      placeholder: 'Filter name',
    });
    input.value = state.slots[slot.id];
    const form = el(
      doc,
      'form',
      { class: 'tracker-row__editor' },
      input,
      el(doc, 'button', { type: 'submit', class: 'btn btn--primary btn--small', text: 'Save' }),
      el(doc, 'button', { type: 'button', class: 'btn btn--secondary btn--small', 'data-cancel': '', text: 'Cancel' }),
    );
    // Enter submits the form; an empty value clears the slot.
    form.addEventListener('submit', event => {
      event.preventDefault();
      state = setSlot(state, slot.id, input.value);
      save();
      announce(state.slots[slot.id] ? `${slot.label} slot set to ${state.slots[slot.id]}.` : `${slot.label} slot cleared.`);
      close(slot.id);
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => close(slot.id));
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(slot.id);
      }
    });
    return form;
  }

  function close(slotId) {
    editing = null;
    render();
    rows.querySelector(`[data-edit="${slotId}"]`)?.focus();
  }

  function render() {
    if (!rows) return;
    rows.replaceChildren(
      ...SLOTS.map(slot => {
        const head = el(
          doc,
          'span',
          { class: 'tracker-row__slot' },
          el(doc, 'span', { class: 'tracker-row__label', text: slot.label }),
          el(doc, 'code', { class: 'tracker-row__file', text: slot.file }),
        );
        const body =
          editing === slot.id
            ? editor(slot)
            : el(doc, 'span', { class: 'tracker-row__value' }, valueNode(slot), editButton(slot));
        return el(doc, 'li', { class: 'tracker-row', 'data-slot': slot.id }, head, body);
      }),
    );
    if (auto) auto.checked = state.autoUpdate;
  }

  if (auto) {
    auto.addEventListener('change', () => {
      state = setAutoUpdate(state, auto.checked);
      save();
    });
    // The tooltip shows on hover and focus; Escape hides it until the pointer or focus leaves.
    const wrap = auto.closest('.switch');
    auto.addEventListener('keydown', event => {
      if (event.key === 'Escape') wrap?.setAttribute('data-tip-dismissed', '');
    });
    const reset = () => wrap?.removeAttribute('data-tip-dismissed');
    auto.addEventListener('blur', reset);
    wrap?.addEventListener('mouseleave', reset);
  }

  // Each filter's slot picker renames its download; a click with Auto-update on records the slot.
  doc.querySelectorAll('a[data-filter]').forEach(link => {
    const select = link.closest('section')?.querySelector('select[data-slot-select]');
    const label = link.querySelector('[data-download-label]');
    const sync = () => {
      const slot = slotById(select.value);
      if (!slot) return;
      link.setAttribute('download', slot.file);
      if (label) label.textContent = `Download as ${slot.file}`;
    };
    if (select) {
      select.addEventListener('change', sync);
      // A restored form (back button) may already hold another slot.
      sync();
    }
    link.addEventListener('click', () => {
      // Without a picker, the link's own download name says which slot it fills.
      const slot = select
        ? slotById(select.value)
        : SLOTS.find(s => s.file === link.getAttribute('download'));
      if (!slot || !state.autoUpdate) return;
      state = recordDownload(state, slot.id, link.dataset.name || link.dataset.filter);
      save();
      if (editing === slot.id) editing = null;
      render();
      announce(`${slot.label} slot set to ${state.slots[slot.id]}.`);
    });
  });

  if (card) {
    render();
    card.hidden = false;
    // Showing the card pushes everything below it down, so a link to #<filter> would land short of it.
    const target = win.location.hash && doc.getElementById(decodeHash(win.location.hash));
    if (target && card.compareDocumentPosition(target) & win.Node.DOCUMENT_POSITION_FOLLOWING) {
      target.scrollIntoView({ behavior: 'instant' });
    }
  }

  return {
    get state() {
      return state;
    },
  };
}
