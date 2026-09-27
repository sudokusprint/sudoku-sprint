// Home progress tiles and the Profile page (best times, completions, race record, friends).
import { TECHNIQUES_INFO, MASTERY_TARGET } from '../core/techniques.js';
import { readInt, getMasteryCount, readBestSeconds } from './storage.js';
import { formatTime } from './board.js';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

// Placeholder data — friends aren't connected to anything yet.
const FRIENDS = [
  { name: 'Jordan', status: 'Playing Medium', online: true },
  { name: 'Sam', status: 'Last seen 2h ago', online: false },
  { name: 'Riley', status: 'Playing Hard', online: true },
  { name: 'Casey', status: 'Last seen yesterday', online: false }
];

export function renderHomeStats() {
  const grid = document.getElementById('homeStatsGrid');
  let totalSolved = 0;
  DIFFICULTIES.forEach(d => { totalSolved += readInt('sudoku-completed-' + d); });
  const wins = readInt('sudoku-race-wins');
  const losses = readInt('sudoku-race-losses');
  const racedAny = (wins + losses) > 0;
  const practiceable = TECHNIQUES_INFO.filter(t => t.practiceable !== false);
  const masteredCount = practiceable.filter(t => getMasteryCount(t.name) >= MASTERY_TARGET).length;

  grid.innerHTML =
    '<div class="bestStat"><div class="bestStatLabel">Solved</div><div class="bestStatValue' + (totalSolved === 0 ? ' empty' : '') + '">' + (totalSolved || '—') + '</div></div>' +
    '<div class="bestStat"><div class="bestStatLabel">Race record</div><div class="bestStatValue' + (racedAny ? '' : ' empty') + '">' + (racedAny ? (wins + '-' + losses) : '—') + '</div></div>' +
    '<div class="bestStat"><div class="bestStatLabel">Mastered</div><div class="bestStatValue' + (masteredCount === 0 ? ' empty' : '') + '">' + masteredCount + '/' + practiceable.length + '</div></div>';
}

export function renderProfile() {
  const grid = document.getElementById('completedGrid');
  const totalsEl = document.getElementById('profileTotals');
  const friendsEl = document.getElementById('friendsList');

  grid.innerHTML = '';
  let total = 0;
  DIFFICULTIES.forEach(d => {
    const count = readInt('sudoku-completed-' + d);
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
  const wins = readInt('sudoku-race-wins');
  const losses = readInt('sudoku-race-losses');
  const played = wins + losses;
  const winRate = played > 0 ? Math.round((wins / played) * 100) + '%' : '—';
  raceTotalsEl.innerHTML =
    '<div class="profileTotal"><div class="profileTotalValue">' + wins + '</div><div class="profileTotalLabel">Wins</div></div>' +
    '<div class="profileTotal"><div class="profileTotalValue">' + losses + '</div><div class="profileTotalLabel">Losses</div></div>' +
    '<div class="profileTotal"><div class="profileTotalValue">' + winRate + '</div><div class="profileTotalLabel">Win rate</div></div>';

  friendsEl.innerHTML = '';
  FRIENDS.forEach(f => {
    const card = document.createElement('div');
    card.className = 'friendCard';
    card.innerHTML =
      '<div class="friendAvatar">🙂</div>' +
      '<div><div class="friendName">' + f.name + '</div><div class="friendStatus">' + f.status + '</div></div>' +
      '<div class="friendDot ' + (f.online ? 'online' : 'offline') + '"></div>';
    friendsEl.appendChild(card);
  });
}

// Best-time tiles on the Profile page.
export function renderLobbyBest() {
  const grid = document.getElementById('bestGrid');
  grid.innerHTML = '';
  let anySet = false;
  DIFFICULTIES.forEach(d => {
    let display = '—';
    let empty = true;
    try {
      const s = readBestSeconds(d);
      if (s !== null) {
        display = formatTime(s);
        empty = false;
        anySet = true;
      }
    } catch (e) {}
    const stat = document.createElement('div');
    stat.className = 'bestStat';
    stat.innerHTML =
      '<div class="bestStatLabel">' + d + '</div>' +
      '<div class="bestStatValue' + (empty ? ' empty' : '') + '">' + display + '</div>';
    grid.appendChild(stat);
  });
  if (!anySet) {
    const note = document.createElement('div');
    note.className = 'bestEmptyNote';
    note.textContent = 'Play a puzzle to set your first best time.';
    grid.appendChild(note);
  }
}
