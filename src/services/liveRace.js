// Real-time friend races over Supabase Realtime channels (no database tables).
// Each race room is a channel "race-<CODE>". Presence lists who is in the room;
// broadcast messages carry the race itself:
//   start    { raceId, difficulty, puzzle, solution }   (host only)
//   progress { raceId, id, correct, total }
//   finish   { raceId, id, seconds, mistakes }
// Friend races are casual and unranked, so clients trust each other.
import { getSupabase } from './supabase.js';

export const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
const EVENTS = ['start', 'progress', 'finish'];

export function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

// Tidy what someone typed or pasted into a code ("k7q f2m" -> "K7QF2M").
export function normalizeCode(text) {
  return (text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function isValidCode(code) {
  return code.length === 6 && [...code].every(ch => CODE_CHARS.includes(ch));
}

// Join a room. me: { id, name, host, joinedAt, difficulty? }.
// handlers: { onPlayers(players), onMessage(event, payload) }.
export async function joinRoom(code, me, handlers) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Racing is unavailable right now. Please try again later.');
  const channel = sb.channel('race-' + code, {
    config: { broadcast: { self: false }, presence: { key: me.id } }
  });
  const players = () => Object.values(channel.presenceState())
    .map(metas => metas[0])
    .sort((a, b) => a.joinedAt - b.joinedAt);

  channel.on('presence', { event: 'sync' }, () => handlers.onPlayers(players()));
  for (const event of EVENTS) {
    channel.on('broadcast', { event }, ({ payload }) => handlers.onMessage(event, payload));
  }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Couldn\'t connect to the race. Check your connection.')), 12000);
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        await channel.track(me);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error('Couldn\'t connect to the race. Check your connection.'));
      }
    });
  });

  return {
    send(event, payload) { return channel.send({ type: 'broadcast', event, payload }); },
    updateMe(meta) { return channel.track(meta); },
    players,
    leave() { return sb.removeChannel(channel); }
  };
}
