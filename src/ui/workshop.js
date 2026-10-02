// Workshop: technique lessons, mastery tracking, and practice puzzles built around a technique.
import { generatePuzzleForTechnique, generatePuzzleByDifficulty } from '../core/generator.js';
import { TECHNIQUES_INFO, TIER_LABEL, MASTERY_TARGET, masteryStatus } from '../core/techniques.js';
import { createCell, highlightBoard, buildPad, isComplete } from './board.js';
import { recordWorkshop, masteryCount } from '../services/progress.js';
import { buildTechniqueDiagram } from './techniqueDiagram.js';
import { launchConfetti } from './confetti.js';

let els;

let workSolution = [], workPuzzle = [], workGiven = [], workSelected = null, workTechnique = '', workGenuineMatch = false;

export function initWorkshop() {
  els = {
    home: document.getElementById('workshopHome'),
    practice: document.getElementById('workshopPractice'),
    list: document.getElementById('techniqueList'),
    board: document.getElementById('workBoard'),
    pad: document.getElementById('workPad'),
    genNote: document.getElementById('workGenNote'),
    techName: document.getElementById('workTechName')
  };

  document.getElementById('workBackBtn').addEventListener('click', showWorkshopHome);
  document.getElementById('workNewBtn').addEventListener('click', () => startWorkshopPractice(workTechnique));
  document.getElementById('workEraseBtn').addEventListener('click', workErase);

  renderTechniqueList();
}

export function isPracticeOpen() {
  return els.practice.style.display !== 'none';
}

// Re-render mastery bars after stats change (sign-in, sign-out, progress loaded).
export function refreshTechniqueList() {
  if (els && !isPracticeOpen()) renderTechniqueList();
}

function renderTechniqueList() {
  const el = els.list;
  el.innerHTML = '';
  [1, 2, 3, 4].forEach(tier => {
    const inTier = TECHNIQUES_INFO.filter(t => t.tier === tier);
    if (inTier.length === 0) return;
    const title = document.createElement('div');
    title.className = 'techGroupTitle';
    title.textContent = TIER_LABEL[tier];
    el.appendChild(title);
    inTier.forEach(t => {
      const card = document.createElement('div');
      card.className = 'techCard';
      let actionHtml, masteryHtml = '', diagramHtml = '';
      if (t.practiceable === false) {
        diagramHtml = buildTechniqueDiagram(t.name);
        actionHtml = '<div class="raceNote" style="margin-top: 0;">This pattern is too rare to build practice puzzles around on demand, so it\'s shown as a worked example instead.</div>';
      } else {
        actionHtml = '<button>Practice this</button>';
        const count = masteryCount(t.name);
        const pct = Math.min(100, Math.round((count / MASTERY_TARGET) * 100));
        masteryHtml =
          '<div class="techMastery">' +
          '<div class="techMasteryLabel"><span>' + count + '/' + MASTERY_TARGET + ' solved</span><span class="status">' + masteryStatus(count) + '</span></div>' +
          '<div class="techMasteryTrack"><div class="techMasteryFill" style="width:' + pct + '%"></div></div>' +
          '</div>';
      }
      card.innerHTML =
        '<div class="techName">' + t.name + '</div>' +
        '<div class="techDesc">' + t.desc + '</div>' +
        diagramHtml + actionHtml + masteryHtml;
      if (t.practiceable !== false) {
        card.querySelector('button').addEventListener('click', () => startWorkshopPractice(t.name));
      }
      el.appendChild(card);
    });
  });
}

function startWorkshopPractice(techName) {
  workTechnique = techName;
  els.home.style.display = 'none';
  els.practice.style.display = 'block';
  els.techName.textContent = techName;
  els.genNote.textContent = 'Generating a puzzle that requires ' + techName + '…';
  els.board.innerHTML = '';
  els.pad.innerHTML = '';
  setTimeout(() => {
    let gen = generatePuzzleForTechnique(techName);
    let fellBack = false;
    if (!gen) {
      fellBack = true;
      const fallback = generatePuzzleByDifficulty(3, 17);
      gen = { full: fallback.full, p: fallback.p, techniques: fallback.techniques, clueCount: fallback.clueCount };
    }
    workGenuineMatch = !fellBack;
    workSolution = gen.full;
    workPuzzle = gen.p;
    workGiven = gen.p.map(row => row.map(v => v !== 0));
    workSelected = null;
    buildPad(els.pad, workPlace);
    renderWorkBoard();
    els.genNote.textContent = fellBack
      ? 'Couldn\'t generate one needing exactly ' + techName + ' this time — here\'s a puzzle needing: ' + (gen.techniques.join(', ') || 'Singles only') + '. Try again below.'
      : gen.clueCount + ' clues · confirmed to require: ' + gen.techniques.join(', ');
  }, 20);
}

function renderWorkBoard() {
  els.board.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      els.board.appendChild(createCell(r, c, {
        value: workPuzzle[r][c],
        isGiven: workGiven[r][c],
        solutionValue: workSolution[r][c],
        onClick: () => { workSelected = [r, c]; workHighlight(); }
      }));
    }
  }
  workHighlight();
}

// Redraw highlights after a settings change.
export function refreshHighlight() {
  if (els && workPuzzle.length) workHighlight();
}

function workHighlight() {
  highlightBoard(els.board, workSelected, workPuzzle);
}

// Givens and correct numbers are locked in place.
function workLocked(r, c) {
  return workGiven[r][c] || (workPuzzle[r][c] !== 0 && workPuzzle[r][c] === workSolution[r][c]);
}

export function workPlace(v) {
  if (!workSelected) return;
  const [r, c] = workSelected;
  if (workLocked(r, c)) {
    highlightBoard(els.board, workSelected, workPuzzle, v);   // show where that number is
    return;
  }
  workPuzzle[r][c] = v;
  renderWorkBoard();
  checkWorkWin();
}

export function workErase() {
  if (!workSelected) return;
  const [r, c] = workSelected;
  if (workLocked(r, c)) return;
  workPuzzle[r][c] = 0;
  renderWorkBoard();
}

function checkWorkWin() {
  if (!isComplete(workPuzzle, workSolution)) return;
  if (workGenuineMatch) {
    recordWorkshop({ technique: workTechnique });
    const count = masteryCount(workTechnique);
    els.genNote.textContent = '🎉 Solved! This puzzle required: ' + workTechnique + '. (' + count + '/' + MASTERY_TARGET + ' toward mastery)';
  } else {
    els.genNote.textContent = '🎉 Solved! (This one was a fallback puzzle, so it doesn\'t count toward ' + workTechnique + ' mastery.)';
  }
  launchConfetti();
}

function showWorkshopHome() {
  els.practice.style.display = 'none';
  els.home.style.display = 'block';
  renderTechniqueList();
}
