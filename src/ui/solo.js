// Solo mode: graded puzzles, timer, mistakes, notes, undo, pause, best times.
import { generatePuzzleByDifficulty, DIFFICULTY_TIER, MIN_CLUES } from '../core/generator.js';
import { TIER_NAME } from '../core/techniques.js';
import { formatTime, createCell, highlightBoard, buildPad, updatePadState, isComplete } from './board.js';
import { recordSolo, bestSeconds } from '../services/progress.js';
import { launchConfetti } from './confetti.js';
import { getSettings } from '../services/settings.js';
import { findConflicts, peersOf } from '../core/grid.js';

let els;

let difficulty = 'easy';
let solution = [];
let puzzle = [];
let given = [];
let selected = null;
let startTime = null;
let elapsed = 0;
let ticking = null;
let solved = false;
let paused = false;
let mistakes = 0;
let moveHistory = [];
let notes = [];
let notesMode = false;
let genSeq = 0;
let genNoteText = '';       // the puzzle info line shown above the board

export function initSolo() {
  els = {
    board: document.getElementById('board'),
    pad: document.getElementById('pad'),
    timer: document.getElementById('timer'),
    best: document.getElementById('best'),
    mistakes: document.getElementById('mistakes'),
    genNote: document.getElementById('genNote'),
    winOverlay: document.getElementById('winOverlay'),
    winDetail: document.getElementById('winDetail'),
    pauseOverlay: document.getElementById('pauseOverlay'),
    pauseBtn: document.getElementById('pauseBtn'),
    undoBtn: document.getElementById('undoBtn'),
    notesBtn: document.getElementById('notesBtn'),
    diffButtons: document.querySelectorAll('#soloView .diff button'),
    picker: document.getElementById('soloPicker'),
    game: document.getElementById('soloGame')
  };

  document.getElementById('winAgain').addEventListener('click', showPicker);

  els.diffButtons.forEach(btn => {
    btn.addEventListener('click', () => chooseDifficulty(btn.dataset.d));
  });
  // Nothing is generated (and no timer runs) until the player picks a difficulty.
  els.picker.querySelectorAll('[data-pick]').forEach(card => {
    card.addEventListener('click', () => chooseDifficulty(card.dataset.pick));
  });

  document.getElementById('newBtn').addEventListener('click', showPicker);
  els.undoBtn.addEventListener('click', undo);
  els.pauseBtn.addEventListener('click', () => {
    if (paused) resumeGame(); else pauseGame();
  });
  document.getElementById('resumeBtn').addEventListener('click', resumeGame);

  els.notesBtn.addEventListener('click', (e) => {
    notesMode = !notesMode;
    e.currentTarget.classList.toggle('active', notesMode);
    e.currentTarget.textContent = notesMode ? 'Notes: On' : 'Notes: Off';
    els.board.classList.toggle('notesActive', notesMode);
  });

  buildPad(els.pad, place);
  renderPickerBests();
}

function chooseDifficulty(d) {
  difficulty = d;
  els.diffButtons.forEach(b => b.classList.toggle('active', b.dataset.d === d));
  els.picker.hidden = true;
  els.game.hidden = false;
  startPuzzle();
}

// "New puzzle": drop the current puzzle (timer stopped) and go back to the difficulty picker.
function showPicker() {
  genSeq++;                  // ignore a puzzle that's still being generated
  clearInterval(ticking);
  solved = false;
  paused = false;
  puzzle = [];
  solution = [];
  given = [];
  selected = null;
  mistakes = 0;
  moveHistory = [];
  elapsed = 0;
  els.board.classList.remove('paused');
  els.board.innerHTML = '';
  els.pauseOverlay.classList.remove('show');
  els.pauseBtn.textContent = '⏸';
  els.winOverlay.classList.remove('show');
  els.timer.textContent = '0:00';
  genNoteText = '';
  els.genNote.textContent = '';
  updateUndoState();
  renderMistakes();
  renderPickerBests();
  els.game.hidden = true;
  els.picker.hidden = false;
  window.scrollTo(0, 0);
}

function renderPickerBests() {
  els.picker.querySelectorAll('[data-best]').forEach(el => {
    const s = bestSeconds(el.dataset.best);
    el.innerHTML = '';
    if (s === null) return;
    const label = document.createElement('span');
    label.className = 'diffCardBestLabel';
    label.textContent = 'Best';
    const time = document.createElement('span');
    time.className = 'diffCardBestTime';
    time.textContent = formatTime(s);
    el.append(label, time);
  });
}

// Re-render after a theme change (only once a puzzle exists).
export function refreshBoard() {
  if (puzzle.length) renderBoard();
}

function startPuzzle() {
  solved = false;
  paused = false;
  els.board.classList.remove('paused');
  els.pauseOverlay.classList.remove('show');
  els.pauseBtn.textContent = '⏸';
  mistakes = 0;
  moveHistory = [];
  updateUndoState();
  renderMistakes();
  els.winOverlay.classList.remove('show');
  genNoteText = 'Generating a verified ' + difficulty + ' puzzle…';
  els.genNote.textContent = genNoteText;
  clearInterval(ticking);
  const seq = ++genSeq;
  // Defer the heavy generation one tick so the "generating" note can actually paint first.
  setTimeout(() => {
    if (seq !== genSeq) return;   // player went back to the picker meanwhile
    const targetTier = DIFFICULTY_TIER[difficulty];
    const gen = generatePuzzleByDifficulty(targetTier, MIN_CLUES[difficulty]);
    solution = gen.full;
    puzzle = gen.p;
    given = gen.p.map(row => row.map(v => v !== 0));
    notes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
    selected = null;
    elapsed = 0;
    startTime = Date.now();
    clearInterval(ticking);
    ticking = setInterval(tick, 1000);
    renderBoard();
    renderBest();
    tick();
    const base = 'Verified ' + TIER_NAME[gen.tier] + ' · ' + gen.clueCount + ' clues · needs: ' + (gen.techniques.join(', ') || 'Singles only');
    genNoteText = gen.tier < targetTier
      ? base + '  (couldn\'t find a genuine ' + TIER_NAME[targetTier] + ' this time — try New Puzzle again)'
      : base;
    els.genNote.textContent = genNoteText;
  }, 20);
}

function renderMistakes() {
  els.mistakes.textContent = !getSettings().showMistakes && !solved
    ? 'Mistakes hidden'
    : mistakes + (mistakes === 1 ? ' mistake' : ' mistakes');
}

function tick() {
  if (solved || paused) return;
  elapsed = Math.floor((Date.now() - startTime) / 1000);
  els.timer.textContent = formatTime(elapsed);
}

function renderBoard() {
  const { showMistakes } = getSettings();
  // With mistakes hidden, only rule clashes are marked (like the Daily Challenge).
  const conflicts = showMistakes ? null : findConflicts(puzzle);
  els.board.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = createCell(r, c, {
        value: puzzle[r][c],
        isGiven: given[r][c],
        solutionValue: solution[r][c],
        isBad: conflicts ? conflicts.has(r + ',' + c) : undefined,
        onClick: () => selectCell(r, c)
      });
      if (puzzle[r][c] === 0 && notes[r][c] && notes[r][c].size > 0) {
        const grid = document.createElement('div');
        grid.className = 'notes';
        for (let n = 1; n <= 9; n++) {
          const s = document.createElement('span');
          if (notes[r][c].has(n)) s.textContent = n;
          grid.appendChild(s);
        }
        cell.appendChild(grid);
      }
      els.board.appendChild(cell);
    }
  }
  highlight();
  if (showMistakes) {
    updatePadState(els.pad, puzzle, solution);
  } else {
    // Don't reveal wrong digits through the pad: strike a digit once all nine are placed without clashes.
    for (let v = 1; v <= 9; v++) {
      let count = 0, clash = false;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] === v) { count++; if (conflicts.has(r + ',' + c)) clash = true; }
      }
      const btn = els.pad.querySelector('button[data-v="' + v + '"]');
      if (btn) btn.classList.toggle('done', count === 9 && !clash);
    }
  }
  renderMistakes();
  renderFullGridHint();
}

// With mistakes hidden, say so when the grid is full but not right.
function renderFullGridHint() {
  if (getSettings().showMistakes || solved || !puzzle.length) {
    if (els.genNote.textContent !== genNoteText) els.genNote.textContent = genNoteText;
    return;
  }
  const full = puzzle.every(row => !row.includes(0));
  els.genNote.textContent = full ? 'Every cell is filled, but some numbers are wrong. Keep looking!' : genNoteText;
}

function highlight() {
  highlightBoard(els.board, selected, puzzle);
}

function selectCell(r, c) {
  selected = [r, c];
  highlight();
}

export function place(v) {
  if (!selected || solved || paused) return;
  const [r, c] = selected;
  if (given[r][c] === true) return;
  if (notesMode) {
    if (puzzle[r][c] !== 0) return;
    if (notes[r][c].has(v)) notes[r][c].delete(v);
    else notes[r][c].add(v);
    renderBoard();
    return;
  }
  if (puzzle[r][c] === v) return;
  const prevValue = puzzle[r][c];
  const prevNotes = notes[r][c];
  puzzle[r][c] = v;
  notes[r][c] = new Set();
  // Auto-clear: remove v from notes in the same row, column, and box (remembered for undo).
  const clearedPeers = [];
  if (getSettings().autoClearNotes) {
    for (const [pr, pc] of peersOf(r, c)) {
      if (notes[pr][pc].delete(v)) clearedPeers.push([pr, pc]);
    }
  }
  let mistakeDelta = 0;
  if (v !== solution[r][c]) {
    mistakes++;
    mistakeDelta = 1;
  }
  moveHistory.push({ r, c, v, prevValue, prevNotes, clearedPeers, mistakeDelta });
  updateUndoState();
  renderBoard();
  checkWin();
}

export function undo() {
  if (moveHistory.length === 0 || paused || solved) return;
  const last = moveHistory.pop();
  puzzle[last.r][last.c] = last.prevValue;
  notes[last.r][last.c] = last.prevNotes;
  for (const [pr, pc] of last.clearedPeers) notes[pr][pc].add(last.v);
  if (last.mistakeDelta) {
    mistakes = Math.max(0, mistakes - last.mistakeDelta);
  }
  updateUndoState();
  renderBoard();
}

function updateUndoState() {
  els.undoBtn.disabled = moveHistory.length === 0;
}

function checkWin() {
  if (!isComplete(puzzle, solution)) return;
  solved = true;
  clearInterval(ticking);
  recordSolo({ difficulty, seconds: elapsed, mistakes });
  renderBest();
  renderMistakes();
  renderFullGridHint();
  els.winDetail.textContent = 'Time: ' + els.timer.textContent + ' · ' + mistakes + (mistakes === 1 ? ' mistake' : ' mistakes');
  els.winOverlay.classList.add('show');
  launchConfetti();
}

// Also called when stats change (sign-in, sign-out, progress loaded).
export function renderBest() {
  if (!els) return;
  renderPickerBests();
  const s = bestSeconds(difficulty);
  els.best.textContent = s !== null
    ? 'Best on ' + difficulty + ': ' + formatTime(s)
    : 'No best time yet on ' + difficulty;
}

export function pauseGame() {
  if (solved || paused || !puzzle.length) return;
  paused = true;
  clearInterval(ticking);
  els.board.classList.add('paused');
  els.pauseOverlay.classList.add('show');
  els.pauseBtn.textContent = '▶';
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  startTime = Date.now() - elapsed * 1000;
  clearInterval(ticking);
  ticking = setInterval(tick, 1000);
  els.board.classList.remove('paused');
  els.pauseOverlay.classList.remove('show');
  els.pauseBtn.textContent = '⏸';
}
