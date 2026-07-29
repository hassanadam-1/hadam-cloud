/**
 * Supabase Auth functions — REFERENCE CODE, NOT TESTED AGAINST A LIVE
 * PROJECT. This replaces server.js's old hashPassword/signToken/verifyToken
 * and the custom login/register/forgot-password routes.
 *
 * Deliberately kept separate from server.js for now, rather than merged in
 * directly — this is the biggest, most security-sensitive change in the
 * whole migration, and it deserves to be tested on its own, with your real
 * project, before anything else in server.js depends on it.
 */
const { supabaseAnon, supabaseForRequest, supabaseAdmin } = require('./supabaseClient');

/**
 * Create a new Hadam-wide identity. This does NOT give them a role at any
 * particular store — that's a separate step (see joinTenant below), since
 * one identity can hold different roles at different stores.
 */
async function register(email, password, fullName) {
  const { data, error } = await supabaseAnon.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw new Error(error.message);
  // data.session may be null here if your Supabase project has "confirm
  // email" turned on — in that case there's no access_token until the user
  // clicks the confirmation link. Worth deciding deliberately (Auth →
  // Providers → Email → "Confirm email" toggle) rather than being surprised
  // by it during testing.
  return { user: data.user, session: data.session };
}

/** Log in with an existing email/password. */
async function login(email, password) {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Incorrect email or password.'); // deliberately vague, same as the old system — don't reveal which part was wrong
  return { user: data.user, session: data.session };
}

/**
 * Verifies a bearer token from a request's Authorization header and
 * returns the user it belongs to. This replaces the old verifyToken().
 * Throws if the token is missing, expired, or invalid.
 */
async function getUserFromToken(accessToken) {
  if (!accessToken) throw new Error('No token provided.');
  const { data, error } = await supabaseAnon.auth.getUser(accessToken); // pass the token explicitly — the documented, stateless way to verify it server-side, rather than relying on a client session that a bare bearer token doesn't establish
  if (error || !data.user) throw new Error('Invalid or expired session.');
  return data.user;
}

/**
 * Looks up what role (if any) this user holds at a specific tenant. Returns
 * null if they have no membership there at all (not a customer, not staff).
 * This replaces the old JWT-embedded {role, tenantId} claims — role is now
 * looked up per request, per tenant, rather than baked into the token,
 * since the same person can be a different role at a different store.
 */
async function getMembership(accessToken, tenantId) {
  const client = supabaseForRequest(accessToken);
  const { data: userData, error: userErr } = await client.auth.getUser(accessToken);
  if (userErr || !userData.user) throw new Error('Invalid or expired session.');
  const { data, error } = await client
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.role : null;
}

/** Checks the is_superadmin flag on the user's profile row. */
async function isSuperadmin(accessToken) {
  const client = supabaseForRequest(accessToken);
  const { data: userData, error: userErr } = await client.auth.getUser(accessToken);
  if (userErr || !userData.user) throw new Error('Invalid or expired session.');
  const { data, error } = await client.from('profiles').select('is_superadmin').eq('id', userData.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return !!(data && data.is_superadmin);
}

/**
 * Registers a membership — either a client self-registering at a store, or
 * (during store creation) the founding admin claiming their own new store.
 * The RLS policies in schema.sql (self_service_founding_admin,
 * admin_manages_memberships) are what actually decide whether this is
 * allowed — this function doesn't duplicate that logic, it just calls the
 * insert and lets the database enforce the real rule.
 */
async function joinTenant(accessToken, tenantId, role) {
  const client = supabaseForRequest(accessToken);
  const { data: userData } = await client.auth.getUser();
  const { data, error } = await client
    .from('tenant_memberships')
    .insert({ user_id: userData.user.id, tenant_id: tenantId, role })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Sends a password-reset email via Supabase's own built-in recovery flow. */
async function requestPasswordReset(email, redirectTo) {
  const { error } = await supabaseAnon.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
  // Always returns success regardless of whether the email exists, same as
  // the old system — so this can never be used to check who has an account.
}

/** Changes the logged-in user's own password (they must already have a valid session). */
async function updatePassword(accessToken, newPassword) {
  // Verify who this actually is first (the same check that already works for
  // getUserFromToken), then use admin privileges to update THAT SPECIFIC
  // verified user's password — never anyone else's. This avoids relying on
  // supabase-js's client-side session state, which updateUser() needs but
  // a plain bearer token alone doesn't establish.
  const user = await getUserFromToken(accessToken);
  const { error } = await supabaseAdmin().auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) throw new Error(error.message);
}

/**
 * Permanently deletes a Supabase Auth account. Requires the service_role
 * key — deleting a user outright is an admin-level Auth API operation, not
 * something a normal user token is allowed to do to itself directly.
 * profiles/tenant_memberships rows cascade-delete automatically (see the
 * `on delete cascade` in schema.sql).
 */
async function deleteAccount(userId) {
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

/** Fetches this user's profile row (full_name, is_superadmin) in one call, to build a consistent user object for server.js. */
async function getProfile(accessToken) {
  const client = supabaseForRequest(accessToken);
  const { data: userData, error: userErr } = await client.auth.getUser(accessToken);
  if (userErr || !userData.user) throw new Error('Invalid or expired session.');
  const { data, error } = await client.from('profiles').select('full_name, is_superadmin').eq('id', userData.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return data || { full_name: null, is_superadmin: false };
}

module.exports = {
  register, login, getUserFromToken, getMembership, isSuperadmin, getProfile,
  joinTenant, requestPasswordReset, updatePassword, deleteAccount,
};
