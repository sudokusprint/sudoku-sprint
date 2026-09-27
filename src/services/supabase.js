// Lazily loads the Supabase client. Resolves to null if it can't be loaded
// (offline, CDN blocked), so the game keeps working in guest mode.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_JS_URL } from '../config.js';

let clientPromise = null;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS_URL)
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      }))
      .catch(err => {
        console.warn('Accounts unavailable:', err);
        return null;
      });
  }
  return clientPromise;
}
