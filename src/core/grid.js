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
