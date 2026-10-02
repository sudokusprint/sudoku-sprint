// Daily Challenge: thin wrappers around the database functions in supabase/daily.sql.
// The server hands out puzzles, times attempts, and checks solutions; nothing
// here can affect a score except submitting a correct grid.
import { getSupabase } from './supabase.js';

// Must match daily_today() in supabase/daily.sql.
export const DAILY_TIME_ZONE = 'America/New_York';
export const DAILY_DIFFICULTIES = ['easy', 'medium', 'hard'];

const MESSAGES = {
  not_signed_in: 'Sign in to play the Daily Challenge.',
  needs_username: 'Choose a username on your Profile to play the Daily Challenge.',
  no_puzzle_today: 'Today\'s puzzle isn\'t ready yet. Please check back soon.',
  not_started: 'That puzzle wasn\'t started.',
  too_late: 'That day\'s challenge has closed.'
};

// Throw an Error with a friendly message (and .code = the server's error name).
function fail(error) {
  const code = Object.keys(MESSAGES).find(k => (error.message || '').includes(k));
  const err = new Error(code ? MESSAGES[code]
    : error.code === 'PGRST202' ? 'The Daily Challenge isn\'t set up yet. Please check back soon.'
    : error.code === '42501' ? 'Please sign in again to play the Daily Challenge.'   // "permission denied"
    : /fetch|network/i.test(error.message || '') ? 'Couldn\'t reach the server. Check your connection.'
    : (error.message || 'Something went wrong. Please try again.'));
  err.code = code || null;
  return err;
}

async function rpc(name, args) {
  const sb = await getSupabase();
  if (!sb) throw new Error('The Daily Challenge is unavailable right now.');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw fail(error);
  return data;
}

// One row per difficulty: { day, difficulty, available, started_at, finished_at, seconds, rank, total, server_now }
export function fetchDailyStatus() {
  return rpc('daily_status');
}

// Starts (or resumes) today's attempt. Returns { day, puzzle, tier, techniques, started_at, finished_at, seconds, server_now }.
export async function startDaily(difficulty) {
  const rows = await rpc('start_daily', { p_difficulty: difficulty });
  if (!rows || !rows.length) throw new Error(MESSAGES.no_puzzle_today);
  return rows[0];
}

// Is `value` right for cell (r, c)? Asks the server; the solution never leaves it.
export function checkDailyCell(day, difficulty, r, c, value) {
  return rpc('check_daily_cell', { p_day: day, p_difficulty: difficulty, p_index: r * 9 + c, p_value: value });
}

// Returns { correct, seconds, rank, total }.
export async function submitDaily(day, difficulty, gridString) {
  const rows = await rpc('submit_daily', { p_day: day, p_difficulty: difficulty, p_grid: gridString });
  return rows[0];
}

// Top finishers: [{ rank, username, seconds, is_me }]
export function fetchLeaderboard(day, difficulty, limit = 50) {
  return rpc('daily_leaderboard', { p_day: day, p_difficulty: difficulty, p_limit: limit });
}

// All-time board. kind: 'streak' (current), 'best_streak', or 'solves'.
// Returns [{ rank, username, value, is_me }]
export function fetchAlltimeLeaderboard(kind, limit = 50) {
  return rpc('alltime_leaderboard', { p_kind: kind, p_limit: limit });
}

// Signed-in player's { current_streak, best_streak, total_solves, solved_today }
export async function fetchMyDailyStats() {
  const rows = await rpc('my_daily_stats');
  return rows[0];
}

// Milliseconds until the next daily reset (midnight in DAILY_TIME_ZONE).
export function msUntilReset(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: DAILY_TIME_ZONE, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(now).map(p => [p.type, p.value])
  );
  const secondsToday = (+parts.hour % 24) * 3600 + (+parts.minute) * 60 + (+parts.second);
  return (86400 - secondsToday) * 1000 - now.getMilliseconds();
}
