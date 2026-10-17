// Slot tracker logic. Pure and dependency-free: shipped to the browser as is
// and imported by the Node tests.

export const STORAGE_KEY = 'campsnapSlots';

export const SLOTS = [
  { id: 'std', label: 'Standard', file: 'std.flt' },
  { id: 'vtg1', label: 'Vintage 1', file: 'vtg1.flt' },
  { id: 'vtg2', label: 'Vintage 2', file: 'vtg2.flt' },
  { id: 'bw', label: 'B&W', file: 'bw.flt' },
];

const MAX_NAME = 80;

const isSlotId = (id) => SLOTS.some((s) => s.id === id);

const cleanName = (value) =>
  typeof value === 'string' ? value.trim().slice(0, MAX_NAME).trim() : '';

export function defaultState() {
  const slots = {};
  for (const s of SLOTS) slots[s.id] = '';
  return { v: 1, autoUpdate: true, slots };
}

export function parseState(raw) {
  const state = defaultState();
  if (typeof raw !== 'string') return state;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return state;
  }
  if (!data || typeof data !== 'object' || data.v !== 1) return state;
  if (data.autoUpdate === false) state.autoUpdate = false;
  if (data.slots && typeof data.slots === 'object') {
    for (const s of SLOTS) state.slots[s.id] = cleanName(data.slots[s.id]);
  }
  return state;
}

export function serialiseState(state) {
  return JSON.stringify(state);
}

export function setSlot(state, slotId, name) {
  if (!isSlotId(slotId)) return { ...state, slots: { ...state.slots } };
  return { ...state, slots: { ...state.slots, [slotId]: cleanName(name) } };
}

export function setAutoUpdate(state, on) {
  return { ...state, slots: { ...state.slots }, autoUpdate: Boolean(on) };
}

export function recordDownload(state, slotId, filterName) {
  if (!state.autoUpdate) return { ...state, slots: { ...state.slots } };
  return setSlot(state, slotId, filterName);
}

export function normaliseName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function findFilter(filters, name) {
  const target = normaliseName(name);
  if (!target) return null;
  return (
    filters.find(
      (f) => normaliseName(f.name) === target || normaliseName(f.slug) === target,
    ) || null
  );
}

// Slots file: plain text, "campsnap-slots.txt". Export and import rules are
// in the round 2 design review, section 2.7.

const MAX_FILE_BYTES = 16 * 1024;
const MAX_FILE_VALUE = 60;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SLOT_LINE = /^\s*(std|vtg1|vtg2|bw)(\.flt)?\s*[=:]\s*(.*?)\s*$/i;

// Control characters (tabs and line breaks included) go; the rest is trimmed and capped.
function cleanFileValue(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
    .slice(0, MAX_FILE_VALUE)
    .trim();
}

export function serialiseSlotsFile(state, date = new Date()) {
  const stamp = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const lines = [
    '# CampSnap Pro filter slots',
    `# From codesthings.com/campsnap, exported ${stamp}`,
    '# One line per slot: slot = filter name. Edit freely.',
    '',
  ];
  for (const s of SLOTS) {
    const name = cleanFileValue(state?.slots?.[s.id]);
    lines.push(name ? `${s.id.padEnd(4)} = ${name}` : `${s.id} =`);
  }
  return lines.join('\n') + '\n';
}

export function parseSlotsFile(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'not-text' };
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) return { ok: false, reason: 'too-big' };
  if (text.includes('\u0000') || text.includes('�')) return { ok: false, reason: 'not-text' };
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const slots = {};
  let ignored = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = SLOT_LINE.exec(line);
    if (!m) {
      ignored += 1;
      continue;
    }
    slots[m[1].toLowerCase()] = cleanFileValue(m[3]);
  }
  if (Object.keys(slots).length === 0) return { ok: false, reason: 'no-slots' };
  return { ok: true, slots, ignored };
}
