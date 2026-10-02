-- Sudoku Sprint: allow friend races in the saved game history.
-- Run after schema.sql, in Supabase → SQL Editor. Safe to run again.
alter table public.solves drop constraint if exists solves_mode_check;
alter table public.solves
  add constraint solves_mode_check check (mode in ('solo', 'race', 'workshop', 'friend_race'));
