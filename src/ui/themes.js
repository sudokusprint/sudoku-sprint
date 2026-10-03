// Board colour themes and the settings side panel that picks them.
import { loadThemeId, saveThemeId } from '../services/storage.js';

// `dark` is optional: themes without it keep their light board in dark mode.
// The default keeps the id 'classic' so players who never changed it get Newsprint.
export const THEMES = [
  { id: 'classic', name: 'Newsprint', boardA: '#F3EEE3', boardB: '#ECE5D6', line: '#1D1B18', accent: '#2B4C7E', accentSoft: '#E6DECF',
    dark: { boardA: '#1A1815', boardB: '#211E1A', line: '#ECE6D9', accent: '#9DB8E0', accentSoft: '#2A2622' } },
  { id: 'ocean', name: 'Ocean', boardA: '#EAF4F7', boardB: '#CFE6EC', line: '#0B4B5C', accent: '#0E8FA6', accentSoft: '#DFF3F6' },
  { id: 'forest', name: 'Forest', boardA: '#F2F5EC', boardB: '#DDE7CD', line: '#33461F', accent: '#5C8A2E', accentSoft: '#E8F0DA' },
  { id: 'walnut', name: 'Walnut', boardA: '#F6EEE3', boardB: '#E7D5BD', line: '#5A3B23', accent: '#B4652F', accentSoft: '#F4E4D2' },
  { id: 'slate', name: 'Slate', boardA: '#EEF1F5', boardB: '#D7DEE8', line: '#2B3A4A', accent: '#4C6E91', accentSoft: '#E2E9F1' },
  { id: 'sunset', name: 'Sunset', boardA: '#FDF1E9', boardB: '#F7D9C4', line: '#7A3B2E', accent: '#D96C4A', accentSoft: '#FBE3D6' },
  { id: 'mono', name: 'Mono', boardA: '#FFFFFF', boardB: '#FFFFFF', line: '#000000', accent: '#4A4A4A', accentSoft: '#E8E8E8' }
];

let currentTheme = 'classic';
let themeList;
let onThemeChange = () => {};

// onChange runs after a user-initiated theme switch (not on initial load).
export function initThemes({ onChange }) {
  onThemeChange = onChange;
  themeList = document.getElementById('themeList');
  const settingsOverlay = document.getElementById('settingsOverlay');

  // The gear buttons on Home, Solo and Profile all open the same panel.
  document.querySelectorAll('[data-open-settings]').forEach(btn => {
    btn.addEventListener('click', () => settingsOverlay.classList.add('show'));
  });
  document.getElementById('closeSettings').addEventListener('click', () => {
    settingsOverlay.classList.remove('show');
  });
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('show');
  });
}

export function loadTheme() {
  applyTheme(loadThemeId(), true);
}

function applyTheme(id, skipBoardRerender) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  currentTheme = t.id;
  // base.css picks the light (--tl-*) or dark (--td-*) set for the current mode.
  const root = document.documentElement.style;
  const dark = t.dark || t;
  root.setProperty('--tl-board-a', t.boardA);
  root.setProperty('--tl-board-b', t.boardB);
  root.setProperty('--tl-line', t.line);
  root.setProperty('--tl-accent', t.accent);
  root.setProperty('--tl-accent-soft', t.accentSoft);
  root.setProperty('--td-board-a', dark.boardA);
  root.setProperty('--td-board-b', dark.boardB);
  root.setProperty('--td-line', dark.line);
  root.setProperty('--td-accent', dark.accent);
  root.setProperty('--td-accent-soft', dark.accentSoft);
  saveThemeId(t.id);
  renderThemeList();
  if (!skipBoardRerender) onThemeChange();
}

function renderThemeList() {
  themeList.innerHTML = '';
  THEMES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'themeSwatch' + (t.id === currentTheme ? ' selected' : '');
    btn.innerHTML =
      '<span class="swatchPreview">' +
      '<span style="background:' + t.boardA + '"></span>' +
      '<span style="background:' + t.boardB + '"></span>' +
      '<span style="background:' + t.boardB + '"></span>' +
      '<span style="background:' + t.boardA + '"></span>' +
      '</span><span>' + t.name + '</span>';
    btn.addEventListener('click', () => applyTheme(t.id));
    themeList.appendChild(btn);
  });
}
