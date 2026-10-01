// Basic 9x9 grid helpers shared by the generator and solver. Pure — no DOM.

export function emptyGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

export function cloneGrid(grid) {
  return grid.map(row => row.slice());
}

export function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Cells whose value repeats in their row, column, or box, as a Set of "r,c" keys.
// Used where the solution isn't known (Daily Challenge) to flag rule clashes.
export function findConflicts(grid) {
  const bad = new Set();
  const groups = [];
  for (let i = 0; i < 9; i++) {
    const row = [], col = [], box = [];
    for (let j = 0; j < 9; j++) {
      row.push([i, j]);
      col.push([j, i]);
      box.push([Math.floor(i / 3) * 3 + Math.floor(j / 3), (i % 3) * 3 + (j % 3)]);
    }
    groups.push(row, col, box);
  }
  for (const cells of groups) {
    const seen = new Map();
    for (const [r, c] of cells) {
      const v = grid[r][c];
      if (!v) continue;
      if (seen.has(v)) {
        bad.add(r + ',' + c);
        bad.add(seen.get(v));
      } else {
        seen.set(v, r + ',' + c);
      }
    }
  }
  return bad;
}

// Every other cell in the same row, column, or box as (r, c), as [row, col] pairs.
export function peersOf(r, c) {
  const peers = [];
  const br = r - (r % 3), bc = c - (c % 3);
  for (let rr = 0; rr < 9; rr++) {
    for (let cc = 0; cc < 9; cc++) {
      if (rr === r && cc === c) continue;
      const inBox = rr >= br && rr < br + 3 && cc >= bc && cc < bc + 3;
      if (rr === r || cc === c || inBox) peers.push([rr, cc]);
    }
  }
  return peers;
}

// Grid <-> 81-character string, row by row, 0 = blank (the Daily Challenge format).
export function gridToString(grid) {
  return grid.map(row => row.join('')).join('');
}

export function gridFromString(s) {
  return Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => +s[r * 9 + c]));
}

// Can digit v go at (r, c) without clashing with its row, column, or box?
export function valid(grid, r, c, v) {
  for (let i = 0; i < 9; i++) {
    if (grid[r][i] === v || grid[i][c] === v) return false;
  }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[br + i][bc + j] === v) return false;
    }
  }
  return true;
}
