// Account UI: the card on Profile, the note on Home, the sign-in dialog
// (email → code → username) and the delete-account dialog.
import {
  getAccount, onAccountChange, sendSignInCode, verifySignInCode, signOut,
  chooseUsername, renameUsername, deleteAccount, retryProfile
} from '../services/account.js';
import { progressStatus, onProgressChange, retryProgress, takeImportNotice } from '../services/progress.js';
import { SIGN_IN_EMAIL_HAS_CODE } from '../config.js';

const RESEND_SECONDS = 30;

let els;
let pendingEmail = '';
let resendTimer = null;
let promptedUsernameFor = null;
let importNotice = null;
let usernameMode = 'username';
let lastStatus = null;

const $ = id => document.getElementById(id);

export function initAccountView() {
  els = {
    card: $('accountCard'),
    homeNote: $('homeAccountNote'),
    overlay: $('authOverlay'),
    emailStep: $('authEmailStep'), email: $('authEmail'), emailError: $('authEmailError'), sendBtn: $('authSendBtn'),
    codeStep: $('authCodeStep'), code: $('authCode'), codeError: $('authCodeError'), verifyBtn: $('authVerifyBtn'),
    codeText: $('authCodeText'), resend: $('authResend'), changeEmail: $('authChangeEmail'),
    usernameStep: $('authUsernameStep'), username: $('authUsername'), usernameError: $('authUsernameError'), usernameBtn: $('authUsernameBtn'),
    usernameTitle: $('authUsernameTitle'),
    deleteOverlay: $('deleteOverlay'), deleteForm: $('deleteForm'), deleteConfirm: $('deleteConfirm'),
    deleteWord: $('deleteWordShown'), deleteError: $('deleteError'), deleteBtn: $('deleteBtn')
  };

  $('authClose').addEventListener('click', closeAuth);
  els.overlay.addEventListener('click', e => { if (e.target === els.overlay) closeAuth(); });
  els.emailStep.addEventListener('submit', onSendCode);
  els.codeStep.addEventListener('submit', onVerifyCode);
  els.code.addEventListener('input', () => { els.code.value = els.code.value.replace(/\D/g, ''); });
  els.resend.addEventListener('click', onResend);
  els.changeEmail.addEventListener('click', () => showStep('email'));
  els.usernameStep.addEventListener('submit', onChooseUsername);

  els.deleteForm.addEventListener('submit', onDelete);
  els.deleteConfirm.addEventListener('input', () => {
    els.deleteBtn.disabled = els.deleteConfirm.value.trim() !== deleteWord();
  });
  $('deleteCancel').addEventListener('click', closeDelete);
  els.deleteOverlay.addEventListener('click', e => { if (e.target === els.deleteOverlay) closeDelete(); });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (els.deleteOverlay.classList.contains('show')) closeDelete();
    else if (els.overlay.classList.contains('show')) closeAuth();
  });

  onAccountChange(onAccount);
  onProgressChange(() => {
    const notice = takeImportNotice();
    if (notice) importNotice = notice;
    render();
  });
  render();
}

// ---------- rendering ----------

function button(label, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function para(text, className) {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

function render() {
  const account = getAccount();
  renderHomeNote(account);
  renderCard(account);
}

function renderHomeNote(account) {
  const note = els.homeNote;
  note.innerHTML = '';
  if (account.status === 'guest') {
    note.appendChild(button('Sign in to save your progress on any device', 'linkBtn', openAuth));
  } else if (account.status === 'signedIn' && account.profile) {
    const name = document.createElement('strong');
    name.textContent = '@' + account.profile.username;
    note.append('Signed in as ', name);
  }
}

function renderCard(account) {
  const card = els.card;
  card.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'accountTitle';
  card.appendChild(title);

  if (account.status === 'loading') {
    title.textContent = 'Checking sign-in…';
    return;
  }
  if (account.status === 'unavailable') {
    title.textContent = 'Accounts are unavailable right now';
    card.appendChild(para('Your progress is still saved on this device.', 'accountText'));
    return;
  }
  if (account.status === 'guest') {
    title.textContent = 'Playing as a guest';
    card.appendChild(para('Your progress is only saved on this device. Sign in to keep it safe and use it on any device.', 'accountText'));
    const actions = document.createElement('div');
    actions.className = 'accountActions';
    actions.appendChild(button('Sign in or create account', 'accountPrimary', openAuth));
    card.appendChild(actions);
    return;
  }

  // Signed in
  title.textContent = account.profile ? '@' + account.profile.username : 'Signed in';
  card.appendChild(para('Signed in as ' + account.user.email, 'accountText'));

  if (account.profileStatus === 'missing') {
    card.appendChild(para('Choose a username to finish setting up your account.', 'accountWarn'));
  } else if (account.profileStatus === 'error') {
    card.appendChild(para('Couldn\'t load your profile.', 'accountWarn'));
  }
  const ps = progressStatus();
  if (ps === 'error') card.appendChild(para('Couldn\'t load your saved progress. Check your connection.', 'accountWarn'));
  if (importNotice) {
    card.appendChild(para('Your progress from this device is now saved to your account.', 'accountGood'));
  }

  const actions = document.createElement('div');
  actions.className = 'accountActions';
  if (account.profileStatus === 'missing') actions.appendChild(button('Choose a username', 'accountPrimary', () => openAuth('username')));
  if (account.profileStatus === 'error') actions.appendChild(button('Try again', 'accountPrimary', retryProfile));
  if (ps === 'error') actions.appendChild(button('Retry loading progress', 'accountPrimary', retryProgress));
  if (account.profileStatus === 'ok') actions.appendChild(button('Change username', 'accountGhost', () => openAuth('rename')));
  actions.appendChild(button('Sign out', 'accountGhost', onSignOut));
  card.appendChild(actions);
  card.appendChild(button('Delete account', 'linkBtn dangerLink', openDelete));
}

// ---------- account state ----------

function onAccount(account) {
  const justSignedIn = account.status === 'signedIn' && lastStatus !== 'signedIn';
  lastStatus = account.status;
  if (account.status !== 'signedIn') {
    importNotice = null;
    promptedUsernameFor = null;
  }
  if (account.status === 'signedIn') {
    if (account.profileStatus === 'missing') {
      // Ask once per sign-in; after that the Profile card offers the button.
      if (promptedUsernameFor !== account.user.id) {
        promptedUsernameFor = account.user.id;
        openAuth('username');
      }
    } else if (justSignedIn && isAuthOpen()) {
      closeAuth();   // signed in from the code step (or another tab)
    }
  }
  render();
}

// ---------- sign-in dialog ----------

function isAuthOpen() { return els.overlay.classList.contains('show'); }

function openAuth(step) {
  showStep(typeof step === 'string' ? step : 'email');
  els.overlay.classList.add('show');
}

function closeAuth() {
  els.overlay.classList.remove('show');
}

// step: 'email' | 'code' | 'username' (first-time pick) | 'rename'
function showStep(step) {
  const isName = step === 'username' || step === 'rename';
  els.emailStep.hidden = step !== 'email';
  els.codeStep.hidden = step !== 'code';
  els.usernameStep.hidden = !isName;
  els.emailError.textContent = '';
  els.codeError.textContent = '';
  els.usernameError.textContent = '';
  if (isName) {
    usernameMode = step;
    const current = getAccount().profile;
    els.usernameTitle.textContent = step === 'rename' ? 'Change your username' : 'Choose a username';
    els.usernameBtn.textContent = step === 'rename' ? 'Save new username' : 'Save username';
    els.username.value = step === 'rename' && current ? current.username : '';
  }
  const focus = isName ? els.username : { email: els.email, code: els.code }[step];
  setTimeout(() => { focus.focus(); if (step === 'rename') focus.select(); }, 50);
}

function setBusy(btn, busy, busyLabel) {
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.textContent = busyLabel;
  } else if (btn.dataset.label) {
    btn.textContent = btn.dataset.label;
  }
  btn.disabled = busy;
}

async function onSendCode(e) {
  e.preventDefault();
  const email = els.email.value.trim();
  if (!email || !els.email.checkValidity()) {
    els.emailError.textContent = 'Enter a valid email address.';
    return;
  }
  setBusy(els.sendBtn, true, 'Sending…');
  const error = await sendSignInCode(email);
  setBusy(els.sendBtn, false);
  if (error) {
    els.emailError.textContent = error;
    return;
  }
  pendingEmail = email;
  els.code.value = '';
  showStep('code');
  renderCodeStepText();
  startResendCooldown();
}

// With a link-only email there's nothing to type: just tell the player to tap the link.
function renderCodeStepText() {
  const text = els.codeText;
  text.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = pendingEmail;
  if (SIGN_IN_EMAIL_HAS_CODE) {
    text.append('We sent a code to ', strong, '. Enter it below, or tap the link in the email.');
  } else {
    text.append('We sent a sign-in link to ', strong, '. Tap it to sign in — you can close this window. It may take a minute to arrive; check your spam folder too.');
  }
  els.code.hidden = !SIGN_IN_EMAIL_HAS_CODE;
  els.verifyBtn.hidden = !SIGN_IN_EMAIL_HAS_CODE;
  els.resend.textContent = SIGN_IN_EMAIL_HAS_CODE ? 'Send a new code' : 'Send a new link';
}

async function onVerifyCode(e) {
  e.preventDefault();
  const code = els.code.value.trim();
  if (code.length < 6) {
    els.codeError.textContent = 'Enter the code from the email.';
    return;
  }
  setBusy(els.verifyBtn, true, 'Checking…');
  const error = await verifySignInCode(pendingEmail, code);
  setBusy(els.verifyBtn, false);
  if (error) els.codeError.textContent = error;
  // On success the account listener moves on to the username step or closes the dialog.
}

async function onResend() {
  if (!pendingEmail) return showStep('email');
  els.resend.disabled = true;
  const error = await sendSignInCode(pendingEmail);
  els.codeError.textContent = error || '';
  if (!error) {
    els.codeError.textContent = '';
    startResendCooldown();
  } else {
    els.resend.disabled = false;
  }
}

function startResendCooldown() {
  clearInterval(resendTimer);
  let left = RESEND_SECONDS;
  const label = SIGN_IN_EMAIL_HAS_CODE ? 'Send a new code' : 'Send a new link';
  const tick = () => {
    els.resend.disabled = left > 0;
    els.resend.textContent = left > 0 ? label + ' (' + left + ')' : label;
    if (left-- <= 0) clearInterval(resendTimer);
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

async function onChooseUsername(e) {
  e.preventDefault();
  const name = els.username.value.trim();
  setBusy(els.usernameBtn, true, 'Saving…');
  const error = usernameMode === 'rename' ? await renameUsername(name) : await chooseUsername(name);
  setBusy(els.usernameBtn, false);
  if (error) {
    els.usernameError.textContent = error;
    return;
  }
  closeAuth();
  render();
}

async function onSignOut() {
  await signOut();
}

// ---------- delete dialog ----------

function deleteWord() {
  const account = getAccount();
  return account.profile ? account.profile.username : 'DELETE';
}

function openDelete() {
  els.deleteWord.textContent = deleteWord();
  els.deleteConfirm.value = '';
  els.deleteError.textContent = '';
  els.deleteBtn.disabled = true;
  els.deleteOverlay.classList.add('show');
  setTimeout(() => els.deleteConfirm.focus(), 50);
}

function closeDelete() {
  els.deleteOverlay.classList.remove('show');
}

async function onDelete(e) {
  e.preventDefault();
  if (els.deleteConfirm.value.trim() !== deleteWord()) return;
  setBusy(els.deleteBtn, true, 'Deleting…');
  const error = await deleteAccount();
  setBusy(els.deleteBtn, false);
  if (error) {
    els.deleteError.textContent = error;
    els.deleteBtn.disabled = false;
    return;
  }
  closeDelete();
}
