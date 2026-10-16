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
