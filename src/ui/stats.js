// Home progress tiles and the Profile page (best times, completions, race record, recent games).
import { TECHNIQUES_INFO, MASTERY_TARGET } from '../core/techniques.js';
import { DIFFICULTIES } from '../core/stats.js';
import { currentStats, recentSolves, progressStatus } from '../services/progress.js';
import { formatTime } from './board.js';

const RECENT_LIMIT = 15;

export function renderHomeStats() {
  const stats = currentStats();
  const grid = document.getElementById('homeStatsGrid');
  const totalSolved = DIFFICULTIES.reduce((sum, d) => sum + stats.completed[d], 0);
  const wins = stats.raceWins;
  const losses = stats.raceLosses;
  const racedAny = (wins + losses) > 0;
  const practiceable = TECHNIQUES_INFO.filter(t => t.practiceable !== false);
  const masteredCount = practiceable.filter(t => (stats.mastery[t.name] || 0) >= MASTERY_TARGET).length;

  grid.innerHTML =
    '<div class="bestStat"><div class="bestStatLabel">Solved</div><div class="bestStatValue' + (totalSolved === 0 ? ' empty' : '') + '">' + (totalSolved || '—') + '</div></div>' +
    '<div class="bestStat"><div class="bestStatLabel">Race record</div><div class="bestStatValue' + (racedAny ? '' : ' empty') + '">' + (racedAny ? (wins + '-' + losses) : '—') + '</div></div>' +
    '<div class="bestStat"><div class="bestStatLabel">Mastered</div><div class="bestStatValue' + (masteredCount === 0 ? ' empty' : '') + '">' + masteredCount + '/' + practiceable.length + '</div></div>';
}

export function renderProfile() {
  const stats = currentStats();
  const grid = document.getElementById('completedGrid');
  const totalsEl = document.getElementById('profileTotals');

  grid.innerHTML = '';
  let total = 0;
  DIFFICULTIES.forEach(d => {
    const count = stats.completed[d];
    total += count;
    const stat = document.createElement('div');
    stat.className = 'bestStat';
    stat.innerHTML =
      '<div class="bestStatLabel">' + d + '</div>' +
      '<div class="bestStatValue' + (count === 0 ? ' empty' : '') + '">' + count + '</div>';
    grid.appendChild(stat);
  });
  totalsEl.innerHTML =
    '<div class="profileTotal"><div class="profileTotalValue">' + total + '</div><div class="profileTotalLabel">Total solved</div></div>';

  const raceTotalsEl = document.getElementById('raceRecordTotals');
  const wins = stats.raceWins;
  const losses = stats.raceLosses;
  const played = wins + losses;
  const winRate = played > 0 ? Math.round((wins / played) * 100) + '%' : '—';
  raceTotalsEl.innerHTML =
    '<div class="profileTotal"><div class="profileTotalValue">' + wins + '</div><div class="profileTotalLabel">Wins</div></div>' +
    '<div class="profileTotal"><div class="profileTotalValue">' + losses + '</div><div class="profileTotalLabel">Losses</div></div>' +
    '<div class="profileTotal"><div class="profileTotalValue">' + winRate + '</div><div class="profileTotalLabel">Win rate</div></div>';

  renderRecent();
}

// Best-time tiles on the Profile page.
export function renderLobbyBest() {
  const stats = currentStats();
  const grid = document.getElementById('bestGrid');
  grid.innerHTML = '';
  let anySet = false;
  DIFFICULTIES.forEach(d => {
    const s = stats.best[d];
    const empty = s === null;
    if (!empty) anySet = true;
    const stat = document.createElement('div');
    stat.className = 'bestStat';
    stat.innerHTML =
      '<div class="bestStatLabel">' + d + '</div>' +
      '<div class="bestStatValue' + (empty ? ' empty' : '') + '">' + (empty ? '—' : formatTime(s)) + '</div>';
    grid.appendChild(stat);
  });
  if (!anySet) {
    const note = document.createElement('div');
    note.className = 'bestEmptyNote';
    note.textContent = 'Play a puzzle to set your first best time.';
    grid.appendChild(note);
  }
}

// ---------- Recent games (signed-in players only) ----------

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function describeSolve(solve) {
  if (solve.mode === 'solo') {
    const m = solve.mistakes || 0;
    return { title: 'Solo · ' + cap(solve.difficulty), detail: formatTime(solve.seconds) + ' · ' + m + (m === 1 ? ' mistake' : ' mistakes') };
  }
  if (solve.mode === 'race') {
    const d = solve.difficulty ? ' · ' + cap(solve.difficulty) : '';
    return { title: 'Race' + d, detail: (solve.won ? 'Won in ' : 'Lost at ') + formatTime(solve.seconds || 0) };
  }
  return { title: 'Workshop', detail: solve.technique + ' practice solved' };
}

function renderRecent() {
  const section = document.getElementById('recentSection');
  const list = document.getElementById('recentList');
  const status = progressStatus();
  section.hidden = status === 'guest';
  if (status === 'guest') return;

  list.innerHTML = '';
  const note = msg => {
    const p = document.createElement('p');
    p.className = 'recentEmpty';
    p.textContent = msg;
    list.appendChild(p);
  };
  if (status === 'loading') return note('Loading your games…');
  if (status === 'error') return note('Couldn\'t load your saved games. Check your connection.');

  const solves = recentSolves(RECENT_LIMIT);
  if (!solves.length) return note('Games you finish will show up here.');
  for (const solve of solves) {
    const { title, detail } = describeSolve(solve);
    const row = document.createElement('div');
    row.className = 'recentRow';
    const main = document.createElement('div');
    const t = document.createElement('div');
    t.className = 'recentTitle';
    t.textContent = title;
    const dt = document.createElement('div');
    dt.className = 'recentDetail';
    dt.textContent = detail;
    main.append(t, dt);
    const date = document.createElement('div');
    date.className = 'recentDate';
    date.textContent = DATE_FMT.format(new Date(solve.created_at));
    row.append(main, date);
    list.appendChild(row);
  }
}
