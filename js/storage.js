// localStorage and sessionStorage that never throw. Safari private mode, blocked site data and quota errors all
// land on the fallback (get) or false (set), so callers keep their own in-memory state and carry on.
function createStore(win, area) {
  return {
    get(key, fallback = null) {
      try {
        const value = win[area].getItem(key);
        return value === null || value === undefined ? fallback : value;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        win[area].setItem(key, String(value));
        return true;
      } catch (e) {
        return false;
      }
    },
  };
}

export const createStorage = (win = globalThis) => createStore(win, 'localStorage');
// Same contract over sessionStorage: used only for the terminal history, which lives and dies with the tab.
export const createSessionStorage = (win = globalThis) => createStore(win, 'sessionStorage');

export const storage = createStorage();
export const get = storage.get;
export const set = storage.set;
export const session = createSessionStorage();
