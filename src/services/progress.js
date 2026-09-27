// Records finished games and serves the player's stats.
//
// Guest:     stats live in this browser's localStorage (same keys as always).
// Signed in: every finished game is a row in the `solves` table. Rows are queued
//            in localStorage first and removed once the server has them, so a
//            dropped connection never loses a solve. The first time an account
//            loads on a device with guest progress, that progress is imported
//            into the account (once) and cleared from the device.
import { getSupabase } from './supabase.js';
import { onAccountChange } from './account.js';
import { emptyStats, statsFromSolves, hasAnyProgress } from '../core/stats.js';
import { TECHNIQUES_INFO } from '../core/techniques.js';
import {
  readGuestStats, clearGuestStats, incrementCounter, addLifetimeMistakes, saveBestSeconds
} from './storage.js';

const TECHNIQUE_NAMES = TECHNIQUES_INFO.map(t => t.name);
const SOLVE_COLUMNS = 'client_id, mode, difficulty, technique, seconds, mistakes, won, created_at';
const PAGE_SIZE = 1000;

// status: 'guest' | 'loading' | 'ready' | 'error'
let status = 'guest';
let cloud = null;          // { userId, solves, imported, seq }
let cachedStats = null;
let lastImport = null;     // stats moved from this device into the account, for a one-time notice
let flushing = false;
let loadSeq = 0;
const listeners = new Set();

export function onProgressChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  cachedStats = null;
  listeners.forEach(fn => fn());
}

export function progressStatus() { return status; }

export function initProgress() {
  onAccountChange(account => {
    const userId = account.status === 'signedIn' ? account.user.id : null;
    if (userId && (!cloud || cloud.userId !== userId)) startCloud(userId);
    else if (!userId && cloud) stopCloud();
  });
}

// ---------- reading ----------

export function currentStats() {
  if (!cloud) return readGuestStats(TECHNIQUE_NAMES);
  if (status !== 'ready') return emptyStats();
  if (!cachedStats) cachedStats = statsFromSolves(cloud.solves, cloud.imported);
  return cachedStats;
}

export function bestSeconds(difficulty) { return currentStats().best[difficulty]; }
export function masteryCount(techName) { return currentStats().mastery[techName] || 0; }

// Most recent first. Guests have no per-game history.
export function recentSolves(limit) {
  if (!cloud || status !== 'ready') return [];
  return cloud.solves.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
}

// Returns the imported stats once (for a "we moved your progress" notice), then null.
export function takeImportNotice() {
  const notice = lastImport;
  lastImport = null;
  return notice;
}

// ---------- recording ----------

export function recordSolo({ difficulty, seconds, mistakes }) {
  if (!cloud) {
    saveBestSeconds(difficulty, seconds);
    incrementCounter('sudoku-completed-' + difficulty);
    addLifetimeMistakes(mistakes);
    emit();
    return;
  }
  saveCloud({ mode: 'solo', difficulty, seconds, mistakes });
}

export function recordRace({ difficulty, seconds, won }) {
  if (!cloud) {
    incrementCounter(won ? 'sudoku-race-wins' : 'sudoku-race-losses');
    emit();
    return;
  }
  saveCloud({ mode: 'race', difficulty, seconds, won });
}

// Only for puzzles confirmed to require the technique.
export function recordWorkshop({ technique }) {
  if (!cloud) {
    incrementCounter('sudoku-mastery-' + technique);
    emit();
    return;
  }
  saveCloud({ mode: 'workshop', technique });
}

function saveCloud(fields) {
  const row = {
    client_id: crypto.randomUUID(),
    mode: fields.mode,
    difficulty: fields.difficulty ?? null,
    technique: fields.technique ?? null,
    seconds: fields.seconds ?? null,
    mistakes: fields.mistakes ?? null,
    won: fields.won ?? null,
    created_at: new Date().toISOString()
  };
  const userId = cloud.userId;
  writePending(userId, readPending(userId).concat(row));
  cloud.solves.push(row);
  emit();
  flushPending();
}

// ---------- cloud sync ----------

function pendingKey(userId) { return 'sudoku-pending-' + userId; }

function readPending(userId) {
  try { return JSON.parse(localStorage.getItem(pendingKey(userId)) || '[]'); } catch (e) { return []; }
}

function writePending(userId, rows) {
  try {
    if (rows.length) localStorage.setItem(pendingKey(userId), JSON.stringify(rows));
    else localStorage.removeItem(pendingKey(userId));
  } catch (e) {}
}

async function flushPending() {
  if (!cloud || flushing) return;
  const userId = cloud.userId;
  const rows = readPending(userId);
  if (!rows.length) return;
  const sb = await getSupabase();
  if (!sb) return;
  flushing = true;
  let sent = false;
  try {
    const { error } = await sb.from('solves')
      .upsert(rows.map(r => ({ ...r, user_id: userId })), { onConflict: 'user_id,client_id', ignoreDuplicates: true });
    if (error) {
      console.warn('Couldn\'t save solves yet; will retry:', error);
    } else {
      const done = new Set(rows.map(r => r.client_id));
      writePending(userId, readPending(userId).filter(r => !done.has(r.client_id)));
      sent = true;
    }
  } catch (err) {
    console.warn('Couldn\'t save solves yet; will retry:', err);
  } finally {
    flushing = false;
  }
  // Solves recorded while that request was in flight go out now. After a
  // failure, wait for the next solve, reconnect, or reload instead of looping.
  if (sent && cloud && cloud.userId === userId && readPending(userId).length) flushPending();
}

window.addEventListener('online', () => flushPending());

async function fetchAllSolves(sb, userId) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb.from('solves')
      .select(SOLVE_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

// Import this device's guest progress into the account, once per account.
async function loadImportedStats(sb, userId) {
  const { data, error } = await sb.from('imported_stats').select('stats').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return data.stats;

  const guest = readGuestStats(TECHNIQUE_NAMES);
  if (!hasAnyProgress(guest)) return null;
  const insert = await sb.from('imported_stats').insert({ user_id: userId, stats: guest });
  if (insert.error) {
    if (insert.error.code === '23505') return loadImportedStats(sb, userId);  // another device got there first
    throw insert.error;
  }
  clearGuestStats();
  lastImport = guest;
  return guest;
}

async function startCloud(userId) {
  const seq = ++loadSeq;
  cloud = { userId, solves: [], imported: null };
  status = 'loading';
  emit();
  const sb = await getSupabase();
  try {
    const imported = await loadImportedStats(sb, userId);
    const serverSolves = await fetchAllSolves(sb, userId);
    if (seq !== loadSeq) return;
    const known = new Set(serverSolves.map(r => r.client_id));
    // Keep anything recorded on this device that hasn't reached the server yet.
    const unsent = readPending(userId).filter(r => !known.has(r.client_id));
    const recordedWhileLoading = cloud.solves.filter(r => !known.has(r.client_id) && !unsent.some(u => u.client_id === r.client_id));
    cloud.solves = serverSolves.concat(unsent, recordedWhileLoading);
    cloud.imported = imported;
    status = 'ready';
    emit();
    flushPending();
  } catch (err) {
    if (seq !== loadSeq) return;
    console.warn('Couldn\'t load progress:', err);
    status = 'error';
    emit();
  }
}

export function retryProgress() {
  if (cloud) startCloud(cloud.userId);
}

function stopCloud() {
  loadSeq++;
  cloud = null;
  status = 'guest';
  emit();
}
