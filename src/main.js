// App entry point: wires the views together, handles tab navigation and the keyboard.
import * as solo from './ui/solo.js';
import * as race from './ui/race.js';
import * as workshop from './ui/workshop.js';
import * as daily from './ui/daily.js';
import * as liveRace from './ui/liveRace.js';
import { initFriendsView, onProfileShown } from './ui/friendsView.js';
import { initFriends } from './services/friends.js';
import { initThemes, loadTheme } from './ui/themes.js';
import { renderHomeStats, renderProfile, renderLobbyBest } from './ui/stats.js';
import { initAccountView } from './ui/accountView.js';
import { initAccount, onAccountChange } from './services/account.js';
import { initProgress, onProgressChange } from './services/progress.js';
import { ACCOUNTS_ENABLED } from './config.js';
import { initSettingsPanel } from './ui/settingsPanel.js';
import { onSettingsChange } from './services/settings.js';

// Home tiles, including the Daily streak when accounts are on.
function homeStats() {
  renderHomeStats(ACCOUNTS_ENABLED ? daily.currentStreak() : null);
}

function isViewActive(id) {
  return document.getElementById(id).classList.contains('active');
}

function switchView(viewId) {
  if (!document.getElementById(viewId)) return;
  if (isViewActive('soloView') && viewId !== 'soloView') {
    solo.pauseGame();
  }
  document.querySelectorAll('.tabBtn').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === viewId));
  if (viewId === 'homeView') { homeStats(); }
  if (viewId === 'profileView') {
    renderProfile();
    renderLobbyBest();
    if (ACCOUNTS_ENABLED) { daily.refreshProfileDaily(); onProfileShown(); }
  }
  if (viewId === 'dailyView') { daily.onShow(); }
}

// Digits place a value; Backspace / Delete / 0 erase (Solo, Workshop, Daily) or undo (races).
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;  // typing in a form field
  const soloIsActive = isViewActive('soloView');
  const raceIsActive = isViewActive('raceView');
  const workIsActive = isViewActive('workshopView') && workshop.isPracticeOpen();
  const dailyIsActive = ACCOUNTS_ENABLED && daily.isPlaying();
  if (e.key >= '1' && e.key <= '9') {
    const v = parseInt(e.key, 10);
    if (soloIsActive) solo.place(v);
    else if (raceIsActive && liveRace.isRacing()) liveRace.place(v);
    else if (raceIsActive) race.racePlace(v);
    else if (workIsActive) workshop.workPlace(v);
    else if (dailyIsActive) daily.place(v);
  }
  if (e.key === 'Backspace' || e.key === '0' || e.key === 'Delete') {
    if (soloIsActive) solo.erase();
    else if (raceIsActive && liveRace.isRacing()) liveRace.undo();
    else if (raceIsActive) race.raceUndo();
    else if (workIsActive) workshop.workErase();
    else if (dailyIsActive) daily.erase();
  }
});

document.querySelectorAll('.tabBtn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.querySelectorAll('.lobbyCard[data-goto]').forEach(card => {
  card.addEventListener('click', () => switchView(card.dataset.goto));
});

// Stats change on sign-in, sign-out, when saved progress loads, and after each game.
onProgressChange(() => {
  homeStats();
  renderProfile();
  renderLobbyBest();
  solo.renderBest();
  workshop.refreshTechniqueList();
});

// Gameplay settings change how boards are drawn: redraw whatever is on screen.
onSettingsChange(() => {
  solo.refreshBoard();
  race.refreshHighlight();
  workshop.refreshHighlight();
  if (ACCOUNTS_ENABLED) daily.refreshBoard();
});

initSettingsPanel();
initProgress();
race.initRace();
liveRace.initLiveRace();
workshop.initWorkshop();
initThemes({ onChange: solo.refreshBoard });
loadTheme();
solo.initSolo();
renderLobbyBest();
homeStats();
if (ACCOUNTS_ENABLED) {
  initAccountView();
  daily.initDaily();
  daily.onMyStatsChange(homeStats);
  initFriends();
  initFriendsView({ goTo: switchView });
  initAccount();
} else {
  // The Daily Challenge needs accounts (the server times and ranks each attempt).
  document.getElementById('accountCard').hidden = true;
  document.getElementById('homeAccountNote').hidden = true;
  document.getElementById('dailyLobbyCard').hidden = true;
  document.getElementById('dailyTab').hidden = true;
}

// Invite links (?race=CODE) open straight into that friend race's lobby. Wait
// briefly for sign-in to resolve so signed-in players join under their username.
const inviteCode = new URLSearchParams(location.search).get('race');
if (inviteCode) {
  switchView('raceView');
  let joined = false;
  const join = () => { if (!joined) { joined = true; liveRace.joinRace(inviteCode); } };
  if (ACCOUNTS_ENABLED) {
    onAccountChange(account => { if (account.status !== 'loading') join(); });
    setTimeout(join, 4000);
  } else {
    join();
  }
}
