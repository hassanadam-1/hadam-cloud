/**
 * Authentication audit logging — a best-effort record of every
 * security-relevant event, for monitoring and compliance. Logging a call
 * failing must never block the actual auth action it's describing; every
 * write here is wrapped so a database hiccup here can't turn into a broken
 * login, password reset, or MFA flow for a real user.
 *
 * supabaseClient is required lazily, inside the function below, rather
 * than at the top of this file — requiring it eagerly would throw at
 * server startup whenever the local/file driver is in use, since that
 * mode never sets SUPABASE_URL/SUPABASE_ANON_KEY at all. This module is
 * only ever meaningfully called when AUTH_DRIVER === 'supabase'.
 */

/**
 * Pulls a best-effort client IP and user-agent from a request object.
 * Works whether called from a route handler (has req.headers) or a
 * lower-level auth function that only has the header values directly.
 */
function extractRequestContext(req) {
  if (!req) return { ipAddress: null, userAgent: null };
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  const ipAddress = (forwarded ? forwarded.split(',')[0].trim() : null) || (req.socket && req.socket.remoteAddress) || null;
  const userAgent = (req.headers && req.headers['user-agent']) || null;
  return { ipAddress, userAgent };
}

/**
 * Records one audit event. All fields except eventType are optional —
 * many events (a failed login against a nonexistent email, for instance)
 * genuinely have no userId or tenantId to attach.
 */
async function logAuthEvent({ tenantId = null, userId = null, email = null, eventType, outcome = 'success', req = null, details = {} }) {
  try {
    const { supabaseAdmin } = require('./supabaseClient');
    const { ipAddress, userAgent } = extractRequestContext(req);
    const admin = supabaseAdmin();
    const { error } = await admin.from('auth_audit_log').insert({
      tenant_id: tenantId, user_id: userId, email, event_type: eventType, outcome,
      ip_address: ipAddress, user_agent: userAgent, details,
    });
    if (error) console.error('[audit-log] insert failed:', error.message);
  } catch (e) {
    // Never let a logging failure (e.g. service role key not configured in
    // this environment) interrupt the actual authentication flow it's
    // describing — this is best-effort observability, not a gate.
    console.error('[audit-log] failed:', e.message);
  }
}

module.exports = { logAuthEvent };
