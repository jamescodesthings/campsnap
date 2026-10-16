// Theme toggle and the window.__theme API. theme-init.js has already set data-theme before first paint.
import { createStorage } from './storage.js';

const KEY = 'theme';
const PREFS = ['dark', 'light', 'system'];

function readPref(store) {
  const saved = store.get(KEY);
  return PREFS.includes(saved) ? saved : 'dark';
}

// Browser bars take the page background: head.ejs ships one tag per prefers-color-scheme for the first
// paint, and once the theme is known they become one tag for the theme actually showing.
export const THEME_COLORS = { dark: '#090b12', light: '#faf8f4' };

export function setThemeColor(doc, theme) {
  doc.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.remove());
  const meta = doc.createElement('meta');
  meta.name = 'theme-color';
  meta.content = THEME_COLORS[theme];
  doc.head.appendChild(meta);
}

function systemTheme(win) {
  try {
    return win.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch (e) {
    return 'dark';
  }
}

export function initTheme(win = window) {
  const doc = win.document;
  const root = doc.documentElement;
  // Held in memory too, so the toggle still works when storage throws (Safari private mode).
  const store = createStorage(win);
  let pref = readPref(store);

  const resolved = () => (pref === 'system' ? systemTheme(win) : pref);

  function apply() {
    const theme = resolved();
    root.setAttribute('data-theme', theme);
    setThemeColor(doc, theme);
    const next = theme === 'dark' ? 'light' : 'dark';
    doc
      .querySelectorAll('[data-theme-toggle]')
      .forEach(btn => btn.setAttribute('aria-label', `Switch to ${next} theme`));
  }

  const api = {
    get: () => pref,
    set(next) {
      if (!PREFS.includes(next)) return;
      pref = next;
      store.set(KEY, next);
      // The dusk orbit and the page colours only animate once the visitor has asked for a change.
      root.setAttribute('data-theme-motion', '');
      apply();
    },
  };
  win.__theme = api;

  doc.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.addEventListener('click', () => api.set(resolved() === 'dark' ? 'light' : 'dark'));
  });

  try {
    win.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (pref === 'system') apply();
    });
  } catch (e) {}

  apply();
  return api;
}
