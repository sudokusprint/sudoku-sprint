// Race mode: the player vs a simulated ghost that fills cells at a set pace.
import { generatePuzzle, CLUES } from '../core/generator.js';
import { formatTime, createCell, highlightBoard, buildPad, updatePadState, isComplete } from './board.js';
import { recordRace } from '../services/progress.js';

const GHOST_PACE_MS = { easy: 2800, medium: 3400, hard: 4000 };

let els;

let raceDifficulty = 'easy';
let raceSolution = [];
let racePuzzle = [];
let raceGiven = [];
let raceSelected = null;
let raceMoveHistory = [];
let raceTotalBlanks = 0;
let raceGhostFilled = 0;
let raceGhostTimeout = null;
let raceTicking = null;
let raceStartTime = null;
let raceOver = false;

export function initRace() {
  els = {
    board: document.getElementById('raceBoard'),
    pad: document.getElementById('racePad'),
    timer: document.getElementById('raceTimer'),
    youBar: document.getElementById('raceYouBar'),
    ghostBar: document.getElementById('raceGhostBar'),
    youPct: document.getElementById('raceYouPct'),
    ghostPct: document.getElementById('raceGhostPct'),
    resultOverlay: document.getElementById('raceResultOverlay'),
    resultTitle: document.getElementById('raceResultTitle'),
    resultDetail: document.getElementById('raceResultDetail'),
    undoBtn: document.getElementById('raceUndoBtn'),
    preStart: document.getElementById('racePreStart'),
    active: document.getElementById('raceActive'),
    diffButtons: document.querySelectorAll('#raceDiff button')
  };

  els.diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      els.diffButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      raceDifficulty = btn.dataset.d;
    });
  });

  document.getElementById('raceStartBtn').addEventListener('click', startRace);
  els.undoBtn.addEventListener('click', raceUndo);
  document.getElementById('raceQuitBtn').addEventListener('click', quitRace);
  document.getElementById('raceResultBtn').addEventListener('click', () => {
    els.resultOverlay.classList.remove('show');
    quitRace();
  });
}

function startRace() {
  raceOver = false;
  els.resultOverlay.classList.remove('show');
  const clues = CLUES[raceDifficulty];
  const { full, p } = generatePuzzle(clues);
  raceSolution = full;
  racePuzzle = p;
  raceGiven = p.map(row => row.map(v => v !== 0));
  raceSelected = null;
  raceMoveHistory = [];
  updateRaceUndoState();
  // generatePuzzle can stop above the requested clue count, so count the real blanks.
  raceTotalBlanks = p.flat().filter(v => v === 0).length;
  raceGhostFilled = 0;
  raceStartTime = Date.now();

  els.preStart.style.display = 'none';
  els.active.style.display = 'block';

  buildPad(els.pad, racePlace);
  renderRaceBoard();
  updateRaceProgress();

  clearInterval(raceTicking);
  raceTicking = setInterval(raceTick, 1000);
  scheduleGhostStep();
}

function raceElapsed() {
  return Math.floor((Date.now() - raceStartTime) / 1000);
}

function raceTick() {
  if (raceOver) return;
  els.timer.textContent = formatTime(raceElapsed());
}

function scheduleGhostStep() {
  if (raceOver) return;
  const base = GHOST_PACE_MS[raceDifficulty];
  const jitter = base * (0.5 + Math.random());
  raceGhostTimeout = setTimeout(() => {
    if (raceOver) return;
    raceGhostFilled = Math.min(raceGhostFilled + 1, raceTotalBlanks);
    updateRaceProgress();
    if (raceGhostFilled >= raceTotalBlanks) {
      endRace('ghost');
    } else {
      scheduleGhostStep();
    }
  }, jitter);
}

function renderRaceBoard() {
  els.board.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      els.board.appendChild(createCell(r, c, {
        value: racePuzzle[r][c],
        isGiven: raceGiven[r][c],
        solutionValue: raceSolution[r][c],
        onClick: () => { raceSelected = [r, c]; raceHighlight(); }
      }));
    }
  }
  raceHighlight();
  updatePadState(els.pad, racePuzzle, raceSolution);
}

function raceHighlight() {
  highlightBoard(els.board, raceSelected, racePuzzle);
}

export function racePlace(v) {
  if (!raceSelected || raceOver) return;
  const [r, c] = raceSelected;
  if (raceGiven[r][c]) return;
  if (racePuzzle[r][c] === v) return;
  raceMoveHistory.push({ r, c, prevValue: racePuzzle[r][c] });
  updateRaceUndoState();
  racePuzzle[r][c] = v;
  renderRaceBoard();
  updateRaceProgress();
  checkRaceWin();
}

export function raceUndo() {
  if (raceMoveHistory.length === 0 || raceOver) return;
  const last = raceMoveHistory.pop();
  racePuzzle[last.r][last.c] = last.prevValue;
  updateRaceUndoState();
  renderRaceBoard();
  updateRaceProgress();
}

function updateRaceUndoState() {
  els.undoBtn.disabled = raceMoveHistory.length === 0;
}

function updateRaceProgress() {
  let youCorrect = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!raceGiven[r][c] && racePuzzle[r][c] === raceSolution[r][c] && racePuzzle[r][c] !== 0) youCorrect++;
    }
  }
  const youPct = raceTotalBlanks > 0 ? Math.round((youCorrect / raceTotalBlanks) * 100) : 0;
  const ghostPctVal = raceTotalBlanks > 0 ? Math.round((raceGhostFilled / raceTotalBlanks) * 100) : 0;
  els.youBar.style.width = youPct + '%';
  els.ghostBar.style.width = ghostPctVal + '%';
  els.youPct.textContent = youPct + '%';
  els.ghostPct.textContent = ghostPctVal + '%';
}

function checkRaceWin() {
  if (isComplete(racePuzzle, raceSolution)) endRace('you');
}

function endRace(winner) {
  raceOver = true;
  clearInterval(raceTicking);
  clearTimeout(raceGhostTimeout);
  recordRace({ difficulty: raceDifficulty, seconds: raceElapsed(), won: winner === 'you' });
  if (winner === 'you') {
    els.resultTitle.textContent = '🎉 You won the race!';
    els.resultDetail.textContent = 'You finished in ' + els.timer.textContent + ', ahead of the ghost.';
  } else {
    els.resultTitle.textContent = '👻 Ghost won this one';
    els.resultDetail.textContent = 'The ghost finished first at ' + els.timer.textContent + '. Try again?';
  }
  els.resultOverlay.classList.add('show');
}

function quitRace() {
  if (!raceOver) {
    recordRace({ difficulty: raceDifficulty, seconds: raceElapsed(), won: false });
  }
  raceOver = true;
  clearInterval(raceTicking);
  clearTimeout(raceGhostTimeout);
  els.active.style.display = 'none';
  els.preStart.style.display = 'block';
}
