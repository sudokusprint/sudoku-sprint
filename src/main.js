// App entry point: wires the views together, handles tab navigation and the keyboard.
import * as solo from './ui/solo.js';
import * as race from './ui/race.js';
import * as workshop from './ui/workshop.js';
import { initThemes, loadTheme } from './ui/themes.js';
import { renderHomeStats, renderProfile, renderLobbyBest } from './ui/stats.js';
import { initAccountView } from './ui/accountView.js';
import { initAccount } from './services/account.js';
import { initProgress, onProgressChange } from './services/progress.js';

function isViewActive(id) {
  return document.getElementById(id).classList.contains('active');
}

function switchView(viewId) {
  if (isViewActive('soloView') && viewId !== 'soloView') {
    solo.pauseGame();
  }
  document.querySelectorAll('.tabBtn').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === viewId));
  if (viewId === 'homeView') { renderHomeStats(); }
  if (viewId === 'profileView') { renderProfile(); renderLobbyBest(); }
}

// Digits place a value; Backspace / Delete / 0 undo (Solo, Race) or erase (Workshop).
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;  // typing in a form field
  const soloIsActive = isViewActive('soloView');
  const raceIsActive = isViewActive('raceView');
  const workIsActive = isViewActive('workshopView') && workshop.isPracticeOpen();
  if (e.key >= '1' && e.key <= '9') {
    const v = parseInt(e.key, 10);
    if (soloIsActive) solo.place(v);
    else if (raceIsActive) race.racePlace(v);
    else if (workIsActive) workshop.workPlace(v);
  }
  if (e.key === 'Backspace' || e.key === '0' || e.key === 'Delete') {
    if (soloIsActive) solo.undo();
    else if (raceIsActive) race.raceUndo();
    else if (workIsActive) workshop.workErase();
  }
});

document.querySelectorAll('.tabBtn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.querySelectorAll('.lobbyCard').forEach(card => {
  card.addEventListener('click', () => switchView(card.dataset.goto));
});

// Stats change on sign-in, sign-out, when saved progress loads, and after each game.
onProgressChange(() => {
  renderHomeStats();
  renderProfile();
  renderLobbyBest();
  solo.renderBest();
  workshop.refreshTechniqueList();
});

initProgress();
race.initRace();
workshop.initWorkshop();
initThemes({ onChange: solo.refreshBoard });
loadTheme();
solo.initSolo();
renderLobbyBest();
renderHomeStats();
initAccountView();
initAccount();
