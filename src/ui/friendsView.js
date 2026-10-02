// Profile → Friends (add, accept, remove, invite to race) and the pop-up shown
// when a friend invites you.
import {
  fetchFriends, sendFriendRequest, respondToRequest, removeFriend, sendRaceInvite, dismissInvite, onRaceInvite
} from '../services/friends.js';
import { getAccount, onAccountChange } from '../services/account.js';
import * as liveRace from './liveRace.js';

const $ = id => document.getElementById(id);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const REFRESH_MS = 30 * 1000;

let els;
let showView = () => {};
let friends = [];
let loaded = false;
let inviting = null;        // username whose difficulty picker is open
let refreshTimer = null;
let toastQueue = [];

// goTo(viewId) switches the app to another view.
export function initFriendsView({ goTo }) {
  showView = goTo;
  els = {
    section: $('friendsSection'), form: $('addFriendForm'), input: $('addFriendInput'),
    message: $('friendsMessage'), list: $('friendsList'),
    toast: $('inviteToast'), toastText: $('inviteToastText'), joinBtn: $('inviteJoinBtn'), declineBtn: $('inviteDeclineBtn')
  };
  els.form.addEventListener('submit', onAddFriend);
  els.joinBtn.addEventListener('click', () => answerToast(true));
  els.declineBtn.addEventListener('click', () => answerToast(false));

  onAccountChange(account => {
    const usable = account.status === 'signedIn' && account.profileStatus === 'ok';
    els.section.hidden = !usable;
    if (!usable) { friends = []; loaded = false; render(); }
    else if (isProfileVisible()) refresh();
  });
  onRaceInvite(invite => { toastQueue.push(invite); showNextToast(); });
}

function isProfileVisible() {
  return $('profileView').classList.contains('active');
}

// Called when Profile opens; keeps the list (and online dots) fresh while it's open.
export function onProfileShown() {
  if (els.section.hidden) return;
  refresh();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!isProfileVisible()) { clearInterval(refreshTimer); return; }
    if (document.visibilityState === 'visible') refresh();
  }, REFRESH_MS);
}

async function refresh() {
  try {
    friends = await fetchFriends();
    loaded = true;
  } catch (err) {
    setMessage(err.message, true);
  }
  render();
}

function setMessage(text, isError) {
  els.message.textContent = text || '';
  els.message.classList.toggle('error', !!isError);
}

async function onAddFriend(e) {
  e.preventDefault();
  const name = els.input.value.trim().replace(/^@/, '');
  if (!name) { setMessage('Type a username, like mangoman.', true); return; }
  const mine = getAccount().profile;
  if (mine && mine.username.toLowerCase() === name.toLowerCase()) { setMessage('That\'s you!', true); return; }
  setMessage('Sending…');
  try {
    const result = await sendFriendRequest(name);
    els.input.value = '';
    setMessage(result === 'accepted'
      ? 'You\'re now friends with @' + name + '!'
      : 'Friend request sent to @' + name + '.');
    refresh();
  } catch (err) {
    setMessage(err.message, true);
  }
}

// ---------- list ----------

function button(label, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function render() {
  const list = els.list;
  list.innerHTML = '';
  if (!loaded) return;
  if (!friends.length) {
    const p = document.createElement('p');
    p.className = 'recentEmpty';
    p.textContent = 'No friends yet. Add someone by their username to race them.';
    list.appendChild(p);
    return;
  }
  const groups = [
    ['incoming', 'Requests'],
    ['friend', 'Your friends'],
    ['outgoing', 'Sent requests']
  ];
  for (const [kind, title] of groups) {
    const rows = friends.filter(f => f.direction === kind);
    if (!rows.length) continue;
    const heading = document.createElement('div');
    heading.className = 'friendsGroup';
    heading.textContent = title + (kind === 'friend' ? ' · ' + rows.filter(f => f.online).length + ' online' : '');
    list.appendChild(heading);
    for (const f of rows) list.appendChild(renderRow(f));
  }
}

function renderRow(f) {
  const row = document.createElement('div');
  row.className = 'friendRow';
  const main = document.createElement('div');
  main.className = 'friendMain';
  const name = document.createElement('span');
  name.className = 'friendName';
  name.textContent = '@' + f.username;
  main.appendChild(name);
  if (f.direction === 'friend') {
    const status = document.createElement('span');
    status.className = 'friendStatus' + (f.online ? ' online' : '');
    status.textContent = f.online ? 'Online' : 'Offline';
    main.appendChild(status);
  } else {
    const status = document.createElement('span');
    status.className = 'friendStatus';
    status.textContent = f.direction === 'incoming' ? 'Wants to be friends' : 'Request sent';
    main.appendChild(status);
  }
  row.appendChild(main);

  const actions = document.createElement('div');
  actions.className = 'friendActions';
  if (f.direction === 'incoming') {
    actions.append(
      button('Accept', 'friendBtn primary', () => act(() => respondToRequest(f.username, true), 'You\'re now friends with @' + f.username + '!')),
      button('Decline', 'friendBtn', () => act(() => respondToRequest(f.username, false), ''))
    );
  } else if (f.direction === 'outgoing') {
    actions.append(button('Cancel', 'friendBtn', () => act(() => removeFriend(f.username), 'Request cancelled.')));
  } else {
    actions.append(button('Invite', 'friendBtn primary', () => toggleInvite(f.username)));
  }
  row.appendChild(actions);

  if (f.direction === 'friend' && inviting === f.username) row.appendChild(renderInvitePicker(f));
  return row;
}

function renderInvitePicker(f) {
  const box = document.createElement('div');
  box.className = 'invitePicker';
  const hosted = liveRace.hostedLobby();
  const label = document.createElement('div');
  label.className = 'invitePickerLabel';
  if (hosted) {
    label.textContent = 'Invite @' + f.username + ' to your open ' + cap(hosted.difficulty) + ' lobby?';
    box.append(label, button('Send invite', 'friendBtn primary', () => invite(f.username, hosted.difficulty)));
  } else {
    label.textContent = 'Race @' + f.username + ' on:';
    box.appendChild(label);
    for (const d of ['easy', 'medium', 'hard']) box.appendChild(button(cap(d), 'friendBtn', () => invite(f.username, d)));
  }
  const remove = button('Remove friend', 'linkBtn dangerLink', async () => {
    if (!confirm('Remove @' + f.username + ' from your friends?')) return;
    inviting = null;
    act(() => removeFriend(f.username), 'Removed @' + f.username + '.');
  });
  remove.classList.add('inviteRemove');
  box.appendChild(remove);
  return box;
}

function toggleInvite(username) {
  inviting = inviting === username ? null : username;
  render();
}

async function act(fn, successText) {
  try {
    await fn();
    setMessage(successText);
  } catch (err) {
    setMessage(err.message, true);
  }
  refresh();
}

async function invite(username, difficulty) {
  setMessage('Opening a race lobby…');
  let hosted = liveRace.hostedLobby();
  if (!hosted) {
    const code = await liveRace.hostRace(difficulty);
    if (!code) { setMessage('Couldn\'t open a race lobby. Check your connection.', true); return; }
    hosted = { code, difficulty };
  }
  try {
    await sendRaceInvite(username, hosted.code, hosted.difficulty);
  } catch (err) {
    setMessage(err.message, true);
    return;
  }
  inviting = null;
  setMessage('Invite sent to @' + username + '. Waiting for them in the lobby.');
  render();
  showView('raceView');
}

// ---------- incoming invite pop-up ----------

function showNextToast() {
  if (!els.toast.hidden || !toastQueue.length) return;
  const invite = toastQueue[0];
  els.toastText.textContent = '🏁 @' + invite.from_username + ' invited you to race (' + cap(invite.difficulty) + ')';
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('show'));
}

async function answerToast(join) {
  const invite = toastQueue.shift();
  els.toast.classList.remove('show');
  els.toast.hidden = true;
  if (invite) {
    dismissInvite(invite.id).catch(() => {});
    if (join) {
      showView('raceView');
      liveRace.joinRace(invite.code);
    }
  }
  showNextToast();
}
