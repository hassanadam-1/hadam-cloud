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
const { supabaseAnon, supabaseForRequest, supabaseAdmin, freshAnonClient } = require('./supabaseClient');
const crypto = require('crypto');
const { sendEmail, wrapEmailHtml, EMAIL_I18N, emailT } = require('./email');

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

/**
 * Log in with an existing email/password. If the account has a verified MFA
 * factor enrolled, this does NOT return a usable session — it returns a
 * short-lived, aal1-only token good only for completing the MFA challenge
 * (see createMfaLoginChallenge/verifyMfaLoginChallenge below). The frontend
 * must treat mfaRequired:true as "not logged in yet."
 */
async function login(email, password) {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error) {
    if (/email not confirmed/i.test(error.message)) throw new Error('Please check your email and confirm your account before logging in.');
    throw new Error('Incorrect email or password.'); // deliberately vague otherwise — don't reveal whether the email exists or the password was wrong
  }
  const client = supabaseForRequest(data.session.access_token);
  const { data: factorsData, error: factorsErr } = await client.auth.mfa.listFactors();
  if (factorsErr) throw new Error(factorsErr.message);
  const verifiedTotp = (factorsData.totp || []).find(f => f.status === 'verified');
  const { data: emailOtpRow } = await client.from('mfa_email_otp_settings').select('enabled').eq('user_id', data.user.id).maybeSingle();
  const emailOtpEnabled = !!(emailOtpRow && emailOtpRow.enabled);
  const hasBackupCodes = (verifiedTotp || emailOtpEnabled) ? await userHasUnusedBackupCodes(data.user.id) : false;
  if (verifiedTotp || emailOtpEnabled) {
    const methods = [];
    if (verifiedTotp) methods.push('totp');
    if (emailOtpEnabled) methods.push('email');
    if (hasBackupCodes) methods.push('backup');
    return { user: data.user, session: null, mfaRequired: true, factorId: verifiedTotp ? verifiedTotp.id : null, tempToken: data.session.access_token, methods };
  }
  return { user: data.user, session: data.session, mfaRequired: false };
}

/** Starts an MFA challenge for a factor, using the temporary aal1 token from login(). */
async function createMfaLoginChallenge(tempToken, factorId) {
  const client = supabaseForRequest(tempToken);
  const { data, error } = await client.auth.mfa.challenge({ factorId });
  if (error) throw new Error(error.message);
  return data.id;
}

/** Verifies the code the user entered and, on success, returns a real, full (aal2) session. */
async function verifyMfaLoginChallenge(tempToken, factorId, challengeId, code) {
  const client = supabaseForRequest(tempToken);
  const { data, error } = await client.auth.mfa.verify({ factorId, challengeId, code });
  if (error) throw new Error(error.message);
  // Confirmed via live testing: the session fields (access_token,
  // refresh_token, expires_at, etc.) come back flat on `data` itself here,
  // not nested under a `data.session` object the way other auth calls in
  // this codebase return them.
  const session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, expires_in: data.expires_in, token_type: data.token_type };
  return { user: data.user, session };
}

/** Begins enrolling a new TOTP factor for an already-logged-in user. Returns the QR code and secret to show them. */
async function enrollMfaFactor(accessToken) {
  const client = supabaseForRequest(accessToken);
  // Clean up any unverified factors left over from an earlier attempt that
  // was never completed (e.g. the user closed the enrollment screen before
  // entering a code) — otherwise Supabase rejects a fresh enrollment with
  // "a factor with the friendly name ... already exists," permanently
  // blocking the user from ever trying again.
  const { data: existing, error: listErr } = await client.auth.mfa.listFactors();
  if (listErr) throw new Error(`Could not check existing MFA factors: ${listErr.message}`);
  for (const f of (existing?.totp || [])) {
    if (f.status === 'unverified') {
      const { error: unenrollErr } = await client.auth.mfa.unenroll({ factorId: f.id });
      if (unenrollErr) throw new Error(`Could not remove a previous unfinished enrollment attempt: ${unenrollErr.message}`);
    }
  }
  const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'Hadam Store' });
  if (error) throw new Error(error.message);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

/** Confirms enrollment with a code from the user's authenticator app — the factor isn't active until this succeeds. */
async function verifyMfaEnrollment(accessToken, factorId, code) {
  const client = supabaseForRequest(accessToken);
  const { data: challenge, error: challengeErr } = await client.auth.mfa.challenge({ factorId });
  if (challengeErr) throw new Error(challengeErr.message);
  const { error: verifyErr } = await client.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (verifyErr) throw new Error('Incorrect verification code — please check your authenticator app and try again.');
}

/** Lists this user's enrolled MFA factors (to show status in account settings). */
async function listMfaFactors(accessToken) {
  const client = supabaseForRequest(accessToken);
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return data.totp || [];
}

/** Removes an MFA factor — requires the user's current session (already-authenticated), not their password again. */
async function unenrollMfaFactor(accessToken, factorId) {
  const client = supabaseForRequest(accessToken);
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
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
/**
 * Checks whether a proposed new password is actually the same as the
 * user's CURRENT password — before any MFA code has been requested or
 * shown, so this rejection never gets tangled up with the code step at
 * all. There's no way to compare against a hashed password directly, so
 * this works by attempting a real sign-in with the proposed password: if
 * it succeeds, that password IS the current one. Any resulting session
 * from a successful check is immediately discarded — this function only
 * ever returns true/false, never a usable session.
 */
async function isPasswordSameAsCurrent(recoveryAccessToken, proposedPassword) {
  const client = supabaseForRequest(recoveryAccessToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error('Your session has expired — please request a new recovery link.');
  // A fresh, throwaway client for this specific check — NOT the shared
  // module-level supabaseAnon singleton. Signing in and out mutates a
  // client's own session state, and supabaseAnon is reused across every
  // concurrent request the server handles; doing that on the shared
  // instance risks one request's check interfering with another's, which
  // is exactly the kind of bug that produces a confusing "Auth session
  // missing!" error somewhere else entirely unrelated.
  const checkClient = freshAnonClient();
  const { data: signInData, error: signInErr } = await checkClient.auth.signInWithPassword({ email: userData.user.email, password: proposedPassword });
  if (signInErr) return false; // wrong password against the current one — i.e. genuinely different, which is what we want
  if (signInData.session) await checkClient.auth.signOut();
  return true;
}

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

/** Turns Email OTP on/off as an MFA method for the currently authenticated user (their own account only, enforced by RLS). */
async function toggleEmailOtpMfa(accessToken, enabled) {
  const client = supabaseForRequest(accessToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const { error } = await client.from('mfa_email_otp_settings').upsert({ user_id: userData.user.id, enabled: !!enabled });
  if (error) throw new Error(error.message);
}

/** Whether the currently authenticated user has Email OTP enabled. */
async function getEmailOtpMfaStatus(accessToken) {
  const client = supabaseForRequest(accessToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const { data } = await client.from('mfa_email_otp_settings').select('enabled').eq('user_id', userData.user.id).maybeSingle();
  return !!(data && data.enabled);
}

function hashOtpCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/** Generates and emails a 6-digit code during login — tempToken is the aal1 session from login(), used only to identify who's requesting it. */
async function requestEmailOtp(tempToken, lang = 'en') {
  const client = supabaseForRequest(tempToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error('Your session has expired — please log in again.');
  const admin = supabaseAdmin();
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes — short-lived, same principle as a password-reset link
  const { error } = await admin.from('mfa_email_otp_codes').insert({ user_id: userData.user.id, code_hash: hashOtpCode(code), expires_at: expiresAt });
  if (error) throw new Error(error.message);
  const subject = emailT(EMAIL_I18N, 'verificationCodeSubject', lang);
  const text = EMAIL_I18N[lang] ? EMAIL_I18N[lang].verificationCodeBody(code) : EMAIL_I18N.en.verificationCodeBody(code);
  const result = await sendEmail({ to: userData.user.email, subject, text, html: wrapEmailHtml(text, lang) });
  if (!result.sent) {
    // Every other email in this app is genuinely best-effort — a failed
    // delivery reminder or receipt shouldn't block checkout or any other
    // flow. This one is different: the code is the ONLY way this login
    // can complete, so silently pretending it was sent (the old behavior)
    // left the person stuck with no code and no explanation. Surface it.
    throw new Error(result.reason === 'not_configured'
      ? 'Email delivery is not currently set up for this store — please use another verification method (authenticator app or backup code).'
      : `Could not send the verification code email (${result.reason}). Please try another verification method.`);
  }
}

/** Verifies a submitted code and, on success, returns a real session — same response shape as verifyMfaLoginChallenge. */
async function verifyEmailOtp(tempToken, code) {
  const client = supabaseForRequest(tempToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error('Your session has expired — please log in again.');
  const admin = supabaseAdmin();
  // Checks every unused, unexpired code for this user — not just the most
  // recently requested one. If the user clicked "resend" or retried and
  // ended up with more than one valid code outstanding, whichever one
  // they actually have in their inbox should still work; each code is
  // still single-use and time-limited on its own, so this doesn't weaken
  // security, it just stops an older-but-still-good code from being
  // wrongly rejected as if it had expired.
  const { data: candidates, error: findErr } = await admin.from('mfa_email_otp_codes').select('*').eq('user_id', userData.user.id).eq('used', false).order('created_at', { ascending: false });
  if (findErr) throw new Error(findErr.message);
  const now = Date.now();
  const unexpired = (candidates || []).filter(c => new Date(c.expires_at).getTime() >= now);
  if (!candidates || candidates.length === 0) throw new Error('No verification code was requested, or it has already been used — request a new one.');
  if (unexpired.length === 0) throw new Error('This code has expired — request a new one.');
  const recent = unexpired.find(c => c.code_hash === hashOtpCode(String(code).trim()));
  if (!recent) throw new Error('Incorrect verification code.');
  await admin.from('mfa_email_otp_codes').update({ used: true }).eq('id', recent.id);
  // The aal1 session from login() is already a real, valid Supabase session
  // for this user — our own app's MFA requirement is enforced at the
  // application level (this check), not via Supabase's own aal2 RLS
  // gating, so completing this check is sufficient to consider login done.
  // tempToken itself IS the valid access token — client.auth.getSession()
  // would incorrectly return null here, since supabaseForRequest() only
  // sets a bearer header for API calls and never actually populates the
  // client library's own internal session state (persistSession: false).
  return { user: userData.user, session: { access_token: tempToken } };
}

function generateBackupCode() {
  // 10-character alphanumeric, excluding visually ambiguous characters (0/O, 1/I/l).
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[crypto.randomInt(0, chars.length)];
  return code.slice(0, 5) + '-' + code.slice(5);
}
function hashBackupCode(code) {
  return crypto.createHash('sha256').update(code.replace(/-/g, '').toUpperCase()).digest('hex');
}

/** Generates a fresh set of 10 backup codes for the currently authenticated user, invalidating any previous set. Returns the plain codes ONCE — they can never be retrieved again after this call. */
async function generateBackupCodes(accessToken) {
  const client = supabaseForRequest(accessToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const admin = supabaseAdmin();
  // Regenerating always fully replaces the set — no lingering codes from a
  // previous batch remain valid, so a leaked old code can't be used later.
  await admin.from('mfa_backup_codes').delete().eq('user_id', userData.user.id);
  const codes = Array.from({ length: 10 }, generateBackupCode);
  const rows = codes.map(code => ({ user_id: userData.user.id, code_hash: hashBackupCode(code) }));
  const { error } = await admin.from('mfa_backup_codes').insert(rows);
  if (error) throw new Error(error.message);
  return codes;
}

/** How many unused backup codes remain for the currently authenticated user. */
async function getBackupCodeStatus(accessToken) {
  const client = supabaseForRequest(accessToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const admin = supabaseAdmin();
  const { count, error } = await admin.from('mfa_backup_codes').select('id', { count: 'exact', head: true }).eq('user_id', userData.user.id).eq('used', false);
  if (error) throw new Error(error.message);
  return count || 0;
}

/** Whether the given user (by id) has any unused backup codes — used during login, before the user has a usable session of their own yet. */
async function userHasUnusedBackupCodes(userId) {
  const admin = supabaseAdmin();
  const { count } = await admin.from('mfa_backup_codes').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('used', false);
  return (count || 0) > 0;
}

/** Verifies a backup code during login (tempToken) and, on success, returns a real session — same response shape as verifyMfaLoginChallenge / verifyEmailOtp. Consumes the code (single use). */
async function verifyBackupCodeLogin(tempToken, code) {
  const client = supabaseForRequest(tempToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error('Your session has expired — please log in again.');
  const admin = supabaseAdmin();
  const { data: candidates, error: findErr } = await admin.from('mfa_backup_codes').select('*').eq('user_id', userData.user.id).eq('used', false);
  if (findErr) throw new Error(findErr.message);
  const match = (candidates || []).find(c => c.code_hash === hashBackupCode(code));
  if (!match) throw new Error('Incorrect or already-used backup code.');
  await admin.from('mfa_backup_codes').update({ used: true, used_at: new Date().toISOString() }).eq('id', match.id);
  // Same fix as verifyEmailOtp — tempToken itself IS the valid access
  // token; client.auth.getSession() incorrectly returns null since
  // supabaseForRequest() never populates the client's internal session.
  return { user: userData.user, session: { access_token: tempToken } };
}

/** For password recovery via Email OTP: verifies the code and, if valid, sets the new password directly via the admin API — same reasoning as resetPasswordWithBackupCode, since Email OTP is also our own table, not a Supabase-native factor that can satisfy the client-side aal2 check. */
/** Step 1 of password recovery via Email OTP: verifies the code and marks the user's recovery session as MFA-confirmed for a few minutes, WITHOUT touching the password at all. Splitting this from the actual password change means a password rejection (e.g. "same as current") is clearly a problem with the password field, not the code — the code is already spent and doesn't need re-entering either way. */
async function verifyEmailOtpForRecovery(recoveryAccessToken, code) {
  const client = supabaseForRequest(recoveryAccessToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error('Your session has expired — please request a new recovery link.');
  const admin = supabaseAdmin();
  const { data: candidates, error: findErr } = await admin.from('mfa_email_otp_codes').select('*').eq('user_id', userData.user.id).eq('used', false).order('created_at', { ascending: false });
  if (findErr) throw new Error(findErr.message);
  const now = Date.now();
  const unexpired = (candidates || []).filter(c => new Date(c.expires_at).getTime() >= now);
  if (!candidates || candidates.length === 0) throw new Error('No verification code was requested, or it has already been used — request a new one.');
  if (unexpired.length === 0) throw new Error('This code has expired — request a new one.');
  const match = unexpired.find(c => c.code_hash === hashOtpCode(String(code).trim()));
  if (!match) throw new Error('Incorrect verification code.');
  await admin.from('mfa_email_otp_codes').update({ used: true }).eq('id', match.id);
  await admin.from('recovery_mfa_verified').upsert({ user_id: userData.user.id, verified_at: new Date().toISOString() });
}

/** Step 2: sets the new password, requiring that step 1 completed recently (within 10 minutes) for this same user — a genuine substitute for re-entering the code, not a bypass of the MFA requirement. */
async function setPasswordAfterVerifiedRecovery(recoveryAccessToken, newPassword) {
  const client = supabaseForRequest(recoveryAccessToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error('Your session has expired — please request a new recovery link.');
  const admin = supabaseAdmin();
  const { data: verification } = await admin.from('recovery_mfa_verified').select('verified_at').eq('user_id', userData.user.id).maybeSingle();
  const verifiedRecently = verification && (Date.now() - new Date(verification.verified_at).getTime()) < 10 * 60 * 1000;
  if (!verifiedRecently) throw new Error('Your verification has expired — please verify your code again.');
  const { error: updateErr } = await admin.auth.admin.updateUserById(userData.user.id, { password: newPassword });
  if (updateErr) throw new Error(updateErr.message); // no mention of "code" here at all — this really is just a password-field problem now
  await admin.from('recovery_mfa_verified').delete().eq('user_id', userData.user.id);
  return { id: userData.user.id, email: userData.user.email };
}
/** For password recovery via backup code: verifies the code and, if valid, sets the new password directly via the admin API. Backup codes are our own table, not a Supabase-native MFA factor, so they can't satisfy Supabase's client-side aal2 check the way completing a TOTP/email challenge does — this bypasses that entirely via a trusted server-side action instead, which is the correct place for it since the code itself was the verification. */
/** Step 1 of password recovery via backup code: verifies and consumes the code, marking the recovery session as MFA-confirmed. Same split-into-two-steps reasoning as the Email OTP path above. */
async function verifyBackupCodeForRecovery(recoveryAccessToken, code) {
  const client = supabaseForRequest(recoveryAccessToken);
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error('Your session has expired — please request a new recovery link.');
  const admin = supabaseAdmin();
  const { data: candidates, error: findErr } = await admin.from('mfa_backup_codes').select('*').eq('user_id', userData.user.id).eq('used', false);
  if (findErr) throw new Error(findErr.message);
  const match = (candidates || []).find(c => c.code_hash === hashBackupCode(code));
  if (!match) throw new Error('Incorrect or already-used backup code.');
  await admin.from('mfa_backup_codes').update({ used: true, used_at: new Date().toISOString() }).eq('id', match.id);
  await admin.from('recovery_mfa_verified').upsert({ user_id: userData.user.id, verified_at: new Date().toISOString() });
}

/** Admin-assisted MFA reset — removes every MFA method (TOTP factors, Email OTP, backup codes) for a user, all at once. This is the true last-resort recovery path: for when someone has lost their authenticator device AND their backup codes together, with no self-service path left. Callable only by a tenant's own admin (for their own staff/clients) or a superadmin (for anyone) — enforced by the calling route, not here. */
async function adminResetAllMfaForUser(userId) {
  const admin = supabaseAdmin();
  const { data: factorsData, error: factorsErr } = await admin.auth.admin.mfa.listFactors({ userId });
  if (factorsErr) throw new Error(factorsErr.message);
  for (const factor of (factorsData.factors || [])) {
    await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
  }
  await admin.from('mfa_email_otp_settings').update({ enabled: false }).eq('user_id', userId);
  await admin.from('mfa_backup_codes').delete().eq('user_id', userId);
}

module.exports = {
  register, login, getUserFromToken, getMembership, isSuperadmin, getProfile,
  joinTenant, requestPasswordReset, updatePassword, deleteAccount,
  createMfaLoginChallenge, verifyMfaLoginChallenge, enrollMfaFactor, verifyMfaEnrollment, listMfaFactors, unenrollMfaFactor,
  toggleEmailOtpMfa, getEmailOtpMfaStatus, requestEmailOtp, verifyEmailOtp,
  generateBackupCodes, getBackupCodeStatus, verifyBackupCodeLogin,
  verifyBackupCodeForRecovery, verifyEmailOtpForRecovery, setPasswordAfterVerifiedRecovery, isPasswordSameAsCurrent,
  adminResetAllMfaForUser,
};
