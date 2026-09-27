# Sudoku Sprint

Solo play with verified difficulty grading, a race mode against a ghost, and a technique
workshop. Plain JavaScript ES modules with no build step and no dependencies.

## Running it

ES modules don't load from `file://`, so serve the folder over HTTP. Any static server works.
Without Node or Python, use the bundled PowerShell one:

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then open http://localhost:5173/. Unit tests are at http://localhost:5173/tests/.

If Node is available, `npx serve .` or `npx vite` work too.

## Layout

```
index.html                  markup for every view (Home, Solo, Race, Workshop, Profile)
src/
  main.js                   entry point: tab navigation, keyboard shortcuts, startup
  core/                     pure logic, no DOM, safe to reuse or test in isolation
    grid.js                 emptyGrid, cloneGrid, shuffled, valid
    solver.js               countSolutions (brute force) + solveLogical (human techniques)
    generator.js            generatePuzzle, generatePuzzleByDifficulty, generatePuzzleForTechnique
    techniques.js           technique catalogue, mastery rules, worked-example data
  ui/
    board.js                shared board/pad rendering and highlighting
    solo.js                 Solo mode
    race.js                 Race mode
    workshop.js             Workshop lessons + practice
    techniqueDiagram.js     worked-example boards for detection-only techniques
    stats.js                Home tiles and Profile page
    themes.js               board themes + settings panel
    confetti.js             win animation
    storage.js              localStorage stats (same keys as the prototype)
  styles/                   CSS split by area; load order in index.html matters
tests/                      browser test runner for src/core
legacy/prototype.html       the original single-file prototype, kept for reference
serve.ps1                   zero-dependency static server
```

Dependencies only point downward: `main` → `ui/*` → `core/*`. Nothing in `core/` touches the DOM.

## Changes from the prototype

The generator, solver, grading and game rules are moved over unchanged. A seeded-RNG
comparison against `legacy/prototype.html` gives the same puzzles, solutions, tiers and
technique lists. There are three fixes. The first two were caused by page-wide DOM
queries, which are now limited to their own view:

1. **Solo mode could never be won.** Solo's highlight function ran on *every* `.cell` on the
   page, including the Workshop's example diagrams, which have no row/column data. Once the
   selected cell had a value, it threw `TypeError: Cannot read properties of undefined`. So
   every placement crashed before the win check. It also skipped the pad's "digit done"
   strike-through.
2. **Race difficulty buttons changed the Solo game.** Solo's difficulty handler was attached
   to `.diff button`, which also matched the Race buttons. Picking a race difficulty quietly
   changed Solo's difficulty, started a new Solo puzzle and cleared the Solo button highlight.
   Picking a Solo difficulty also cleared the Race highlight.

3. **Race progress could win below 100%.** Race uses the ungraded `generatePuzzle`, which
   can stop above the requested clue count. Progress was divided by `81 - CLUES[difficulty]`
   anyway. So your bar could win short of 100%, and the ghost needed more steps than there
   were blanks. Both now use the puzzle's real blank count.

Also dropped: `raceErase()`, which nothing called.

## Known quirks kept as-is

- Undo in Solo doesn't restore notes cleared by a placement. Notes changes aren't undoable.
- localStorage is per-origin, so stats saved while opening the prototype as a file won't
  appear at `http://localhost:5173`.
