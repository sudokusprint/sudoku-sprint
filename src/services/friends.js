// Friends, online status, and race invites (supabase/friends.sql).
//
// Online status: while a signed-in player has the game open (and "Show me as
// online" is on), it checks in every minute; friends see them online for two
// minutes after the last check-in. Invites arrive instantly through Supabase
// Realtime (database changes on race_invites), with a 30-second poll as backup.
import { getSupabase } from './supabase.js';
import { getAccount, onAccountChange } from './account.js';
import { getSettings, onSettingsChange } from './settings.js';

const HEARTBEAT_MS = 60 * 1000;
const INVITE_POLL_MS = 30 * 1000;

const MESSAGES = {
  not_signed_in: 'Sign in to add friends.',
  needs_username: 'Choose a username first.',
  user_not_found: 'No player has that username.',
  cannot_add_self: 'That\'s you!',
  already_friends: 'You\'re already friends.',
  already_requested: 'You already sent them a request.',
  too_many_requests: 'You have a lot of requests waiting. Try again once some are answered.',
  not_friends: 'You can only invite friends.'
};

async function rpc(name, args) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Friends are unavailable right now.');
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    const code = Object.keys(MESSAGES).find(k => (error.message || '').includes(k));
    throw new Error(code ? MESSAGES[code]
      : error.code === 'PGRST202' ? 'Friends aren\'t set up yet. Please check back soon.'
      : (error.message || 'Something went wrong. Please try again.'));
  }
  return data;
}

const clean = name => (name || '').trim().replace(/^@/, '');

// [{ username, direction: 'friend' | 'incoming' | 'outgoing', online }]
export function fetchFriends() { return rpc('my_friends'); }
// Returns 'sent' or 'accepted'.
export function sendFriendRequest(username) { return rpc('send_friend_request', { p_username: clean(username) }); }
export function respondToRequest(username, accept) { return rpc('respond_friend_request', { p_username: username, p_accept: accept }); }
export function removeFriend(username) { return rpc('remove_friend', { p_username: username }); }
export function sendRaceInvite(username, code, difficulty) {
  return rpc('send_race_invite', { p_username: username, p_code: code, p_difficulty: difficulty });
}
export function dismissInvite(id) { return rpc('dismiss_race_invite', { p_id: id }); }

// ---------- running in the background while signed in ----------

let userId = null;
let heartbeatTimer = null;
let pollTimer = null;
let inviteChannel = null;
const seenInvites = new Set();
const inviteListeners = new Set();

// fn({ id, from_username, code, difficulty, created_at }) for each new invite.
export function onRaceInvite(fn) { inviteListeners.add(fn); }

function canUseFriends(account) {
  return account.status === 'signedIn' && account.profileStatus === 'ok';
}

export function initFriends() {
  onAccountChange(account => {
    const id = canUseFriends(account) ? account.user.id : null;
    if (id === userId) return;
    stopAll();
    userId = id;
    if (userId) startAll();
  });
  onSettingsChange(() => { if (userId) updateHeartbeat(); });
  document.addEventListener('visibilitychange', () => {
    if (!userId) return;
    if (document.visibilityState === 'visible') { updateHeartbeat(); checkInvites(); }
  });
}

function startAll() {
  updateHeartbeat();
  subscribeInvites();
  checkInvites();
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') checkInvites(); }, INVITE_POLL_MS);
}

function stopAll() {
  clearInterval(heartbeatTimer);
  clearInterval(pollTimer);
  heartbeatTimer = pollTimer = null;
  if (inviteChannel) {
    const ch = inviteChannel;
    inviteChannel = null;
    getSupabase().then(sb => sb && sb.removeChannel(ch));
  }
}

function updateHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (getSettings().showOnline) {
    const beat = () => { if (document.visibilityState === 'visible') rpc('heartbeat').catch(() => {}); };
    beat();
    heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  } else {
    rpc('go_offline').catch(() => {});
  }
}

async function subscribeInvites() {
  const sb = await getSupabase();
  if (!sb || !userId) return;
  const id = userId;
  inviteChannel = sb.channel('invites-' + id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_invites', filter: 'to_user=eq.' + id },
      () => checkInvites())
    .subscribe();
}

async function checkInvites() {
  if (!userId) return;
  let invites;
  try { invites = await rpc('my_race_invites'); } catch (e) { return; }
  for (const invite of invites) {
    if (seenInvites.has(invite.id)) continue;
    seenInvites.add(invite.id);
    inviteListeners.forEach(fn => fn(invite));
  }
}
