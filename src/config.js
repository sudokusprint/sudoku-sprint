// Supabase project used for accounts and saved progress.
// The publishable key is meant to be public: what it can do is limited by the
// Row Level Security rules in supabase/schema.sql. Never put a secret or
// service_role key in this file.
export const SUPABASE_URL = 'https://tntifldvaskyryvvvbqw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_IlOhRamFkt5gMhkue-sTTw_mQGIe_bh';

// Whether the sign-in email includes a code ({{ .Token }}) as well as a link.
// Supabase only allows editing its email templates once custom SMTP is set up;
// until then the email has just a link, so the dialog doesn't ask for a code.
export const SIGN_IN_EMAIL_HAS_CODE = false;

export const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
