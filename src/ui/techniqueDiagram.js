// Static worked-example boards for the techniques that can't be practiced on demand.
import { computeCandidates } from '../core/solver.js';
import { EXAMPLE_DATA } from '../core/techniques.js';
import { cellClassNames } from './board.js';

function cellRole(techName, ex, r, c) {
  if (techName === 'XY-Wing') {
    if (ex.pivot[0] === r && ex.pivot[1] === c) return 'exPivot';
    if (ex.pincer1[0] === r && ex.pincer1[1] === c) return 'exPincer';
    if (ex.pincer2[0] === r && ex.pincer2[1] === c) return 'exPincer';
  } else if (ex.patternCells && ex.patternCells.some(([pr, pc]) => pr === r && pc === c)) {
    return 'exHi';
  }
  if (ex.eliminations.some(e => e.r === r && e.c === c)) return 'exTarget';
  return '';
}

// Returns an HTML string ('' if there is no example for techName).
export function buildTechniqueDiagram(techName) {
  const ex = EXAMPLE_DATA[techName];
  if (!ex) return '';
  const grid = ex.gridBefore;
  const cand = computeCandidates(grid);
  const keepDigits = ex.digits || (ex.pivotDigits ? ex.pivotDigits.concat(ex.p1Digits, ex.p2Digits) : []);
  const elimByCell = {};
  ex.eliminations.forEach(e => {
    const key = e.r + '_' + e.c;
    (elimByCell[key] = elimByCell[key] || []).push(e.d);
  });

  let html = '<div class="techDiagram"><div class="exBoardWrap"><div class="board">';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const role = cellRole(techName, ex, r, c);
      let cls = cellClassNames(r, c).join(' ');
      if (role) cls += ' ' + role;
      let inner = '';
      if (grid[r][c] !== 0) {
        inner = String(grid[r][c]);
      } else {
        const elims = elimByCell[r + '_' + c] || [];
        const spans = [];
        for (let d = 1; d <= 9; d++) {
          if (cand[r][c] & (1 << (d - 1))) {
            let spanCls = '';
            if (elims.includes(d)) spanCls = 'exElim';
            else if (keepDigits.includes(d) && (techName === 'XY-Wing' ? (ex.p1Digits.includes(d) || ex.p2Digits.includes(d) || ex.pivotDigits.includes(d)) : true)) spanCls = 'exKeep';
            spans.push('<span' + (spanCls ? ' class="' + spanCls + '"' : '') + '>' + d + '</span>');
          } else {
            spans.push('<span></span>');
          }
        }
        inner = '<div class="notes">' + spans.join('') + '</div>';
      }
      html += '<div class="' + cls + '">' + inner + '</div>';
    }
  }
  html += '</div></div>';

  let caption = '';
  const legend = '<div class="diagLegend">' +
    '<span><span class="diagSwatch" style="background:var(--accent)"></span>Pattern</span>' +
    '<span><span class="diagSwatch" style="background:var(--bad)"></span>Eliminated</span></div>';
  if (techName === 'Hidden Triple' || techName === 'Hidden Quad') {
    caption = 'A real solved-board snapshot. The ' + (ex.digits.length === 3 ? 'three' : 'four') + ' outlined cells are the only ones in their unit that can hold ' + ex.digits.join(', ') + ' — so their other candidates (red, struck through) get removed.';
  } else if (techName === 'Naked Quad') {
    caption = 'A real solved-board snapshot. The four outlined cells share only ' + ex.digits.join(', ') + ' between them, so those digits are removed from every other cell in the unit (red, struck through).';
  } else if (techName === 'Swordfish') {
    caption = 'A real solved-board snapshot. Digit ' + ex.digits[0] + ' across three rows is confined to the same three columns (outlined). In other rows, ' + ex.digits[0] + ' can be eliminated from those columns (red, struck through).';
  } else if (techName === 'XY-Wing') {
    caption = 'A real solved-board snapshot. Pivot (' + ex.pivotDigits.join(',') + ') sees both pincers. Either way the pivot resolves, digit ' + ex.zDigit + ' gets forced into one pincer — so it can be eliminated from any cell that sees both pincers (red, struck through).';
  }
  return html + '<div class="diagCaption">' + caption + '</div>' + legend + '</div>';
}
