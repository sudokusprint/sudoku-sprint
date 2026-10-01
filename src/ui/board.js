// DOM helpers shared by every board (Solo, Race, Workshop practice, technique diagrams).
import { getSettings } from '../services/settings.js';

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return m + ':' + String(s).padStart(2, '0');
}

// Checkerboard shading for alternate boxes plus the thick 3x3 box borders.
export function cellClassNames(r, c) {
  const names = ['cell'];
  const blockRow = Math.floor(r / 3), blockCol = Math.floor(c / 3);
  if ((blockRow + blockCol) % 2 === 1) names.push('zoneB');
  if (c === 2 || c === 5) names.push('blockR');
  if (r === 2 || r === 5) names.push('blockB');
  return names;
}

// Build one playable cell: value colouring (given / entered / wrong) and a click handler.
// An entered value is marked wrong if it differs from solutionValue, or, when the
// solution isn't known (Daily Challenge), if isBad is passed as true.
export function createCell(r, c, { value, isGiven, solutionValue, isBad, onClick }) {
  const cell = document.createElement('div');
  cell.className = cellClassNames(r, c).join(' ');
  if (value !== 0) {
    cell.textContent = value;
    if (!isGiven) {
      cell.classList.add('entered');
      const wrong = isBad !== undefined ? isBad : value !== solutionValue;
      if (wrong) cell.classList.add('bad');
    }
  }
  cell.dataset.r = r;
  cell.dataset.c = c;
  cell.addEventListener('click', onClick);
  return cell;
}

// Selected cell, plus (per settings) its row/column peers and every other cell
// holding the same digit.
export function highlightBoard(boardEl, selected, puzzle) {
  const { highlightLines, highlightMatches } = getSettings();
  const selectedValue = selected ? puzzle[selected[0]][selected[1]] : 0;
  boardEl.querySelectorAll('.cell').forEach(el => {
    el.classList.remove('selected', 'peer', 'match');
    const r = +el.dataset.r, c = +el.dataset.c;
    if (selected) {
      const [sr, sc] = selected;
      if (r === sr && c === sc) el.classList.add('selected');
      else if (highlightLines && (r === sr || c === sc)) el.classList.add('peer');
    }
    if (highlightMatches && selectedValue !== 0 && puzzle[r][c] === selectedValue && !(selected && r === selected[0] && c === selected[1])) {
      el.classList.add('match');
    }
  });
}

export function buildPad(padEl, onPress) {
  padEl.innerHTML = '';
  for (let v = 1; v <= 9; v++) {
    const b = document.createElement('button');
    b.textContent = v;
    b.dataset.v = v;
    b.addEventListener('click', () => onPress(v));
    padEl.appendChild(b);
  }
}

// Strike out a digit on the pad once all nine of it are correctly placed.
export function updatePadState(padEl, puzzle, solution) {
  for (let v = 1; v <= 9; v++) {
    let count = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] === v && v === solution[r][c]) count++;
      }
    }
    const btn = padEl.querySelector('button[data-v="' + v + '"]');
    if (btn) btn.classList.toggle('done', count === 9);
  }
}

export function isComplete(puzzle, solution) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (puzzle[r][c] !== solution[r][c]) return false;
    }
  }
  return true;
}
