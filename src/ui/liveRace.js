// Race a friend: invite link / code, lobby, 3-2-1 countdown, the same puzzle for
// everyone, live progress bars, and a results card. Casual and unranked.
import { generatePuzzleByDifficulty, DIFFICULTY_TIER, MIN_CLUES } from '../core/generator.js';
import { gridToString, gridFromString } from '../core/grid.js';
import { makeCode, normalizeCode, isValidCode, joinRoom, MAX_PLAYERS } from '../services/liveRace.js';
import { getAccount } from '../services/account.js';
import { createCell, highlightBoard, buildPad, updatePadState, isComplete, formatTime } from './board.js';
import { launchConfetti } from './confetti.js';
import { recordFriendRace } from '../services/progress.js';

const $ = id => document.getElementById(id);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const COUNTDOWN_SECONDS = 3;

let els;
let room = null;            // connection from services/liveRace.js
let me = null;              // { id, name, host, joinedAt, difficulty }
let code = '';
let players = [];           // everyone currently in the room
let phase = 'idle';         // idle | lobby | countdown | racing
let lobbyDifficulty = 'easy';
let guestName = null;

// The current race
let race = null;            // { raceId, difficulty, solution, puzzle, given, totalBlanks, racers }
let selected = null;
let moves = [];        // undo stack: { r, c, prev }
let mistakes = 0;
let startTime = 0;
let ticking = null;
let finishedMe = false;
let progress = {};          // id -> correct cells
let finishes = {};          // id -> { seconds, mistakes, order }
let foreignRace = false;    // someone is racing a race we're not part of

export function initLiveRace() {
  els = {
    preStart: $('racePreStart'), lobby: $('liveLobby'), active: $('liveActive'),
    diff: $('liveDiff'), createBtn: $('liveCreateBtn'), joinForm: $('liveJoinForm'), codeInput: $('liveCodeInput'), error: $('liveError'),
    lobbyTag: $('liveLobbyTag'), code: $('liveCode'), shareBtn: $('liveShareBtn'), copyBtn: $('liveCopyBtn'), copyNote: $('liveCopyNote'),
    lobbyDiff: $('liveLobbyDiff'), lobbyDiffText: $('liveLobbyDiffText'),
    players: $('livePlayers'), lobbyStatus: $('liveLobbyStatus'), startBtn: $('liveStartBtn'), leaveBtn: $('liveLeaveBtn'),
    bars: $('liveBars'), timer: $('liveTimer'), mistakes: $('liveMistakes'), diffLabel: $('liveDiffLabel'),
    board: $('liveBoard'), countdown: $('liveCountdown'), pad: $('livePad'),
    undoBtn: $('liveUndoBtn'), quitBtn: $('liveQuitBtn'), status: $('liveStatus'),
    resultOverlay: $('liveResultOverlay'), resultTitle: $('liveResultTitle'), results: $('liveResults')
  };

  const pickIn = (container, onPick) => container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => onPick(btn.dataset.d));
  });
  pickIn(els.diff, d => setActive(els.diff, d));
  pickIn(els.lobbyDiff, d => {
    lobbyDifficulty = d;
    setActive(els.lobbyDiff, d);
    if (room && me && me.host) { me.difficulty = d; room.updateMe(me); }
  });

  els.createBtn.addEventListener('click', createRace);
  els.joinForm.addEventListener('submit', e => { e.preventDefault(); joinRace(els.codeInput.value); });
  els.codeInput.addEventListener('input', () => { els.codeInput.value = normalizeCode(els.codeInput.value); });
  els.shareBtn.addEventListener('click', shareInvite);
  els.copyBtn.addEventListener('click', copyInvite);
  els.startBtn.addEventListener('click', hostStart);
  els.leaveBtn.addEventListener('click', leaveRoom);
  els.quitBtn.addEventListener('click', leaveRoom);
  els.undoBtn.addEventListener('click', undo);
  $('liveResultBtn').addEventListener('click', () => {
    els.resultOverlay.classList.remove('show');
    showLobby();
  });
  buildPad(els.pad, place);
}

function setActive(container, d) {
  container.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.d === d));
}

export function isRacing() {
  return phase === 'racing' && !finishedMe;
}

// ---------- joining ----------

function myName() {
  const account = getAccount();
  if (account.status === 'signedIn' && account.profile) return '@' + account.profile.username;
  if (!guestName) guestName = 'Guest ' + (100 + Math.floor(Math.random() * 900));
  return guestName;
}

function inviteUrl() {
  return location.origin + location.pathname + '?race=' + code;
}

async function createRace() {
  const d = els.diff.querySelector('button.active')?.dataset.d || 'easy';
  await enterRoom(makeCode(), true, d);
}

// Open a new hosted lobby (used by friend invites). Returns the code, or null on failure.
export async function hostRace(difficulty) {
  const c = makeCode();
  await enterRoom(c, true, difficulty);
  return room && code === c ? c : null;
}

// The open lobby's code and difficulty if we're hosting one, else null.
export function hostedLobby() {
  return room && me && me.host && phase === 'lobby' ? { code, difficulty: lobbyDifficulty } : null;
}

// Called for "?race=CODE" links and the code box.
export async function joinRace(text) {
  const c = normalizeCode(text);
  if (!isValidCode(c)) {
    els.error.textContent = 'Race codes are 6 letters and numbers, like K7QF2M.';
    return;
  }
  await enterRoom(c, false, null);
}

async function enterRoom(roomCode, host, difficulty) {
  if (room) await leaveRoom();
  els.error.textContent = '';
  els.createBtn.disabled = true;
  code = roomCode;
  lobbyDifficulty = difficulty || 'easy';
  me = { id: crypto.randomUUID(), name: myName(), host, joinedAt: Date.now() };
  if (host) me.difficulty = lobbyDifficulty;
  try {
    room = await joinRoom(code, me, { onPlayers, onMessage });
  } catch (err) {
    room = null;
    els.error.textContent = err.message;
    els.createBtn.disabled = false;
    return;
  }
  els.createBtn.disabled = false;
  // Keep the link in the address bar so a refresh rejoins.
  if (!host) history.replaceState(null, '', '?race=' + code);
  showLobby();
}

// Count the race in the player's race record, once: won = finished first.
function recordResult(won) {
  if (!race || race.recorded) return;
  race.recorded = true;
  recordFriendRace({
    difficulty: race.difficulty,
    seconds: phase === 'racing' ? elapsedSeconds() : null,
    won
  });
}

async function leaveRoom() {
  clearInterval(ticking);
  // Leaving mid-race before anyone finished counts as a loss (like quitting a ghost race).
  if (phase === 'racing' || phase === 'countdown') recordResult(false);
  const r = room;
  room = null;
  phase = 'idle';
  race = null;
  players = [];
  foreignRace = false;
  els.resultOverlay.classList.remove('show');
  if (r) { try { await r.leave(); } catch (e) {} }
  if (location.search.includes('race=')) history.replaceState(null, '', location.pathname);
  els.lobby.hidden = true;
  els.active.hidden = true;
  els.preStart.style.display = 'block';
}

// ---------- room events ----------

function onPlayers(list) {
  players = list;
  // Too many people: the latest arrivals leave again.
  const rank = players.findIndex(p => p.id === me.id);
  if (rank >= MAX_PLAYERS) {
    leaveRoom().then(() => { els.error.textContent = 'That race is full (' + MAX_PLAYERS + ' players max).'; });
    return;
  }
  if (phase === 'lobby') renderLobby();
  if (phase === 'racing' || phase === 'countdown') renderBars();
  if (els.resultOverlay.classList.contains('show')) renderResults();
}

function onMessage(event, payload) {
  if (event === 'start') {
    if (phase === 'lobby') beginRace(payload);
    return;
  }
  if (!race || payload.raceId !== race.raceId) {
    // Messages from a race we're not in: someone joined mid-race.
    if (phase === 'lobby' && !foreignRace) { foreignRace = true; renderLobby(); }
    return;
  }
  if (event === 'progress') {
    progress[payload.id] = payload.correct;
    renderBars();
  } else if (event === 'finish') {
    progress[payload.id] = race.totalBlanks;
    finishes[payload.id] = { seconds: payload.seconds, mistakes: payload.mistakes, order: Object.keys(finishes).length + 1 };
    if (!finishedMe) recordResult(false);   // someone beat us to it
    renderBars();
    if (els.resultOverlay.classList.contains('show')) renderResults();
    if (!finishedMe) els.status.textContent = playerName(payload.id) + ' finished in ' + formatTime(payload.seconds) + '!';
  }
}

function playerName(id) {
  if (me && id === me.id) return 'You';
  const p = players.find(x => x.id === id) || (race && race.racers.find(x => x.id === id));
  return p ? p.name : 'A player';
}

// ---------- lobby ----------

function showLobby() {
  phase = 'lobby';
  clearInterval(ticking);
  els.preStart.style.display = 'none';
  els.active.hidden = true;
  els.lobby.hidden = false;
  els.code.textContent = code;
  els.copyNote.textContent = '';
  // Phones get a Share button (plus Copy); without a share sheet, one Copy button is enough.
  els.shareBtn.textContent = navigator.share ? 'Share invite' : 'Copy invite link';
  els.copyBtn.hidden = !navigator.share;
  window.scrollTo(0, 0);
  renderLobby();
}

function renderLobby() {
  const host = players.find(p => p.host);
  const isHost = me && me.host;
  els.lobbyTag.textContent = isHost ? 'Send the code or link to a friend' : 'You\'re in! Waiting for the host to start';

  // Difficulty: the host picks; everyone else sees the host's choice.
  els.lobbyDiff.hidden = !isHost;
  els.lobbyDiffText.hidden = isHost;
  if (isHost) setActive(els.lobbyDiff, lobbyDifficulty);
  else els.lobbyDiffText.textContent = host && host.difficulty ? cap(host.difficulty) : '—';

  els.players.innerHTML = '';
  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'livePlayer' + (p.id === me.id ? ' me' : '');
    const name = document.createElement('span');
    name.textContent = p.name + (p.id === me.id ? ' (you)' : '');
    row.appendChild(name);
    if (p.host) {
      const badge = document.createElement('span');
      badge.className = 'liveHostBadge';
      badge.textContent = 'Host';
      row.appendChild(badge);
    }
    els.players.appendChild(row);
  }

  const others = players.length - 1;
  els.startBtn.hidden = !isHost;
  els.startBtn.disabled = others < 1;
  if (isHost) {
    els.lobbyStatus.textContent = others < 1 ? 'Waiting for someone to join…' : 'Everyone ready? Start when you are.';
  } else if (!host) {
    els.lobbyStatus.textContent = 'Waiting for the host… If nobody shows up, check the code.';
  } else {
    els.lobbyStatus.textContent = foreignRace
      ? 'A race is already underway. You\'ll be in the next one.'
      : 'Waiting for ' + host.name + ' to start the race…';
  }
}

async function shareInvite() {
  const url = inviteUrl();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Sudoku Sprint race', text: 'Race me in Sudoku Sprint! Code: ' + code, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // they closed the share sheet
    }
  }
  copyInvite();
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteUrl());
    els.copyNote.textContent = 'Link copied. Paste it in a message to your friend.';
  } catch (e) {
    els.copyNote.textContent = 'Couldn\'t copy automatically. The link is ' + inviteUrl();
  }
}

// ---------- starting ----------

function hostStart() {
  if (!me || !me.host || phase !== 'lobby') return;
  els.startBtn.disabled = true;
  els.lobbyStatus.textContent = 'Preparing the puzzle…';
  // Let the message paint before the (blocking) generation.
  setTimeout(() => {
    const d = lobbyDifficulty;
    const gen = generatePuzzleByDifficulty(DIFFICULTY_TIER[d], MIN_CLUES[d]);
    const payload = {
      raceId: crypto.randomUUID(),
      difficulty: d,
      puzzle: gridToString(gen.p),
      solution: gridToString(gen.full),
      racers: players.map(p => ({ id: p.id, name: p.name }))
    };
    room.send('start', payload);
    beginRace(payload);
  }, 30);
}

function beginRace(payload) {
  const puzzle = gridFromString(payload.puzzle);
  race = {
    raceId: payload.raceId,
    difficulty: payload.difficulty,
    solution: gridFromString(payload.solution),
    puzzle,
    given: puzzle.map(row => row.map(v => v !== 0)),
    totalBlanks: puzzle.flat().filter(v => v === 0).length,
    racers: payload.racers || players.map(p => ({ id: p.id, name: p.name }))
  };
  progress = {};
  finishes = {};
  foreignRace = false;
  finishedMe = false;
  selected = null;
  moves = [];
  mistakes = 0;
  els.status.textContent = '';
  els.lobby.hidden = true;
  els.active.hidden = false;
  els.diffLabel.textContent = cap(race.difficulty);
  els.timer.textContent = '0:00';
  window.scrollTo(0, 0);
  renderMistakes();
  updateUndo();
  renderBars();

  // 3-2-1, with the board hidden until "Go!"
  phase = 'countdown';
  els.board.innerHTML = '';
  els.board.classList.add('paused');
  els.countdown.hidden = false;
  let n = COUNTDOWN_SECONDS;
  const step = () => {
    if (phase !== 'countdown') return;
    if (n > 0) {
      els.countdown.textContent = n--;
      setTimeout(step, 1000);
    } else {
      els.countdown.textContent = 'Go!';
      setTimeout(() => { els.countdown.hidden = true; }, 500);
      startPlaying();
    }
  };
  step();
}

function startPlaying() {
  phase = 'racing';
  els.board.classList.remove('paused');
  renderBoard();
  startTime = Date.now();
  clearInterval(ticking);
  ticking = setInterval(tick, 1000);
}

function elapsedSeconds() {
  return Math.floor((Date.now() - startTime) / 1000);
}

function tick() {
  if (phase !== 'racing' || finishedMe) return;
  els.timer.textContent = formatTime(elapsedSeconds());
}

// ---------- playing ----------

function renderBoard() {
  els.board.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      els.board.appendChild(createCell(r, c, {
        value: race.puzzle[r][c],
        isGiven: race.given[r][c],
        solutionValue: race.solution[r][c],
        onClick: () => { selected = [r, c]; highlightBoard(els.board, selected, race.puzzle); }
      }));
    }
  }
  highlightBoard(els.board, selected, race.puzzle);
  updatePadState(els.pad, race.puzzle, race.solution);
}

function countCorrect() {
  let n = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (!race.given[r][c] && race.puzzle[r][c] === race.solution[r][c]) n++;
  }
  return n;
}

export function place(v) {
  if (!isRacing() || !selected) return;
  const [r, c] = selected;
  const locked = race.given[r][c] || (race.puzzle[r][c] !== 0 && race.puzzle[r][c] === race.solution[r][c]);
  if (locked) {
    highlightBoard(els.board, selected, race.puzzle, v);   // show where that number is
    return;
  }
  if (race.puzzle[r][c] === v) return;
  if (v === race.solution[r][c]) {
    // Correct: locks, so it's not undoable (and earlier moves here can't undo it).
    moves = moves.filter(m => !(m.r === r && m.c === c));
  } else {
    moves.push({ r, c, prev: race.puzzle[r][c] });
    mistakes++;   // stays counted even if undone
  }
  race.puzzle[r][c] = v;
  afterMove();
}

export function undo() {
  if (!isRacing() || !moves.length) return;
  const last = moves.pop();
  race.puzzle[last.r][last.c] = last.prev;
  afterMove();
}

function afterMove() {
  updateUndo();
  renderMistakes();
  renderBoard();
  const correct = countCorrect();
  progress[me.id] = correct;
  renderBars();
  room.send('progress', { raceId: race.raceId, id: me.id, correct, total: race.totalBlanks });
  if (isComplete(race.puzzle, race.solution)) finishMine();
}

function updateUndo() {
  els.undoBtn.disabled = !isRacing() || moves.length === 0;
}

function renderMistakes() {
  els.mistakes.textContent = mistakes + (mistakes === 1 ? ' mistake' : ' mistakes');
}

function finishMine() {
  finishedMe = true;
  clearInterval(ticking);
  const seconds = elapsedSeconds();
  els.timer.textContent = formatTime(seconds);
  finishes[me.id] = { seconds, mistakes, order: Object.keys(finishes).length + 1 };
  recordResult(finishes[me.id].order === 1);   // no-op if a loss was already recorded
  room.send('finish', { raceId: race.raceId, id: me.id, seconds, mistakes });
  updateUndo();
  renderBars();
  if (finishes[me.id].order === 1) launchConfetti();
  renderResults();
  els.resultOverlay.classList.add('show');
}

// ---------- progress bars and results ----------

function racersInRace() {
  const present = new Set(players.map(p => p.id));
  return race.racers.map(r => ({ ...r, left: !present.has(r.id) && !finishes[r.id] }));
}

function renderBars() {
  if (!race) return;
  els.bars.innerHTML = '';
  for (const r of racersInRace()) {
    const isMe = r.id === me.id;
    const pct = Math.round(((progress[r.id] || 0) / race.totalBlanks) * 100);
    const row = document.createElement('div');
    row.className = 'raceCardRow liveBarRow';
    const name = document.createElement('span');
    name.className = 'liveBarName' + (isMe ? ' me' : '');
    name.textContent = isMe ? 'You' : r.name;
    const track = document.createElement('div');
    track.className = 'raceBarTrack';
    const fill = document.createElement('div');
    fill.className = 'raceBarFill' + (isMe ? '' : ' ghost');
    fill.style.width = pct + '%';
    track.appendChild(fill);
    const label = document.createElement('span');
    label.className = 'racePct';
    label.textContent = finishes[r.id] ? 'Done' : r.left ? 'left' : pct + '%';
    row.append(name, track, label);
    els.bars.appendChild(row);
  }
}

function renderResults() {
  if (!race) return;
  const all = racersInRace();
  const done = all.filter(r => finishes[r.id]).sort((a, b) => finishes[a.id].order - finishes[b.id].order);
  const rest = all.filter(r => !finishes[r.id]);
  const myPlace = finishes[me.id] ? finishes[me.id].order : null;
  els.resultTitle.textContent = myPlace === 1 ? 'You won!' : myPlace ? 'You finished #' + myPlace : 'Results';
  els.results.innerHTML = '';
  done.forEach((r, i) => {
    const f = finishes[r.id];
    addResultRow('#' + (i + 1), r.id === me.id ? 'You' : r.name,
      formatTime(f.seconds) + ' · ' + f.mistakes + (f.mistakes === 1 ? ' mistake' : ' mistakes'), r.id === me.id);
  });
  for (const r of rest) {
    const pct = Math.round(((progress[r.id] || 0) / race.totalBlanks) * 100);
    addResultRow('…', r.name, r.left ? 'Left the race' : 'Still solving · ' + pct + '%', false);
  }
}

function addResultRow(rank, name, detail, isMe) {
  const row = document.createElement('div');
  row.className = 'leaderRow' + (isMe ? ' me' : '');
  const a = document.createElement('span');
  a.className = 'leaderRank';
  a.textContent = rank;
  const b = document.createElement('span');
  b.className = 'leaderName';
  b.textContent = name;
  const c = document.createElement('span');
  c.className = 'leaderTime liveResultDetail';
  c.textContent = detail;
  row.append(a, b, c);
  els.results.appendChild(row);
}
