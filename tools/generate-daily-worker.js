// Web Worker for tools/generate-daily.html. Workers aren't throttled like a
// hidden tab's timers are, so long runs keep going at full speed.
import { generateDailyPuzzle } from './daily-puzzle.js';

self.onmessage = ({ data: { days } }) => {
  try {
    for (const day of days) {
      const puzzles = ['easy', 'medium', 'hard'].map(generateDailyPuzzle);
      self.postMessage({ type: 'day', day, puzzles });
    }
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
