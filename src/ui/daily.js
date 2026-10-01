// Daily Challenge screen: today's three puzzles, the leaderboard, and the play screen.
//
// The browser never has the solution, so wrong numbers can't be shown as they're
// typed. Instead, numbers that clash with their row, column, or box are marked,
// and a full clash-free grid is sent to the server to check. The server keeps
// the time (the clock runs from the first time the puzzle is opened).
import { findConflicts, gridToString, gridFromString } from '../core/grid.js';
import {
  fetchDailyStatus, startDaily, submitDaily, fetchLeaderboard, msUntilReset,
  fetchAlltimeLeaderboard, fetchMyDailyStats
} from '../services/daily.js';
import { getAccount, onAccountChange } from '../services/account.js';
import { createCell, highlightBoard, buildPad, formatTime } from './board.js';
import { openAuth } from './accountView.js';
import { launchConfetti } from './confetti.js';

const $ = id => document.getElementById(id);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const DATE_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

let els;
let status = null;          // rows from daily_status, or null while loading
let statusError = null;
let boardDifficulty = 'easy';
let alltimeKind = 'streak';
let myStats = null;         // { current_streak, best_streak, total_solves, solved_today } when signed in
let resetTimer = null;
let loadSeq = 0;

// The attempt being played
let game = null;            // { day, difficulty, given, grid, notes, startedAtMs, history, finished }
let selected = null;
let notesMode = false;
let clockOffsetMs = 0;      // server time minus this device's time
let ticking = null;
let submitting = false;
let lastSubmitted = null;

export function initDaily() {
  els = {
    home: $('dailyHome'), play: $('dailyPlay'),
    date: $('dailyDate'), reset: $('dailyReset'), cards: $('dailyCards'), note: $('dailyNote'),
    boardTabs: $('dailyBoardTabs'), leaderboard: $('dailyLeaderboard'),
    streak: $('dailyStreak'),
    alltimeTabs: $('alltimeTabs'), alltimeHint: $('alltimeHint'), alltime: $('alltimeLeaderboard'),
    profileSection: $('profileDailySection'), profileGrid: $('profileDailyGrid'),
    timer: $('dailyTimer'), title: $('dailyTitle'), playNote: $('dailyPlayNote'),
    grid: $('dailyGrid'), pad: $('dailyPad'),
    notesBtn: $('dailyNotesBtn'), eraseBtn: $('dailyEraseBtn'), undoBtn: $('dailyUndoBtn'),
    resultOverlay: $('dailyResultOverlay'), resultDetail: $('dailyResultDetail')
  };

  els.boardTabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => showLeaderboard(btn.dataset.d));
  });
  els.alltimeTabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => showAlltime(btn.dataset.k));
  });
  $('dailyBackBtn').addEventListener('click', showHome);
  els.notesBtn.addEventListener('click', () => {
    notesMode = !notesMode;
    els.notesBtn.classList.toggle('active', notesMode);
    els.notesBtn.textContent = notesMode ? 'Notes: On' : 'Notes: Off';
    els.grid.classList.toggle('notesActive', notesMode);
  });
  els.eraseBtn.addEventListener('click', erase);
  els.undoBtn.addEventListener('click', undo);
  $('dailyResultBtn').addEventListener('click', () => {
    els.resultOverlay.classList.remove('show');
    const d = game ? game.difficulty : boardDifficulty;
    showHome();
    showLeaderboard(d);
  });
  buildPad(els.pad, place);

  // Sign-in / sign-out changes what the cards show.
  let lastUser;
  onAccountChange(account => {
    const userId = account.user ? account.user.id : null;
    const key = userId + ':' + (account.profile ? account.profile.username : '');
    if (key === lastUser) return;
    lastUser = key;
    if (game && (!userId || game.userId !== userId)) showHome();
    myStats = null;
    renderStreak();
    renderProfileDaily();
    if (isVisible()) refresh();
    else loadMyStats();
  });
}

function canPlay() {
  const account = getAccount();
  return account.status === 'signedIn' && account.profileStatus === 'ok';
}

// Fetch the signed-in player's streak and totals, then update the banner and Profile.
async function loadMyStats() {
  if (canPlay()) {
    try {
      myStats = await fetchMyDailyStats();
    } catch (err) {
      myStats = null;   // banner and Profile section just stay hidden
    }
  } else {
    myStats = null;
  }
  renderStreak();
  renderProfileDaily();
  statsListeners.forEach(fn => fn());
}

// Called when the Profile view is opened.
export function refreshProfileDaily() {
  loadMyStats();
}

// The signed-in player's current streak, or null (signed out / not loaded).
export function currentStreak() {
  return myStats ? myStats.current_streak : null;
}

const statsListeners = new Set();
export function onMyStatsChange(fn) { statsListeners.add(fn); }

const days = n => n + (n === 1 ? ' day' : ' days');

function renderStreak() {
  const el = els.streak;
  el.hidden = !myStats;
  if (!myStats) return;
  el.innerHTML = '';
  const main = document.createElement('div');
  main.className = 'streakMain';
  const s = myStats.current_streak;
  main.textContent = s > 0 ? '🔥 ' + days(s) + ' streak' : '🔥 No streak yet';
  const sub = document.createElement('div');
  sub.className = 'streakSub';
  if (s > 0 && !myStats.solved_today) {
    sub.textContent = 'Solve any of today\'s puzzles to keep it going.';
    el.classList.add('atRisk');
  } else {
    el.classList.remove('atRisk');
    sub.textContent = s === 0
      ? 'Solve any of today\'s puzzles to start one.'
      : 'Done for today. Come back tomorrow to keep it going.';
  }
  if (myStats.best_streak > 0) sub.textContent += ' Best: ' + days(myStats.best_streak) + '.';
  el.append(main, sub);
}

function renderProfileDaily() {
  els.profileSection.hidden = !myStats;
  if (!myStats) return;
  const tile = (label, value) =>
    '<div class="bestStat"><div class="bestStatLabel">' + label + '</div>' +
    '<div class="bestStatValue' + (value ? '' : ' empty') + '">' + value + '</div></div>';
  els.profileGrid.innerHTML =
    tile('Streak', myStats.current_streak) +
    tile('Best streak', myStats.best_streak) +
    tile('Solved', myStats.total_solves);
}

const ALLTIME_HINTS = {
  streak: 'Days in a row with at least one Daily puzzle solved.',
  best_streak: 'Longest run of days in a row, ever.',
  solves: 'Every Daily puzzle solved, all difficulties.'
};

async function showAlltime(kind) {
  alltimeKind = kind;
  els.alltimeTabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.k === kind));
  els.alltimeHint.textContent = ALLTIME_HINTS[kind];
  const list = els.alltime;
  list.innerHTML = '<p class="recentEmpty">Loading…</p>';
  let rows;
  try {
    rows = await fetchAlltimeLeaderboard(kind);
  } catch (err) {
    if (alltimeKind === kind) list.innerHTML = '<p class="recentEmpty">Couldn\'t load the leaderboard.</p>';
    return;
  }
  if (alltimeKind !== kind) return;   // switched tabs meanwhile
  renderRows(list, rows, r => kind === 'solves' ? String(r.value) : days(r.value),
    kind === 'streak' ? 'No active streaks yet. Solve today\'s puzzle to start one!' : 'No one has solved a Daily puzzle yet.');
}

// Shared row rendering for both leaderboards.
function renderRows(list, rows, formatValue, emptyText) {
  list.innerHTML = '';
  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'recentEmpty';
    p.textContent = emptyText;
    list.appendChild(p);
    return;
  }
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'leaderRow' + (r.is_me ? ' me' : '');
    const rank = document.createElement('span');
    rank.className = 'leaderRank';
    rank.textContent = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : '#' + r.rank;
    const name = document.createElement('span');
    name.className = 'leaderName';
    name.textContent = '@' + r.username + (r.is_me ? ' (you)' : '');
    const value = document.createElement('span');
    value.className = 'leaderTime';
    value.textContent = formatValue(r);
    row.append(rank, name, value);
    list.appendChild(row);
  }
}

function isVisible() {
  return $('dailyView').classList.contains('active');
}

export function isPlaying() {
  return isVisible() && game !== null && !els.play.hidden;
}

// Called when the Daily view is opened.
export function onShow() {
  if (els.play.hidden) refresh();
  startResetCountdown();
}

// ---------- Daily home: cards + leaderboard ----------

async function refresh() {
  const seq = ++loadSeq;
  statusError = null;
  if (!status) renderCards();
  try {
    const rows = await fetchDailyStatus();
    if (seq !== loadSeq) return;
    status = rows;
    clockOffsetMs = rows.length ? new Date(rows[0].server_now) - Date.now() : 0;
  } catch (err) {
    if (seq !== loadSeq) return;
    statusError = err.message;
  }
  renderCards();
  showLeaderboard(boardDifficulty);
  showAlltime(alltimeKind);
  loadMyStats();
}

function renderCards() {
  els.cards.innerHTML = '';
  els.note.textContent = '';
  if (statusError) {
    els.note.textContent = statusError;
    const retry = document.createElement('button');
    retry.className = 'linkBtn';
    retry.textContent = 'Try again';
    retry.addEventListener('click', refresh);
    els.note.append(' ', retry);
    return;
  }
  if (!status) {
    els.note.textContent = 'Loading today\'s puzzles…';
    return;
  }
  els.date.textContent = DATE_FMT.format(new Date(status[0].day + 'T00:00:00Z'));

  const account = getAccount();
  for (const row of status) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lobbyCard diffCard dailyCard';
    const text = document.createElement('span');
    text.className = 'diffCardText';
    const title = document.createElement('span');
    title.className = 'lobbyTitle';
    title.textContent = cap(row.difficulty);
    const desc = document.createElement('span');
    desc.className = 'lobbyDesc';
    const side = document.createElement('span');
    side.className = 'dailyCardSide';
    text.append(title, desc);
    card.append(text, side);

    const solvedBy = row.total > 0 ? row.total + ' solved so far' : 'Be the first to solve it';
    if (!row.available) {
      desc.textContent = 'Not available today';
      card.disabled = true;
    } else if (row.finished_at) {
      desc.textContent = 'Solved · #' + row.rank + ' of ' + row.total;
      side.innerHTML = '<span class="diffCardBestLabel">Time</span>';
      const t = document.createElement('span');
      t.className = 'diffCardBestTime';
      t.textContent = formatTime(row.seconds);
      side.appendChild(t);
      card.addEventListener('click', () => showLeaderboard(row.difficulty, true));
    } else if (account.status !== 'signedIn') {
      desc.textContent = solvedBy + ' · sign in to play';
      side.textContent = 'Sign in';
      side.className = 'dailyCardSide dailyCardAction';
      card.addEventListener('click', () => openAuth());
    } else if (account.profileStatus !== 'ok') {
      desc.textContent = 'Choose a username to play';
      side.textContent = 'Set up';
      side.className = 'dailyCardSide dailyCardAction';
      card.addEventListener('click', () => openAuth('username'));
    } else if (row.started_at) {
      desc.textContent = 'In progress · clock is running';
      side.textContent = 'Continue';
      side.className = 'dailyCardSide dailyCardAction';
      card.addEventListener('click', () => play(row.difficulty));
    } else {
      desc.textContent = solvedBy;
      side.textContent = 'Play';
      side.className = 'dailyCardSide dailyCardAction';
      card.addEventListener('click', () => play(row.difficulty));
    }
    els.cards.appendChild(card);
  }
  if (account.status !== 'signedIn') {
    els.note.textContent = 'Anyone can view the leaderboard. Sign in to play and get ranked.';
  }
}

function startResetCountdown() {
  clearInterval(resetTimer);
  const tick = () => {
    if (!isVisible()) { clearInterval(resetTimer); return; }
    const ms = msUntilReset();
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    els.reset.textContent = 'New puzzles in ' + (h > 0 ? h + 'h ' : '') + m + 'm';
    // A new day started while the screen was open: reload.
    if (ms < 1000) setTimeout(() => { status = null; refresh(); }, 2000);
  };
  tick();
  resetTimer = setInterval(tick, 30000);
}

async function showLeaderboard(difficulty, scrollIntoView) {
  boardDifficulty = difficulty;
  els.boardTabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.d === difficulty));
  const list = els.leaderboard;
  if (!status) { list.innerHTML = ''; return; }
  list.innerHTML = '<p class="recentEmpty">Loading…</p>';
  if (scrollIntoView) els.boardTabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const day = status[0].day;
  let rows;
  try {
    rows = await fetchLeaderboard(day, difficulty);
  } catch (err) {
    if (boardDifficulty === difficulty) list.innerHTML = '<p class="recentEmpty">Couldn\'t load the leaderboard.</p>';
    return;
  }
  if (boardDifficulty !== difficulty) return;   // switched tabs meanwhile
  renderRows(list, rows, r => formatTime(r.seconds), 'No one has solved today\'s ' + cap(difficulty) + ' puzzle yet.');
}

// ---------- Playing ----------

function draftKey(g) {
  return 'sudoku-daily-' + g.userId + '-' + g.day + '-' + g.difficulty;
}

function saveDraft() {
  if (!game || game.finished) return;
  try {
    localStorage.setItem(draftKey(game), JSON.stringify({ grid: gridToString(game.grid), notes: game.notes.map(row => row.map(set => [...set])) }));
  } catch (e) {}
}

function loadDraft(g) {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(g)) || 'null');
    if (!d || typeof d.grid !== 'string' || d.grid.length !== 81) return;
    const grid = gridFromString(d.grid);
    // Never let a draft overwrite a given.
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!g.given[r][c]) g.grid[r][c] = grid[r][c];
    if (Array.isArray(d.notes)) g.notes = d.notes.map(row => row.map(list => new Set(list)));
  } catch (e) {}
}

function clearDraft(g) {
  try { localStorage.removeItem(draftKey(g)); } catch (e) {}
}

async function play(difficulty) {
  els.note.textContent = 'Opening the puzzle…';
  let attempt;
  try {
    attempt = await startDaily(difficulty);
  } catch (err) {
    els.note.textContent = err.message;
    return;
  }
  if (attempt.finished_at) {   // already solved (e.g. on another device)
    status = null;
    refresh();
    return;
  }
  clockOffsetMs = new Date(attempt.server_now) - Date.now();
  const puzzle = gridFromString(attempt.puzzle);
  game = {
    userId: getAccount().user.id,
    day: attempt.day,
    difficulty,
    given: puzzle.map(row => row.map(v => v !== 0)),
    grid: puzzle,
    notes: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set())),
    startedAtMs: new Date(attempt.started_at).getTime(),
    history: [],
    finished: false
  };
  loadDraft(game);
  selected = null;
  lastSubmitted = null;
  els.note.textContent = '';
  els.title.textContent = 'Daily · ' + cap(difficulty);
  els.playNote.textContent = attempt.techniques && attempt.techniques.length
    ? 'Needs: ' + attempt.techniques.join(', ')
    : '';
  els.home.hidden = true;
  els.play.hidden = false;
  window.scrollTo(0, 0);
  updateUndo();
  render();
  clearInterval(ticking);
  ticking = setInterval(tick, 1000);
  tick();
  maybeSubmit();
}

function showHome() {
  clearInterval(ticking);
  game = null;
  selected = null;
  els.resultOverlay.classList.remove('show');
  els.play.hidden = true;
  els.home.hidden = false;
  refresh();
}

function tick() {
  if (!game || game.finished) return;
  const seconds = Math.max(0, Math.floor((Date.now() + clockOffsetMs - game.startedAtMs) / 1000));
  els.timer.textContent = formatTime(seconds);
}

function render() {
  const conflicts = findConflicts(game.grid);
  els.grid.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = game.grid[r][c];
      const cell = createCell(r, c, {
        value,
        isGiven: game.given[r][c],
        isBad: conflicts.has(r + ',' + c),
        onClick: () => { selected = [r, c]; highlightBoard(els.grid, selected, game.grid); }
      });
      if (value === 0 && game.notes[r][c].size) {
        const notes = document.createElement('div');
        notes.className = 'notes';
        for (let n = 1; n <= 9; n++) {
          const s = document.createElement('span');
          if (game.notes[r][c].has(n)) s.textContent = n;
          notes.appendChild(s);
        }
        cell.appendChild(notes);
      }
      els.grid.appendChild(cell);
    }
  }
  highlightBoard(els.grid, selected, game.grid);
  // Strike a digit out on the pad once all nine are placed without clashes.
  for (let v = 1; v <= 9; v++) {
    let count = 0, clash = false;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (game.grid[r][c] === v) { count++; if (conflicts.has(r + ',' + c)) clash = true; }
    }
    const btn = els.pad.querySelector('button[data-v="' + v + '"]');
    if (btn) btn.classList.toggle('done', count === 9 && !clash);
  }
}

function editable() {
  if (!game || game.finished || !selected) return false;
  const [r, c] = selected;
  return !game.given[r][c];
}

export function place(v) {
  if (!editable()) return;
  const [r, c] = selected;
  if (notesMode) {
    if (game.grid[r][c] !== 0) return;
    const set = game.notes[r][c];
    game.history.push({ r, c, value: 0, notes: new Set(set) });
    if (set.has(v)) set.delete(v); else set.add(v);
  } else {
    if (game.grid[r][c] === v) return;
    game.history.push({ r, c, value: game.grid[r][c], notes: new Set(game.notes[r][c]) });
    game.grid[r][c] = v;
    game.notes[r][c] = new Set();
  }
  afterChange();
}

export function erase() {
  if (!editable()) return;
  const [r, c] = selected;
  if (game.grid[r][c] === 0 && game.notes[r][c].size === 0) return;
  game.history.push({ r, c, value: game.grid[r][c], notes: new Set(game.notes[r][c]) });
  game.grid[r][c] = 0;
  game.notes[r][c] = new Set();
  afterChange();
}

function undo() {
  if (!game || game.finished || !game.history.length) return;
  const last = game.history.pop();
  game.grid[last.r][last.c] = last.value;
  game.notes[last.r][last.c] = last.notes;
  afterChange();
}

function updateUndo() {
  els.undoBtn.disabled = !game || game.finished || game.history.length === 0;
}

function afterChange() {
  updateUndo();
  saveDraft();
  render();
  maybeSubmit();
}

// Send the grid to the server once it's full and has no clashes.
async function maybeSubmit() {
  if (!game || game.finished || submitting) return;
  if (game.grid.some(row => row.includes(0))) return;
  if (findConflicts(game.grid).size) return;
  const grid = gridToString(game.grid);
  if (grid === lastSubmitted) return;
  lastSubmitted = grid;
  submitting = true;
  els.playNote.textContent = 'Checking…';
  const current = game;
  let result;
  try {
    result = await submitDaily(current.day, current.difficulty, grid);
  } catch (err) {
    submitting = false;
    lastSubmitted = null;
    if (game === current) els.playNote.textContent = err.message + ' Change any number to try again.';
    return;
  }
  submitting = false;
  if (game !== current) return;
  if (!result.correct) {
    els.playNote.textContent = 'Not quite: some numbers are wrong. Keep going!';
    return;
  }
  game.finished = true;
  clearInterval(ticking);
  clearDraft(game);
  updateUndo();
  els.timer.textContent = formatTime(result.seconds);
  els.playNote.textContent = 'Solved!';
  els.resultDetail.textContent = 'Time: ' + formatTime(result.seconds) + ' · You\'re #' + result.rank + ' of ' + result.total + ' today on ' + cap(current.difficulty) + '.';
  els.resultOverlay.classList.add('show');
  launchConfetti();
  status = null;   // refresh the cards next time home is shown
  // Add the (server-computed) streak once it's in.
  const detail = els.resultDetail.textContent;
  await loadMyStats();
  if (myStats && myStats.current_streak > 0 && els.resultOverlay.classList.contains('show')) {
    els.resultDetail.textContent = detail + ' 🔥 Streak: ' + days(myStats.current_streak) + '.';
  }
}
