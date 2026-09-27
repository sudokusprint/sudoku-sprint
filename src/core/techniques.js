// Technique catalogue for the Workshop, plus worked examples for the
// techniques that can't be practiced on demand. Pure data — no DOM.

export const TECHNIQUES_INFO = [
  { name: 'Naked Single', tier: 1, desc: 'A cell has only one possible candidate left once every other digit is ruled out by its row, column, and box. That candidate must go there — there\'s nowhere else it could be.' },
  { name: 'Hidden Single', tier: 1, desc: 'A digit can only fit in one cell within a row, column, or box, even if that cell still lists other candidates too. Since the digit has nowhere else to go in that unit, it belongs there.' },
  { name: 'Naked Pair', tier: 2, desc: 'Two cells in the same unit share the exact same two candidates and nothing else. Since those two digits must occupy those two cells between them, you can remove both digits as candidates from every other cell in that unit.' },
  { name: 'Hidden Pair', tier: 2, desc: 'Two digits only appear as candidates in the same two cells within a unit, even if those cells list other candidates too. Since the two digits must go in those two cells, you can strip away any other candidates from those two cells.' },
  { name: 'Pointing Pair', tier: 2, desc: 'Within a single 3×3 box, a digit\'s remaining candidates all fall in the same row or column. That means the digit must be placed there — so it can be eliminated from that row or column everywhere outside the box.' },
  { name: 'Box-Line Reduction', tier: 2, desc: 'The mirror of a pointing pair: within a row or column, a digit\'s remaining candidates are all confined to a single box. That lets you eliminate the digit from the rest of that box, outside the row or column.' },
  { name: 'Naked Triple', tier: 3, desc: 'Three cells in a unit collectively share only three candidate digits between them, even if no single cell has all three. Those three digits must occupy those three cells, so they can be eliminated from every other cell in the unit.' },
  { name: 'X-Wing', tier: 3, desc: 'A digit\'s candidates in two different rows are both confined to exactly the same two columns, forming a rectangle. The digit must occupy diagonally opposite corners of it — letting you eliminate it from the rest of those two columns.' },
  { name: 'Hidden Triple', tier: 3, desc: 'Three digits are only found as candidates within the same three cells of a unit, even if those cells list other candidates too. Since those three digits must occupy those three cells, every other candidate can be stripped from them.', practiceable: false },
  { name: 'Naked Quad', tier: 3, desc: 'Four cells in a unit collectively share only four candidate digits between them. Those four digits must occupy those four cells, so they can be eliminated from every other cell in the unit.', practiceable: false },
  { name: 'Hidden Quad', tier: 3, desc: 'Four digits are only found as candidates within the same four cells of a unit. Since those four digits must occupy those four cells, any other candidates in them can be removed.', practiceable: false },
  { name: 'Swordfish', tier: 4, desc: 'The three-row (or three-column) generalization of an X-Wing: a digit\'s candidates across three rows are all confined to the same three columns, letting you eliminate it from those columns everywhere else.', practiceable: false },
  { name: 'XY-Wing', tier: 4, desc: 'A "pivot" cell with two candidates (X, Y) sees two other cells, one with candidates (X, Z) and one with (Y, Z). Whichever of X or Y turns out to be true in the pivot, Z gets forced elsewhere — so Z can be eliminated from any cell that sees both of those two pincer cells.', practiceable: false }
];

export const TIER_LABEL = { 1: 'Easy techniques', 2: 'Medium techniques', 3: 'Hard techniques', 4: 'Expert techniques (detection only)' };
export const TIER_NAME = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Expert' };

export const MASTERY_TARGET = 5;

export function masteryStatus(count) {
  if (count <= 0) return 'Not started';
  if (count < 3) return 'Learning';
  if (count < MASTERY_TARGET) return 'Practiced';
  return 'Mastered';
}

export const EXAMPLE_DATA = {"Hidden Triple":{"name":"Hidden Triple","patternCells":[[1,4],[2,4],[4,4]],"digits":[1,2,3],"eliminations":[{"r":1,"c":4,"d":7},{"r":4,"c":4,"d":9}],"gridBefore":[[6,1,2,8,0,9,5,3,4],[5,4,0,3,0,6,9,1,8],[9,8,3,5,0,4,2,7,6],[0,9,6,4,5,1,3,2,7],[7,3,1,6,0,0,8,4,5],[2,5,4,7,8,3,1,0,9],[4,7,5,0,3,0,6,9,2],[1,6,9,2,0,5,7,8,3],[3,2,8,9,6,7,4,5,1]]},"Naked Quad":{"name":"Naked Quad","patternCells":[[3,7],[4,8],[5,7],[5,8]],"digits":[3,4,6,9],"eliminations":[{"r":5,"c":6,"d":4}],"gridBefore":[[1,7,8,3,4,9,6,2,5],[5,2,6,1,8,7,3,9,4],[3,4,9,5,0,0,0,8,1],[4,0,0,0,9,5,0,0,7],[0,8,5,4,3,0,2,1,0],[9,0,2,0,1,8,0,0,0],[6,3,0,8,0,4,9,5,2],[0,9,7,0,5,1,0,0,8],[0,5,4,9,0,0,0,7,0]]},"Hidden Quad":{"name":"Hidden Quad","patternCells":[[0,2],[1,1],[2,0],[2,2]],"digits":[1,2,5,9],"eliminations":[{"r":2,"c":0,"d":3}],"gridBefore":[[8,1,0,9,7,2,4,3,0],[7,0,4,1,3,6,0,0,5],[0,6,0,0,8,5,7,2,1],[1,7,0,8,9,4,3,5,2],[4,8,2,0,0,3,1,6,9],[0,5,3,2,0,1,0,4,7],[6,9,1,3,2,0,5,7,4],[5,0,8,6,1,7,2,9,3],[2,3,0,5,4,0,6,1,8]]},"Swordfish":{"name":"Swordfish","patternCells":[[0,3],[0,5],[4,3],[4,5],[7,0],[7,5]],"digits":[4],"baseRows":[0,4,7],"baseCols":[3,5,0],"eliminations":[{"r":6,"c":3,"d":4},{"r":6,"c":0,"d":4},{"r":8,"c":3,"d":4},{"r":8,"c":0,"d":4}],"gridBefore":[[0,0,0,0,3,0,2,0,0],[7,2,4,0,6,8,3,0,0],[0,9,3,0,0,2,0,0,4],[8,0,1,7,0,0,9,4,0],[0,0,0,0,5,0,0,0,0],[3,4,5,8,0,0,0,0,0],[0,0,7,0,0,5,0,6,3],[0,0,2,3,1,0,8,9,0],[0,3,0,0,0,7,5,1,2]]},"XY-Wing":{"name":"XY-Wing","pivot":[1,4],"pincer1":[1,1],"pincer2":[1,8],"pivotDigits":[2,4],"p1Digits":[2,3],"p2Digits":[3,4],"zDigit":3,"eliminations":[{"r":1,"c":2,"d":3}],"gridBefore":[[0,4,0,6,0,3,0,2,9],[9,0,0,7,0,1,6,5,0],[0,0,0,8,0,9,0,7,0],[2,9,4,3,0,7,0,0,0],[0,0,0,4,0,0,9,3,0],[6,1,0,0,9,0,7,0,8],[5,8,0,2,7,4,0,9,6],[7,6,9,1,0,0,2,0,0],[4,0,0,9,6,0,5,0,0]]}};
