// Player accounts (sign-in, cloud-saved progress). While ACCOUNTS_LIVE is false,
// the live site is guest-only: no sign-in UI is shown and Supabase is never contacted.
// Turn on once sign-in has been tested and a custom email (SMTP) service is set
// up, since Supabase's built-in email only reaches the project's own team.
const ACCOUNTS_LIVE = true;
const IS_LOCAL_DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
// Always on when running locally, so sign-in can be tested without affecting the live site.
export const ACCOUNTS_ENABLED = ACCOUNTS_LIVE || IS_LOCAL_DEV;

// Supabase project used for accounts and saved progress.
// The publishable key is meant to be public: what it can do is limited by the
// Row Level Security rules in supabase/schema.sql. Never put a secret or
// service_role key in this file.
export const SUPABASE_URL = 'https://tntifldvaskyryvvvbqw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_IlOhRamFkt5gMhkue-sTTw_mQGIe_bh';

// Whether the sign-in email includes a code ({{ .Token }}) as well as a link.
// Supabase only allows editing its email templates once custom SMTP is set up.
// The Magic Link and Confirm signup templates include {{ .Token }} (see README).
export const SIGN_IN_EMAIL_HAS_CODE = true;

export const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
