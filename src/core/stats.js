// Player stats model shared by guest (localStorage) and signed-in (cloud) play. Pure — no DOM.
//
// Shape:
//   completed:        { easy, medium, hard }        Solo puzzles finished
//   best:             { easy, medium, hard }        best Solo time in seconds, or null
//   raceWins, raceLosses                            races against the ghost
//   friendRaceWins, friendRaceLosses                real-time races against friends
//   mastery:          { [techniqueName]: count }    genuine Workshop practice solves
//   lifetimeMistakes: Solo mistakes across finished puzzles

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export function emptyStats() {
  return {
    completed: { easy: 0, medium: 0, hard: 0 },
    best: { easy: null, medium: null, hard: null },
    raceWins: 0,
    raceLosses: 0,
    friendRaceWins: 0,
    friendRaceLosses: 0,
    mastery: {},
    lifetimeMistakes: 0
  };
}

function minTime(a, b) {
  if (a === null || a === undefined) return b ?? null;
  if (b === null || b === undefined) return a;
  return Math.min(a, b);
}

// Fold one solve record (as stored in the `solves` table) into stats. Mutates and returns stats.
export function addSolve(stats, solve) {
  if (solve.mode === 'solo' && DIFFICULTIES.includes(solve.difficulty)) {
    stats.completed[solve.difficulty]++;
    stats.best[solve.difficulty] = minTime(stats.best[solve.difficulty], solve.seconds);
    stats.lifetimeMistakes += solve.mistakes || 0;
  } else if (solve.mode === 'race') {
    if (solve.won) stats.raceWins++; else stats.raceLosses++;
  } else if (solve.mode === 'friend_race') {
    if (solve.won) stats.friendRaceWins++; else stats.friendRaceLosses++;
  } else if (solve.mode === 'workshop' && solve.technique) {
    stats.mastery[solve.technique] = (stats.mastery[solve.technique] || 0) + 1;
  }
  return stats;
}

// Add b's totals into a (a copy is returned; inputs are untouched).
export function mergeStats(a, b) {
  const out = emptyStats();
  for (const s of [a, b]) {
    if (!s) continue;
    for (const d of DIFFICULTIES) {
      out.completed[d] += (s.completed && s.completed[d]) || 0;
      out.best[d] = minTime(out.best[d], s.best ? s.best[d] : null);
    }
    out.raceWins += s.raceWins || 0;
    out.raceLosses += s.raceLosses || 0;
    out.friendRaceWins += s.friendRaceWins || 0;
    out.friendRaceLosses += s.friendRaceLosses || 0;
    out.lifetimeMistakes += s.lifetimeMistakes || 0;
    for (const [tech, n] of Object.entries(s.mastery || {})) {
      out.mastery[tech] = (out.mastery[tech] || 0) + (n || 0);
    }
  }
  return out;
}

export function statsFromSolves(solves, imported) {
  const fromSolves = solves.reduce(addSolve, emptyStats());
  return mergeStats(imported, fromSolves);
}

export function hasAnyProgress(stats) {
  return DIFFICULTIES.some(d => stats.completed[d] > 0 || stats.best[d] !== null) ||
    stats.raceWins > 0 || stats.raceLosses > 0 ||
    stats.friendRaceWins > 0 || stats.friendRaceLosses > 0 ||
    stats.lifetimeMistakes > 0 ||
    Object.values(stats.mastery).some(n => n > 0);
}

// Race records split by opponent: { friends, ghost, overall }, each { wins, losses }.
export function raceRecords(stats) {
  const friends = { wins: stats.friendRaceWins || 0, losses: stats.friendRaceLosses || 0 };
  const ghost = { wins: stats.raceWins || 0, losses: stats.raceLosses || 0 };
  return {
    friends,
    ghost,
    overall: { wins: friends.wins + ghost.wins, losses: friends.losses + ghost.losses }
  };
}
