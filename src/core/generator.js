// Puzzle generators. Pure — no DOM.
// Every generator returns { full, p, ... } where `full` is the solution grid
// and `p` is the puzzle (0 = blank).
import { emptyGrid, cloneGrid, shuffled, valid } from './grid.js';
import { countSolutions, solveLogical } from './solver.js';

// Clue counts for the simple (ungraded) generator used by Race mode.
export const CLUES = { easy: 40, medium: 32, hard: 26 };
// Solver tier each Solo difficulty aims for, and the clue floor while digging holes.
export const DIFFICULTY_TIER = { easy: 1, medium: 2, hard: 3 };
export const MIN_CLUES = { easy: 36, medium: 17, hard: 17 };

// Fill an empty grid with a random complete solution (randomized backtracking).
export function fill(grid) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        for (const v of shuffled([1,2,3,4,5,6,7,8,9])) {
          if (valid(grid, r, c, v)) {
            grid[r][c] = v;
            if (fill(grid)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

// Remove clues at random down to clueCount, keeping the solution unique.
// Not difficulty-graded; may stop above clueCount if no further cell can be removed.
export function generatePuzzle(clueCount) {
  const full = emptyGrid();
  fill(full);
  const p = cloneGrid(full);
  const cells = shuffled(Array.from({ length: 81 }, (_, i) => i));
  let removed = 0;
  const toRemove = 81 - clueCount;
  for (const idx of cells) {
    if (removed >= toRemove) break;
    const r = Math.floor(idx / 9), c = idx % 9;
    const backup = p[r][c];
    p[r][c] = 0;
    if (countSolutions(p, 2) !== 1) {
      p[r][c] = backup;
    } else {
      removed++;
    }
  }
  return { full, p };
}

// Dig holes while the puzzle stays unique and no harder than targetTier.
// Returns the first attempt that lands exactly on targetTier, otherwise the
// hardest attempt that stayed at or below it.
export function generatePuzzleByDifficulty(targetTier, minClues) {
  let best = null;
  const ATTEMPTS = 4;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const full = emptyGrid();
    fill(full);
    const p = cloneGrid(full);
    const cellOrder = shuffled(Array.from({ length: 81 }, (_, i) => i));
    let clueCount = 81;
    for (const idx of cellOrder) {
      if (clueCount <= minClues) break;
      const r = Math.floor(idx / 9), c = idx % 9;
      if (p[r][c] === 0) continue;
      const backup = p[r][c];
      p[r][c] = 0;
      if (countSolutions(p, 2) !== 1) { p[r][c] = backup; continue; }
      const res = solveLogical(p);
      const tier = res.solved ? res.tier : 5;
      if (tier > targetTier) {
        p[r][c] = backup; // too hard for our target, keep the clue
      } else {
        clueCount--;
      }
    }
    const final = solveLogical(p);
    const finalTier = final.solved ? final.tier : 5;
    const candidate = { full, p, tier: finalTier, techniques: final.techniques, clueCount };
    if (finalTier === targetTier) return candidate;
    if (!best || (finalTier <= targetTier && finalTier > best.tier)) best = candidate;
  }
  return best;
}

// Remove clues in random order for as long as the solution stays unique.
// Fast (no grading along the way); grade the result afterwards.
export function generateMinimalPuzzle() {
  const full = emptyGrid();
  fill(full);
  const p = cloneGrid(full);
  for (const idx of shuffled(Array.from({ length: 81 }, (_, i) => i))) {
    const r = Math.floor(idx / 9), c = idx % 9;
    const backup = p[r][c];
    p[r][c] = 0;
    if (countSolutions(p, 2) !== 1) p[r][c] = backup;
  }
  return { full, p };
}

// Daily Challenge grades, applied to solveLogical() results. Medium and Hard
// are separated by a gap in "advanced steps" (steps needing more than singles),
// so every Hard puzzle takes clearly more work than any Medium one.
export const DAILY_GRADES = {
  medium: res => res.solved && res.tier === 2 && res.advancedSteps <= 2,
  hard: res => res.solved && (res.tier === 3 || res.tier === 4 || (res.tier === 2 && res.advancedSteps >= 4))
};

// Generate minimal puzzles until one passes `accept`. Returns null after maxTries.
export function generateGradedPuzzle(accept, maxTries) {
  for (let i = 0; i < maxTries; i++) {
    const { full, p } = generateMinimalPuzzle();
    const res = solveLogical(p);
    if (accept(res)) {
      const clueCount = p.flat().filter(v => v !== 0).length;
      return { full, p, tier: res.tier, techniques: res.techniques, advancedSteps: res.advancedSteps, clueCount };
    }
  }
  return null;
}

// Dig holes until the logical solver needs `techName` to finish. Returns null
// if no attempt produced such a puzzle.
export function generatePuzzleForTechnique(techName) {
  const ATTEMPTS = 10;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const full = emptyGrid();
    fill(full);
    const p = cloneGrid(full);
    const cellOrder = shuffled(Array.from({ length: 81 }, (_, i) => i));
    for (const idx of cellOrder) {
      const r = Math.floor(idx / 9), c = idx % 9;
      if (p[r][c] === 0) continue;
      const backup = p[r][c];
      p[r][c] = 0;
      if (countSolutions(p, 2) !== 1) { p[r][c] = backup; continue; }
      const res = solveLogical(p);
      if (!res.solved) { p[r][c] = backup; continue; }
      if (res.techniques.includes(techName)) {
        const clueCount = p.flat().filter(v => v !== 0).length;
        return { full, p, techniques: res.techniques, clueCount, matched: true };
      }
    }
  }
  return null;
}
