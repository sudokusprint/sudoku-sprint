# Sudoku Sprint

Solo play with verified difficulty grading, a race mode against a ghost, and a technique
workshop, with optional player accounts. Plain JavaScript ES modules with no build step.
The only runtime dependency is `supabase-js`, loaded from a CDN for accounts; if it can't
load, the game still works in guest mode.

Live at https://sudokusprint.github.io/sudoku-sprint/

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
index.html                  markup for every view (Home, Solo, Race, Workshop, Profile) and dialogs
privacy.html                privacy policy (linked from sign-in and Profile)
src/
  main.js                   entry point: tab navigation, keyboard shortcuts, startup
  config.js                 Supabase project URL + publishable key
  core/                     pure logic, no DOM, safe to reuse or test in isolation
    grid.js                 emptyGrid, cloneGrid, shuffled, valid
    solver.js               countSolutions (brute force) + solveLogical (human techniques)
    generator.js            generatePuzzle, generatePuzzleByDifficulty, generatePuzzleForTechnique
    techniques.js           technique catalogue, mastery rules, worked-example data
    stats.js                player stats model shared by guest and signed-in play
  services/                 data and network; no DOM rendering
    supabase.js             lazy Supabase client (null if it can't load)
    account.js              sign-in state, email code / link sign-in, username, account deletion
    progress.js             records finished games; guest → localStorage, signed in → Supabase
    storage.js              localStorage helpers (same keys as the prototype)
  ui/
    accountView.js          account card, sign-in and delete dialogs
    board.js                shared board/pad rendering and highlighting
    solo.js                 Solo mode
    race.js                 Race mode
    workshop.js             Workshop lessons + practice
    techniqueDiagram.js     worked-example boards for detection-only techniques
    stats.js                Home tiles and Profile page
    themes.js               board themes + settings panel
    confetti.js             win animation
  styles/                   CSS split by area; load order in index.html matters
supabase/schema.sql         database tables, security rules and functions (run in Supabase SQL Editor)
tests/                      browser test runner for src/core
legacy/prototype.html       the original single-file prototype, kept for reference
serve.ps1                   zero-dependency static server
```

Dependencies only point downward: `main` → `ui/*` → `services/*` → `core/*`. Nothing in
`core/` touches the DOM or the network.

## Friend races

Race tab → **Race a friend** creates a room with a 6-character code and an invite link
(`?race=CODE`). Rooms are Supabase Realtime channels (`race-CODE`): presence lists the players
(max 4) and broadcast messages carry `start` (puzzle + solution, sent by the host), `progress`
and `finish`. No database tables and no sign-in needed (guests appear as "Guest 123"). Friend
races are casual and unranked, so clients trust each other's results.

## Accounts

Switched on with `ACCOUNTS_LIVE` in `src/config.js` (always on for localhost). Set it to
`false` to make the live site guest-only again without removing any code.

Players can play as guests (stats in `localStorage`) or sign in with an emailed code or link.
Signed-in games are stored one row per finished game in `solves`, queued locally until the
server confirms them. On a player's first sign-in on a device, that device's guest stats are
imported once into `imported_stats` and cleared locally.

Sign-in email setup (Supabase dashboard, not in this repo):
- **Authentication → Emails → SMTP Settings:** custom SMTP through the game's own Gmail
  (`smtp.gmail.com`, port 465, a Gmail App Password). Switch to a domain-based service such as
  Resend if volume grows.
- **Magic Link** and **Confirm signup** templates: subject "Your Sudoku Sprint sign-in code",
  body containing both `{{ .Token }}` (the code) and `{{ .ConfirmationURL }}` (the link).
- **Authentication → URL Configuration:** Site URL is the live site; redirect URLs include the
  live site and `http://localhost:5173/**`, `http://localhost:5174/**`.

The browser only ever uses the **publishable** key. Every table has Row Level Security:
players read and write only their own rows, and only usernames are public. Changes to the
database go in `supabase/schema.sql`, which is safe to re-run.

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

- Toggling a single note in Solo isn't undoable (placing and erasing numbers are, including the
  notes a placement auto-clears).
- localStorage is per-origin, so stats saved while opening the prototype as a file won't
  appear at `http://localhost:5173`.
