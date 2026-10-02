# Sudoku Sprint: notes for Claude

Read README.md for the code layout. This file holds what the code doesn't show:
the owner's preferences, where things live, dashboard-only settings, and decisions.

## Working with the owner

- Not a programmer. Explain in plain language, step by step, with exact links and
  button names. Keep jargon out of chat (filenames are fine when useful).
- **The owner runs `git push` themselves.** After committing, copy it to the
  clipboard (`'git push' | Set-Clipboard`) and say so. Never force-push.
- Commit after each finished change, with a descriptive message. Don't publish
  half-tested work; say what was and wasn't tested.
- Ask before big design choices; show options (with a recommendation) first.
  If they say "don't do anything yet", only answer.
- Anonymity matters: never put their real name anywhere (code, commits, usernames,
  emails). Public identity is GitHub **sudokusprint**; in-game username **@mangoman**.
- Supabase SQL changes: write a script in `supabase/`, put it on the clipboard,
  and have them paste it into the SQL Editor; then verify from outside with the
  publishable key (expect 401 for anything private). Never ask for or handle
  passwords, the database password, `service_role`/secret keys, or the Gmail
  App Password.

## Where things are

- Live site: https://sudokusprint.github.io/sudoku-sprint/ (GitHub Pages, deploys
  `main` about 1-2 minutes after a push; phones may cache for about 10 minutes)
- Repo: https://github.com/sudokusprint/sudoku-sprint (public)
- Supabase project `tntifldvaskyryvvvbqw`: https://supabase.com/dashboard/project/tntifldvaskyryvvvbqw
  (free plan: pauses after 7 days with no activity; fix with Restore in the dashboard)
- Local dev: `powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 5174`, then
  http://localhost:5174 (tests at /tests/). Run it in the background from this folder.
  The browser pane's `preview_start` has picked up a stale folder before; if pages look
  old, check the server log's "Serving <folder>" line.

## Dashboard-only settings (not in the repo)

- **Auth → SMTP**: custom SMTP through the game's own Gmail (smtp.gmail.com, port 465,
  App Password). Sign-in emails often land in junk; a domain + Resend is the planned fix.
- **Auth → Email templates**: "Magic link" (subject "Your Sudoku Sprint sign-in code")
  and "Confirm sign up" (subject "Welcome to Sudoku Sprint: your sign-in code") both
  use the body with `{{ .Token }}` and `{{ .ConfirmationURL }}`.
- **Auth → URL configuration**: Site URL is the live site; redirect URLs are the live
  site `/**`, `http://localhost:5173/**`, `http://localhost:5174/**`.
- SQL scripts already run, in order: schema.sql, daily.sql, daily puzzles (generated),
  streaks.sql, friends.sql, friend-race-record.sql, daily-checks.sql, username-check.sql.

## Rules that must not be broken

- **Never commit daily puzzle files** (`tools/output/`, gitignored): they contain the
  solutions. Delete them after they're pasted into Supabase.
- Every table has RLS; private data is reachable only through security-definer
  functions. Revoke new functions from `public, anon, authenticated` explicitly, then
  grant what's needed (Supabase grants new functions to anon by default).
- Daily puzzles exist through **2027-09-29**. Before then, regenerate with
  `tools/generate-daily.html` (server with `-AllowSave`, open in visible Chrome).

## Game decisions (keep consistent)

- Daily day = midnight **America/New_York**. Grades: Easy = singles only; Medium = needs
  pairs/pointing at most 2 times; Hard = 4+ such steps or a tier-3+ technique.
- Daily checks each number server-side (`check_daily_cell`): wrong turns red, right locks.
  Wrong guesses are counted in `daily_attempts.mistakes` but **no time penalty yet**;
  the owner may want one later (a +10s per mistake idea was discussed).
- Correct numbers lock in every mode (except Solo with "Show mistakes" off). Tapping a
  pad number on a locked or given cell highlights that number.
- A mistake stays counted even if undone or erased.
- Streak: a day counts if any Daily difficulty was solved; still current until the end
  of the next day.
- Friend races (Supabase Realtime, max 4, no sign-in needed): win = finish first; loss =
  someone else finishes first, or you leave before anyone finishes. Counted once.
  The race record shows Friends / Ghost / Overall.
- Game screens: board, then tool row, then number pad (2 rows; Settings has a 1-row
  option). Solo tools: Notes / Erase / New puzzle (Undo hidden; New asks for a 2nd tap).

## Environment quirks (Windows, PowerShell 5.1)

- `git` isn't on the tool shell's PATH; prefix commands with
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`.
- Commit messages: use a single-quoted here-string (`@' ... '@`) and **no double quotes
  inside**, or PowerShell splits the message into pathspecs.
- Don't use `Set-Content`/`Get-Content` to rewrite source files (BOM and
  mis-decoded emoji). Use `[IO.File]::ReadAllText(p, UTF8)` / `WriteAllText(p, t, new UTF8Encoding($false))`, or the Edit tool.
- The browser pane is usually hidden, which throttles timers and makes mobile-emulation
  screenshots crop or go stale. Verify layout with measurements (getBoundingClientRect)
  and keep scripts under about 40 seconds. Signed-in flows can't be tested there; ask
  the owner to test on their phone.

## Ideas / to-do

- App icon (replace the plain "S" home-screen icon)
- Domain + domain-based email (fewer junk-folder sign-in emails)
- Solo Hard: use the Daily grading (`DAILY_GRADES`) so "couldn't find a genuine Hard" goes away
- Optional Daily mistake penalty (see above)
