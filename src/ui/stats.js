// Home progress tiles and the Profile page (best times, completions, race record, recent games).
import { DIFFICULTIES, raceRecords } from '../core/stats.js';
import { currentStats, recentSolves, progressStatus } from '../services/progress.js';
import { formatTime } from './board.js';

const RECENT_LIMIT = 15;

// dailyStreak: the signed-in player's current Daily streak, or null if unknown / signed out.
export function renderHomeStats(dailyStreak = null) {
  const stats = currentStats();
  const grid = document.getElementById('homeStatsGrid');
  const totalSolved = DIFFICULTIES.reduce((sum, d) => sum + stats.completed[d], 0);
  const { wins, losses } = raceRecords(stats).overall;
  const racedAny = (wins + losses) > 0;
  const hasStreak = dailyStreak !== null && dailyStreak > 0;

  grid.innerHTML =
    '<div class="bestStat"><div class="bestStatLabel">Solved</div><div class="bestStatValue' + (totalSolved === 0 ? ' empty' : '') + '">' + (totalSolved || '—') + '</div></div>' +
    '<div class="bestStat"><div class="bestStatLabel">Race record</div><div class="bestStatValue' + (racedAny ? '' : ' empty') + '">' + (racedAny ? (wins + '-' + losses) : '—') + '</div></div>' +
    '<div class="bestStat"><div class="bestStatLabel">Daily streak</div><div class="bestStatValue' + (hasStreak ? '' : ' empty') + '">' + (hasStreak ? dailyStreak : (dailyStreak === 0 ? '0' : '—')) + '</div></div>';
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

  // Race record: friends, ghost, and overall.
  const records = raceRecords(stats);
  const rate = r => (r.wins + r.losses) > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) + '%' : '—';
  const row = (label, r, cls) =>
    '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + '</th>' +
    '<td>' + r.wins + '</td><td>' + r.losses + '</td><td>' + rate(r) + '</td></tr>';
  document.getElementById('raceRecordTotals').innerHTML =
    '<table class="raceRecordTable">' +
    '<thead><tr><th></th><th scope="col">Wins</th><th scope="col">Losses</th><th scope="col">Win rate</th></tr></thead>' +
    '<tbody>' +
    row('vs. friends', records.friends) +
    row('vs. ghost', records.ghost) +
    row('Overall', records.overall, 'overall') +
    '</tbody></table>';

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
    return { title: 'Ghost race' + d, detail: (solve.won ? 'Won in ' : 'Lost at ') + formatTime(solve.seconds || 0) };
  }
  if (solve.mode === 'friend_race') {
    const d = solve.difficulty ? ' · ' + cap(solve.difficulty) : '';
    return { title: 'Friend race' + d, detail: solve.won ? 'Won in ' + formatTime(solve.seconds || 0) : 'Lost' };
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
