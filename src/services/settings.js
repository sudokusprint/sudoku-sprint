// Player preferences, saved per device.
const KEY = 'sudoku-settings';

const DEFAULTS = {
  appearance: 'auto',        // 'auto' (follow the device) | 'light' | 'dark'
  autoClearNotes: true,      // placing a digit removes it from notes in the same row, column, and box
  showMistakes: true,        // Solo: wrong digits turn red as soon as they're placed
  highlightMatches: true,    // shade every cell holding the selected digit
  highlightLines: true,      // shade the selected cell's row and column
  oneRowPad: false,          // number pad as one row of 1-9 instead of two rows
  showOnline: true           // friends can see when you have the game open
};

let settings = load();
const listeners = new Set();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function getSettings() {
  return settings;
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
  listeners.forEach(fn => fn(settings));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
}
