/**
 * Supabase client setup — REFERENCE CODE, NOT TESTED AGAINST A LIVE PROJECT.
 * This sandbox has no network access to any real Supabase instance, so
 * this has never actually connected to yours. Written correctly against
 * the official @supabase/supabase-js API, but genuinely unverified until
 * we run it together against your real project.
 *
 * Two different clients, for two different purposes — mixing them up is
 * the single easiest way to accidentally bypass Row Level Security:
 *
 *   - supabaseForRequest(token): scoped to ONE specific user's session for
 *     the duration of a single request. auth.uid() resolves correctly for
 *     this client, so every RLS policy in schema.sql applies normally. Use
 *     this for virtually everything — any query a logged-in user triggers.
 *
 *   - supabaseAdmin: uses the service_role key, which BYPASSES every RLS
 *     policy entirely. Reserved only for the small number of genuinely
 *     trusted, no-user-context operations: the hourly subscription-alert
 *     job, and deleting a Supabase Auth user outright (which requires
 *     admin privileges the Auth API doesn't grant to a normal user token).
 *     Do not reach for this just because a query is being awkward — that's
 *     almost always a sign the RLS policy needs fixing, not bypassing.
 *
 * Required environment variables (get these from your Supabase project's
 * Settings → API page):
 *   SUPABASE_URL               — e.g. https://xxxxx.supabase.co
 *   SUPABASE_ANON_KEY           — the public "anon" key
 *   SUPABASE_SERVICE_ROLE_KEY   — the secret "service_role" key — treat this
 *                                 like a master password; never send it to
 *                                 the browser, never commit it to git.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set (see lib/supabaseClient.js for where to find them).');
}

// A plain anon client, for the handful of operations that genuinely happen
// before any user session exists yet (signing up, requesting a password
// reset email).
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Creates a client scoped to one specific request's user session. Pass the
// raw bearer token from the request's Authorization header. auth.uid() will
// resolve correctly for every query made with the returned client.
function supabaseForRequest(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// The privileged client — see the warning in the file header above.
let _supabaseAdmin = null;
function supabaseAdmin() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — required for admin-only operations (see lib/supabaseClient.js).');
  }
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseAdmin;
}

module.exports = { supabaseAnon, supabaseForRequest, supabaseAdmin };
