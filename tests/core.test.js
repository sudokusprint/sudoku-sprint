// Tests for the pure puzzle logic (grid, solver, generator).
// Runs in the browser via tests/index.html; no Node or test framework needed.
import { emptyGrid, valid } from '../src/core/grid.js';
import { countSolutions, solveLogical, computeCandidates } from '../src/core/solver.js';
import { fill, generatePuzzle, generatePuzzleByDifficulty, generatePuzzleForTechnique, CLUES, DIFFICULTY_TIER, MIN_CLUES } from '../src/core/generator.js';
import { EXAMPLE_DATA, TECHNIQUES_INFO } from '../src/core/techniques.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}

function isValidSolution(g) {
  const ok = set => set.size === 9 && !set.has(0);
  for (let i = 0; i < 9; i++) {
    const row = new Set(g[i]), col = new Set(g.map(r => r[i])), box = new Set();
    const br = Math.floor(i / 3) * 3, bc = (i % 3) * 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) box.add(g[br + r][bc + c]);
    if (!ok(row) || !ok(col) || !ok(box)) return false;
  }
  return true;
}

function puzzleMatchesSolution(p, full) {
  return p.every((row, r) => row.every((v, c) => v === 0 || v === full[r][c]));
}

const clueCount = p => p.flat().filter(v => v !== 0).length;

// A well-known puzzle solvable with singles only.
const EASY = [
  [5,3,0,0,7,0,0,0,0],[6,0,0,1,9,5,0,0,0],[0,9,8,0,0,0,0,6,0],
  [8,0,0,0,6,0,0,0,3],[4,0,0,8,0,3,0,0,1],[7,0,0,0,2,0,0,0,6],
  [0,6,0,0,0,0,2,8,0],[0,0,0,4,1,9,0,0,5],[0,0,0,0,8,0,0,7,9]
];

test('valid() rejects row, column and box clashes', () => {
  assert(!valid(EASY, 0, 2, 5), 'row clash');
  assert(!valid(EASY, 2, 0, 6), 'column clash');
  assert(!valid(EASY, 1, 1, 9), 'box clash');
  assert(valid(EASY, 0, 2, 4), 'legal move');
});

test('fill() produces a complete valid grid', () => {
  const g = emptyGrid();
  assert(fill(g), 'fill returned false');
  assert(isValidSolution(g), 'grid is not a valid solution');
});

test('countSolutions() distinguishes unique from ambiguous puzzles', () => {
  assertEqual(countSolutions(EASY, 2), 1, 'classic puzzle should be unique');
  assertEqual(countSolutions(emptyGrid(), 2), 2, 'empty grid stops at the limit');
});

test('countSolutions() does not mutate its input', () => {
  const copy = JSON.stringify(EASY);
  countSolutions(EASY, 2);
  assertEqual(JSON.stringify(EASY), copy);
});

test('computeCandidates() excludes digits seen by the cell', () => {
  const cand = computeCandidates(EASY);
  assertEqual(cand[0][0], 0, 'filled cell has no candidates');
  // r0c2 sees 5,3,7 (row), 8 (col), 6,9 (box) -> {1,2,4}
  assertEqual(cand[0][2], (1 << 0) | (1 << 1) | (1 << 3));
});

test('solveLogical() solves a singles-only puzzle at tier 1', () => {
  const res = solveLogical(EASY);
  assert(res.solved, 'not solved');
  assertEqual(res.tier, 1);
  assert(res.techniques.every(t => t === 'Naked Single' || t === 'Hidden Single'), res.techniques.join(','));
});

test('solveLogical() reports tier 5 when stuck', () => {
  const res = solveLogical(emptyGrid());
  assert(!res.solved);
  assertEqual(res.tier, 5);
});

test('generatePuzzle() returns a unique puzzle consistent with its solution', () => {
  for (const clues of Object.values(CLUES)) {
    const { full, p } = generatePuzzle(clues);
    assert(isValidSolution(full), 'bad solution');
    assert(puzzleMatchesSolution(p, full), 'clues disagree with solution');
    assertEqual(countSolutions(p, 2), 1, 'not unique');
    assert(clueCount(p) >= clues, 'fewer clues than requested');
  }
});

test('generatePuzzleByDifficulty() hits or stays below each target tier', () => {
  for (const d of ['easy', 'medium']) {
    const target = DIFFICULTY_TIER[d];
    const g = generatePuzzleByDifficulty(target, MIN_CLUES[d]);
    assert(isValidSolution(g.full), d + ': bad solution');
    assert(puzzleMatchesSolution(g.p, g.full), d + ': clues disagree');
    assertEqual(countSolutions(g.p, 2), 1, d + ': not unique');
    assert(g.tier <= target, d + ': tier ' + g.tier + ' above target');
    assertEqual(g.clueCount, clueCount(g.p), d + ': clueCount field');
    assertEqual(solveLogical(g.p).tier, g.tier, d + ': reported tier');
  }
});

test('generatePuzzleForTechnique() returns a puzzle that needs the technique', () => {
  const g = generatePuzzleForTechnique('Naked Pair');
  assert(g, 'no puzzle generated');
  assert(g.matched);
  const res = solveLogical(g.p);
  assert(res.solved && res.techniques.includes('Naked Pair'), res.techniques.join(','));
  assertEqual(countSolutions(g.p, 2), 1, 'not unique');
});

test('every non-practiceable technique has a worked example', () => {
  for (const t of TECHNIQUES_INFO.filter(t => t.practiceable === false)) {
    assert(EXAMPLE_DATA[t.name], 'missing example for ' + t.name);
  }
});
