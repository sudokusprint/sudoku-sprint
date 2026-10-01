// Settings panel: appearance (light / dark / auto) and gameplay switches.
// Board styles in the same panel are handled by themes.js.
import { getSettings, updateSettings, onSettingsChange } from '../services/settings.js';

// Light/dark is applied through data-theme on <html>, which base.css already supports.
function applyAppearance(appearance) {
  const root = document.documentElement;
  if (appearance === 'light' || appearance === 'dark') root.dataset.theme = appearance;
  else delete root.dataset.theme;
}

function render() {
  const s = getSettings();
  document.querySelectorAll('#appearanceChoice [data-appearance]').forEach(btn => {
    const on = btn.dataset.appearance === s.appearance;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  document.querySelectorAll('#settingsOverlay [data-setting]').forEach(input => {
    input.checked = !!s[input.dataset.setting];
  });
}

export function initSettingsPanel() {
  applyAppearance(getSettings().appearance);
  document.querySelectorAll('#appearanceChoice [data-appearance]').forEach(btn => {
    btn.addEventListener('click', () => updateSettings({ appearance: btn.dataset.appearance }));
  });
  document.querySelectorAll('#settingsOverlay [data-setting]').forEach(input => {
    input.addEventListener('change', () => updateSettings({ [input.dataset.setting]: input.checked }));
  });
  onSettingsChange(s => {
    applyAppearance(s.appearance);
    render();
  });
  render();
}
