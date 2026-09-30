// One Daily Challenge puzzle for a difficulty, in the shape the SQL generator needs.
//   easy:   singles only, at least 36 clues (same as Solo Easy)
//   medium/hard: see DAILY_GRADES in src/core/generator.js
import { generatePuzzleByDifficulty, generateGradedPuzzle, DAILY_GRADES, MIN_CLUES } from '../src/core/generator.js';

const MAX_TRIES = { easy: 50, medium: 2000, hard: 5000 };
const gridString = g => g.map(row => row.join('')).join('');

export function generateDailyPuzzle(difficulty) {
  let g = null;
  if (difficulty === 'easy') {
    for (let i = 0; i < MAX_TRIES.easy && (!g || g.tier !== 1); i++) g = generatePuzzleByDifficulty(1, MIN_CLUES.easy);
    if (g && g.tier !== 1) g = null;
  } else {
    g = generateGradedPuzzle(DAILY_GRADES[difficulty], MAX_TRIES[difficulty]);
  }
  if (!g) throw new Error('No ' + difficulty + ' puzzle after ' + MAX_TRIES[difficulty] + ' tries');
  return { difficulty, puzzle: gridString(g.p), solution: gridString(g.full), tier: g.tier, clueCount: g.clueCount, techniques: g.techniques };
}
