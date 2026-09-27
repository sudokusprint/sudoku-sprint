// Sign-in state and the player's public profile (username).
//
// status:        'loading' | 'unavailable' (Supabase couldn't load) | 'guest' | 'signedIn'
// profileStatus: 'ok' | 'missing' (signed in, no username yet) | 'error' (couldn't load it)
import { getSupabase } from './supabase.js';

let state = { status: 'loading', user: null, profile: null, profileStatus: null };
const listeners = new Set();
let currentUserId;          // undefined until the first auth event
let sessionSeq = 0;

export function getAccount() { return state; }

export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach(fn => fn(state));
}

export async function initAccount() {
  const sb = await getSupabase();
  if (!sb) { setState({ status: 'unavailable' }); return; }
  sb.auth.onAuthStateChange((event, session) => {
    // Supabase advises against awaiting its own calls inside this callback.
    setTimeout(() => handleSession(sb, session), 0);
  });
}

async function handleSession(sb, session) {
  const user = session ? session.user : null;
  const userId = user ? user.id : null;
  if (userId === currentUserId) {
    if (user) setState({ user });   // token refresh: keep the fresher user object
    return;
  }
  currentUserId = userId;
  const seq = ++sessionSeq;
  if (!user) {
    setState({ status: 'guest', user: null, profile: null, profileStatus: null });
    return;
  }
  const result = await fetchProfile(sb, user.id);
  if (seq !== sessionSeq) return;   // signed out / switched account meanwhile
  setState({ status: 'signedIn', user, ...result });
}

async function fetchProfile(sb, userId) {
  const { data, error } = await sb.from('profiles').select('id, username').eq('id', userId).maybeSingle();
  if (error) return { profile: null, profileStatus: 'error' };
  return { profile: data, profileStatus: data ? 'ok' : 'missing' };
}

export async function retryProfile() {
  const sb = await getSupabase();
  if (!sb || !state.user) return;
  setState(await fetchProfile(sb, state.user.id));
}

// Where the sign-in link in the email should send the player back to.
function redirectUrl() {
  return location.origin + location.pathname;
}

// context: 'send' (requesting a code) or 'verify' (entering it)
function authErrorMessage(error, context) {
  const msg = (error && error.message) || '';
  if ((error && error.status === 429) || /rate limit|too many/i.test(msg)) {
    return context === 'send'
      ? 'Too many sign-in emails were sent. Please wait a few minutes and try again.'
      : 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (context === 'send' && /email/i.test(msg) && /invalid|valid/i.test(msg)) {
    return 'That email address doesn\'t look right.';
  }
  if (context === 'verify' && /expired|invalid|token/i.test(msg)) {
    return 'That code didn\'t work. Check it, or send a new code.';
  }
  if (/fetch|network/i.test(msg)) {
    return 'Couldn\'t reach the server. Check your connection and try again.';
  }
  return msg || 'Something went wrong. Please try again.';
}

// Returns null on success, or a message to show.
export async function sendSignInCode(email) {
  const sb = await getSupabase();
  if (!sb) return 'Accounts are unavailable right now. Please try again later.';
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() }
  });
  return error ? authErrorMessage(error, 'send') : null;
}

export async function verifySignInCode(email, code) {
  const sb = await getSupabase();
  if (!sb) return 'Accounts are unavailable right now. Please try again later.';
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
  return error ? authErrorMessage(error, 'verify') : null;
}

export async function signOut() {
  const sb = await getSupabase();
  if (sb) await sb.auth.signOut();
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

// Returns null on success, or a message to show.
export async function chooseUsername(username) {
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use 3–20 letters, numbers, or underscores.';
  }
  const sb = await getSupabase();
  if (!sb || !state.user) return 'You need to be signed in.';
  const { error } = await sb.from('profiles').insert({ id: state.user.id, username });
  if (error) {
    if (error.code === '23505') {
      // Unique violation: either the name is taken, or this account already has a profile.
      const existing = await fetchProfile(sb, state.user.id);
      if (existing.profileStatus === 'ok') { setState(existing); return null; }
      return 'That username is taken. Try another.';
    }
    if (/username_not_allowed/.test(error.message)) return 'That username isn\'t allowed. Try another.';
    if (error.code === '23514') return 'Use 3–20 letters, numbers, or underscores.';
    return error.message || 'Couldn\'t save your username. Please try again.';
  }
  setState({ profile: { id: state.user.id, username }, profileStatus: 'ok' });
  return null;
}

// Permanently deletes the account and all saved progress. Returns null on success.
export async function deleteAccount() {
  const sb = await getSupabase();
  if (!sb) return 'Accounts are unavailable right now. Please try again later.';
  const { error } = await sb.rpc('delete_my_account');
  if (error) return error.message || 'Couldn\'t delete your account. Please try again.';
  // The server session no longer exists, so only clear it locally.
  await sb.auth.signOut({ scope: 'local' });
  return null;
}
