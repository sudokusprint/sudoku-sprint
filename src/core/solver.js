// Solvers. Pure — no DOM.
//  - countSolutions: brute-force backtracking, used to verify a puzzle is unique.
//  - solveLogical:   human-technique solver, used to grade difficulty.
import { valid, cloneGrid } from './grid.js';

export function countSolutions(grid, limit) {
  let count = 0;
  function solve(g) {
    if (count >= limit) return;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (g[r][c] === 0) {
          for (let v = 1; v <= 9; v++) {
            if (valid(g, r, c, v)) {
              g[r][c] = v;
              solve(g);
              g[r][c] = 0;
              if (count >= limit) return;
            }
          }
          return;
        }
      }
    }
    count++;
  }
  solve(cloneGrid(grid));
  return count;
}

// ---------- Real logical solver (human techniques, not brute force) ----------
// Tier 1 = singles only ("Easy"), Tier 2 = + pairs/pointing/box-line ("Medium"),
// Tier 3 = + triples/quads/X-wing ("Hard"), Tier 4 = + Swordfish/XY-Wing ("Expert").
// Tier 5 = our technique set couldn't finish it.
const UNITS = (function buildUnits() {
  const units = [];
  for (let r = 0; r < 9; r++) { const u = []; for (let c = 0; c < 9; c++) u.push([r, c]); units.push(u); }
  for (let c = 0; c < 9; c++) { const u = []; for (let r = 0; r < 9; r++) u.push([r, c]); units.push(u); }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const u = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) u.push([br * 3 + i, bc * 3 + j]);
    units.push(u);
  }
  return units;
})();

function popcount(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
export function bitFor(d) { return 1 << (d - 1); }

// Candidate bitmask per empty cell (bit d-1 set => digit d still possible).
export function computeCandidates(grid) {
  const cand = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== 0) continue;
      let mask = 0x1FF;
      for (let i = 0; i < 9; i++) {
        if (grid[r][i]) mask &= ~bitFor(grid[r][i]);
        if (grid[i][c]) mask &= ~bitFor(grid[i][c]);
      }
      const br = r - (r % 3), bc = c - (c % 3);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const v = grid[br + i][bc + j];
        if (v) mask &= ~bitFor(v);
      }
      cand[r][c] = mask;
    }
  }
  return cand;
}

function assignDigit(grid, cand, r, c, d) {
  grid[r][c] = d;
  cand[r][c] = 0;
  const clearBit = ~bitFor(d);
  for (let i = 0; i < 9; i++) {
    if (grid[r][i] === 0) cand[r][i] &= clearBit;
    if (grid[i][c] === 0) cand[i][c] &= clearBit;
  }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const rr = br + i, cc = bc + j;
    if (grid[rr][cc] === 0) cand[rr][cc] &= clearBit;
  }
}

function tryNakedSingle(grid, cand) {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] === 0 && popcount(cand[r][c]) === 1) {
      const d = Math.log2(cand[r][c]) + 1;
      assignDigit(grid, cand, r, c, d);
      return { tier: 1, name: 'Naked Single' };
    }
  }
  return null;
}

function tryHiddenSingle(grid, cand) {
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = bitFor(d);
      let count = 0, at = null;
      for (const [r, c] of unit) {
        if (grid[r][c] === 0 && (cand[r][c] & bit)) { count++; at = [r, c]; }
      }
      if (count === 1) {
        assignDigit(grid, cand, at[0], at[1], d);
        return { tier: 1, name: 'Hidden Single' };
      }
    }
  }
  return null;
}

function tryNakedPair(grid, cand) {
  for (const unit of UNITS) {
    const cells = unit.filter(([r, c]) => grid[r][c] === 0 && popcount(cand[r][c]) === 2);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const [r1, c1] = cells[i], [r2, c2] = cells[j];
        if (cand[r1][c1] !== cand[r2][c2]) continue;
        const mask = cand[r1][c1];
        let changed = false;
        for (const [r, c] of unit) {
          if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
          if (grid[r][c] === 0 && (cand[r][c] & mask)) { cand[r][c] &= ~mask; changed = true; }
        }
        if (changed) return { tier: 2, name: 'Naked Pair' };
      }
    }
  }
  return null;
}

function tryHiddenPair(grid, cand) {
  for (const unit of UNITS) {
    for (let d1 = 1; d1 <= 9; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        const b1 = bitFor(d1), b2 = bitFor(d2);
        const cellsD1 = unit.filter(([r, c]) => grid[r][c] === 0 && (cand[r][c] & b1));
        const cellsD2 = unit.filter(([r, c]) => grid[r][c] === 0 && (cand[r][c] & b2));
        if (cellsD1.length === 2 && cellsD2.length === 2 &&
            cellsD1[0][0] === cellsD2[0][0] && cellsD1[0][1] === cellsD2[0][1] &&
            cellsD1[1][0] === cellsD2[1][0] && cellsD1[1][1] === cellsD2[1][1]) {
          const mask = b1 | b2;
          let changed = false;
          for (const [r, c] of cellsD1) {
            if (cand[r][c] & ~mask) { cand[r][c] = mask; changed = true; }
          }
          if (changed) return { tier: 2, name: 'Hidden Pair' };
        }
      }
    }
  }
  return null;
}

function tryLockedCandidates(grid, cand) {
  // Pointing: digit confined to one row/col within a box -> eliminate outside the box.
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    for (let d = 1; d <= 9; d++) {
      const bit = bitFor(d);
      const cells = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const r = br * 3 + i, c = bc * 3 + j;
        if (grid[r][c] === 0 && (cand[r][c] & bit)) cells.push([r, c]);
      }
      if (cells.length < 2) continue;
      const sameRow = cells.every(([r]) => r === cells[0][0]);
      const sameCol = cells.every(([, c]) => c === cells[0][1]);
      if (sameRow) {
        const r = cells[0][0]; let changed = false;
        for (let c = 0; c < 9; c++) {
          if (c >= bc * 3 && c < bc * 3 + 3) continue;
          if (grid[r][c] === 0 && (cand[r][c] & bit)) { cand[r][c] &= ~bit; changed = true; }
        }
        if (changed) return { tier: 2, name: 'Pointing Pair' };
      } else if (sameCol) {
        const c = cells[0][1]; let changed = false;
        for (let r = 0; r < 9; r++) {
          if (r >= br * 3 && r < br * 3 + 3) continue;
          if (grid[r][c] === 0 && (cand[r][c] & bit)) { cand[r][c] &= ~bit; changed = true; }
        }
        if (changed) return { tier: 2, name: 'Pointing Pair' };
      }
    }
  }
  // Box-line reduction: digit confined to one box within a row/col -> eliminate rest of box.
  for (let r = 0; r < 9; r++) {
    for (let d = 1; d <= 9; d++) {
      const bit = bitFor(d);
      const cols = [];
      for (let c = 0; c < 9; c++) if (grid[r][c] === 0 && (cand[r][c] & bit)) cols.push(c);
      if (cols.length < 2) continue;
      const bc = Math.floor(cols[0] / 3);
      if (!cols.every(c => Math.floor(c / 3) === bc)) continue;
      const br = Math.floor(r / 3);
      let changed = false;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const rr = br * 3 + i, cc = bc * 3 + j;
        if (rr === r) continue;
        if (grid[rr][cc] === 0 && (cand[rr][cc] & bit)) { cand[rr][cc] &= ~bit; changed = true; }
      }
      if (changed) return { tier: 2, name: 'Box-Line Reduction' };
    }
  }
  for (let c = 0; c < 9; c++) {
    for (let d = 1; d <= 9; d++) {
      const bit = bitFor(d);
      const rows = [];
      for (let r = 0; r < 9; r++) if (grid[r][c] === 0 && (cand[r][c] & bit)) rows.push(r);
      if (rows.length < 2) continue;
      const br = Math.floor(rows[0] / 3);
      if (!rows.every(r => Math.floor(r / 3) === br)) continue;
      const bc = Math.floor(c / 3);
      let changed = false;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const rr = br * 3 + i, cc = bc * 3 + j;
        if (cc === c) continue;
        if (grid[rr][cc] === 0 && (cand[rr][cc] & bit)) { cand[rr][cc] &= ~bit; changed = true; }
      }
      if (changed) return { tier: 2, name: 'Box-Line Reduction' };
    }
  }
  return null;
}

function tryNakedTriple(grid, cand) {
  for (const unit of UNITS) {
    const cells = unit.filter(([r, c]) => grid[r][c] === 0 && popcount(cand[r][c]) >= 2 && popcount(cand[r][c]) <= 3);
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) for (let k = j + 1; k < cells.length; k++) {
      const [r1, c1] = cells[i], [r2, c2] = cells[j], [r3, c3] = cells[k];
      const union = cand[r1][c1] | cand[r2][c2] | cand[r3][c3];
      if (popcount(union) !== 3) continue;
      let changed = false;
      for (const [r, c] of unit) {
        if ((r === r1 && c === c1) || (r === r2 && c === c2) || (r === r3 && c === c3)) continue;
        if (grid[r][c] === 0 && (cand[r][c] & union)) { cand[r][c] &= ~union; changed = true; }
      }
      if (changed) return { tier: 3, name: 'Naked Triple' };
    }
  }
  return null;
}

function tryXWing(grid, cand) {
  for (let d = 1; d <= 9; d++) {
    const bit = bitFor(d);
    for (let r1 = 0; r1 < 9; r1++) {
      const cols1 = [];
      for (let c = 0; c < 9; c++) if (grid[r1][c] === 0 && (cand[r1][c] & bit)) cols1.push(c);
      if (cols1.length !== 2) continue;
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        const cols2 = [];
        for (let c = 0; c < 9; c++) if (grid[r2][c] === 0 && (cand[r2][c] & bit)) cols2.push(c);
        if (cols2.length !== 2 || cols2[0] !== cols1[0] || cols2[1] !== cols1[1]) continue;
        let changed = false;
        for (let r = 0; r < 9; r++) {
          if (r === r1 || r === r2) continue;
          for (const c of cols1) {
            if (grid[r][c] === 0 && (cand[r][c] & bit)) { cand[r][c] &= ~bit; changed = true; }
          }
        }
        if (changed) return { tier: 3, name: 'X-Wing' };
      }
    }
  }
  return null;
}

function tryHiddenTriple(grid, cand) {
  for (const unit of UNITS) {
    for (let d1 = 1; d1 <= 9; d1++) for (let d2 = d1 + 1; d2 <= 9; d2++) for (let d3 = d2 + 1; d3 <= 9; d3++) {
      const mask = bitFor(d1) | bitFor(d2) | bitFor(d3);
      const cells = unit.filter(([r, c]) => grid[r][c] === 0 && (cand[r][c] & mask));
      if (cells.length !== 3) continue;
      let changed = false;
      for (const [r, c] of cells) {
        if (cand[r][c] & ~mask) { cand[r][c] &= mask; changed = true; }
      }
      if (changed) return { tier: 3, name: 'Hidden Triple' };
    }
  }
  return null;
}

function tryNakedQuad(grid, cand) {
  for (const unit of UNITS) {
    const cells = unit.filter(([r, c]) => grid[r][c] === 0 && popcount(cand[r][c]) >= 2 && popcount(cand[r][c]) <= 4);
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) for (let k = j + 1; k < cells.length; k++) for (let l = k + 1; l < cells.length; l++) {
      const [r1, c1] = cells[i], [r2, c2] = cells[j], [r3, c3] = cells[k], [r4, c4] = cells[l];
      const union = cand[r1][c1] | cand[r2][c2] | cand[r3][c3] | cand[r4][c4];
      if (popcount(union) !== 4) continue;
      let changed = false;
      for (const [r, c] of unit) {
        if ((r===r1&&c===c1)||(r===r2&&c===c2)||(r===r3&&c===c3)||(r===r4&&c===c4)) continue;
        if (grid[r][c] === 0 && (cand[r][c] & union)) { cand[r][c] &= ~union; changed = true; }
      }
      if (changed) return { tier: 3, name: 'Naked Quad' };
    }
  }
  return null;
}

function tryHiddenQuad(grid, cand) {
  for (const unit of UNITS) {
    for (let d1 = 1; d1 <= 9; d1++) for (let d2 = d1+1; d2 <= 9; d2++) for (let d3 = d2+1; d3 <= 9; d3++) for (let d4 = d3+1; d4 <= 9; d4++) {
      const mask = bitFor(d1) | bitFor(d2) | bitFor(d3) | bitFor(d4);
      const cells = unit.filter(([r, c]) => grid[r][c] === 0 && (cand[r][c] & mask));
      if (cells.length !== 4) continue;
      let changed = false;
      for (const [r, c] of cells) {
        if (cand[r][c] & ~mask) { cand[r][c] &= mask; changed = true; }
      }
      if (changed) return { tier: 3, name: 'Hidden Quad' };
    }
  }
  return null;
}

function trySwordfish(grid, cand) {
  for (let d = 1; d <= 9; d++) {
    const bit = bitFor(d);
    const rowInfo = [];
    for (let r = 0; r < 9; r++) {
      const cols = [];
      for (let c = 0; c < 9; c++) if (grid[r][c] === 0 && (cand[r][c] & bit)) cols.push(c);
      if (cols.length >= 2 && cols.length <= 3) rowInfo.push({ r, cols });
    }
    for (let i=0;i<rowInfo.length;i++) for (let j=i+1;j<rowInfo.length;j++) for (let k=j+1;k<rowInfo.length;k++) {
      const rows = [rowInfo[i], rowInfo[j], rowInfo[k]];
      const unionCols = new Set();
      rows.forEach(rc => rc.cols.forEach(c => unionCols.add(c)));
      if (unionCols.size !== 3) continue;
      const rowNums = rows.map(rc => rc.r);
      let changed = false;
      for (let r = 0; r < 9; r++) {
        if (rowNums.includes(r)) continue;
        for (const c of unionCols) {
          if (grid[r][c] === 0 && (cand[r][c] & bit)) { cand[r][c] &= ~bit; changed = true; }
        }
      }
      if (changed) return { tier: 4, name: 'Swordfish' };
    }
    const colInfo = [];
    for (let c = 0; c < 9; c++) {
      const rows = [];
      for (let r = 0; r < 9; r++) if (grid[r][c] === 0 && (cand[r][c] & bit)) rows.push(r);
      if (rows.length >= 2 && rows.length <= 3) colInfo.push({ c, rows });
    }
    for (let i=0;i<colInfo.length;i++) for (let j=i+1;j<colInfo.length;j++) for (let k=j+1;k<colInfo.length;k++) {
      const cols = [colInfo[i], colInfo[j], colInfo[k]];
      const unionRows = new Set();
      cols.forEach(cc => cc.rows.forEach(r => unionRows.add(r)));
      if (unionRows.size !== 3) continue;
      const colNums = cols.map(cc => cc.c);
      let changed = false;
      for (let c = 0; c < 9; c++) {
        if (colNums.includes(c)) continue;
        for (const r of unionRows) {
          if (grid[r][c] === 0 && (cand[r][c] & bit)) { cand[r][c] &= ~bit; changed = true; }
        }
      }
      if (changed) return { tier: 4, name: 'Swordfish' };
    }
  }
  return null;
}

function seesCell(r1, c1, r2, c2) {
  if (r1 === r2 && c1 === c2) return false;
  if (r1 === r2 || c1 === c2) return true;
  return Math.floor(r1/3) === Math.floor(r2/3) && Math.floor(c1/3) === Math.floor(c2/3);
}

function tryXYWing(grid, cand) {
  const bival = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] === 0 && popcount(cand[r][c]) === 2) bival.push({ r, c, mask: cand[r][c] });
  }
  for (const pivot of bival) {
    const seers = bival.filter(o => o !== pivot && seesCell(pivot.r, pivot.c, o.r, o.c) && popcount(pivot.mask & o.mask) === 1);
    for (let i = 0; i < seers.length; i++) for (let j = i+1; j < seers.length; j++) {
      const p1 = seers[i], p2 = seers[j];
      if (p1.mask === p2.mask) continue;
      const shared1 = pivot.mask & p1.mask;
      const shared2 = pivot.mask & p2.mask;
      if (shared1 === shared2) continue;
      const z1 = p1.mask & ~pivot.mask;
      const z2 = p2.mask & ~pivot.mask;
      if (z1 !== z2 || z1 === 0) continue;
      const z = z1;
      let changed = false;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0) continue;
        if ((r===pivot.r&&c===pivot.c)||(r===p1.r&&c===p1.c)||(r===p2.r&&c===p2.c)) continue;
        if (seesCell(p1.r,p1.c,r,c) && seesCell(p2.r,p2.c,r,c) && (cand[r][c] & z)) { cand[r][c] &= ~z; changed = true; }
      }
      if (changed) return { tier: 4, name: 'XY-Wing' };
    }
  }
  return null;
}

// Apply techniques (easiest first) until solved or stuck.
// Returns { solved, tier, techniques, advancedSteps } where techniques lists every
// technique used and advancedSteps counts the steps that needed more than singles
// (a finer difficulty measure within a tier).
export function solveLogical(inputGrid) {
  const grid = cloneGrid(inputGrid);
  const cand = computeCandidates(grid);
  let maxTier = 0;
  let advancedSteps = 0;
  const used = new Set();
  for (let iter = 0; iter < 300; iter++) {
    let empty = false;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (grid[r][c] === 0) empty = true;
    if (!empty) break;
    const step =
      tryNakedSingle(grid, cand) || tryHiddenSingle(grid, cand) ||
      tryNakedPair(grid, cand) || tryHiddenPair(grid, cand) || tryLockedCandidates(grid, cand) ||
      tryNakedTriple(grid, cand) || tryHiddenTriple(grid, cand) || tryNakedQuad(grid, cand) || tryHiddenQuad(grid, cand) || tryXWing(grid, cand) ||
      trySwordfish(grid, cand) || tryXYWing(grid, cand);
    if (!step) break;
    maxTier = Math.max(maxTier, step.tier);
    if (step.tier >= 2) advancedSteps++;
    used.add(step.name);
  }
  let remaining = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (grid[r][c] === 0) remaining++;
  const solved = remaining === 0;
  return { solved, tier: solved ? Math.max(maxTier, 1) : 5, techniques: Array.from(used), advancedSteps };
}
