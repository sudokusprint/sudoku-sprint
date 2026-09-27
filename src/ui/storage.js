// localStorage-backed stats. Keys are unchanged from the prototype.
// Every access is wrapped: storage can be unavailable (private mode, blocked site data).

export function readInt(key) {
  try { return parseInt(localStorage.getItem(key) || '0', 10); } catch (e) { return 0; }
}

export function incrementCounter(key) {
  try {
    const cur = parseInt(localStorage.getItem(key) || '0', 10);
    localStorage.setItem(key, String(cur + 1));
  } catch (e) {}
}

export function addLifetimeMistakes(n) {
  try {
    const cur = parseInt(localStorage.getItem('sudoku-lifetime-mistakes') || '0', 10);
    localStorage.setItem('sudoku-lifetime-mistakes', String(cur + n));
  } catch (e) {}
}

export function getMasteryCount(techName) {
  return readInt('sudoku-mastery-' + techName);
}

export function bestKey(difficulty) {
  return 'sudoku-best-' + difficulty;
}

// Best time in seconds, or null if none set. Throws if storage is unavailable.
export function readBestSeconds(difficulty) {
  const raw = localStorage.getItem(bestKey(difficulty));
  return raw ? parseInt(raw, 10) : null;
}

export function saveBestSeconds(difficulty, elapsed) {
  try {
    const key = bestKey(difficulty);
    const prev = localStorage.getItem(key);
    if (!prev || elapsed < parseInt(prev, 10)) {
      localStorage.setItem(key, String(elapsed));
    }
  } catch (e) {}
}

export function loadThemeId() {
  try { return localStorage.getItem('sudoku-board-theme') || 'classic'; } catch (e) { return 'classic'; }
}

export function saveThemeId(id) {
  try { localStorage.setItem('sudoku-board-theme', id); } catch (e) {}
}
