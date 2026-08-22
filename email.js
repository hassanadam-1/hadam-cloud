/**
 * Real email delivery via Resend (https://resend.com).
 *
 * Requires two environment variables:
 *   RESEND_API_KEY — from https://resend.com/api-keys
 *   FROM_EMAIL     — the sender address. Until you verify your own domain
 *                     with Resend, this MUST be "onboarding@resend.dev" —
 *                     and emails will only actually deliver to the same
 *                     address you used to sign up for your Resend account
 *                     (a Resend sandbox restriction, not a bug here). Once
 *                     you verify a real domain, set this to an address on
 *                     that domain (e.g. "orders@yourstore.com") and it'll
 *                     deliver to any real recipient.
 *
 * If these aren't set, sendEmail() logs a clear warning and does nothing —
 * it never throws, so a missing/misconfigured email setup can't break
 * checkout or any other flow that tries to send a notice.
 */

let warnedOnce = false;

async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) {
    if (!warnedOnce) {
      console.warn('[email] RESEND_API_KEY and/or FROM_EMAIL not set — real email delivery is disabled. Notifications are still logged in the app\'s own notification history.');
      warnedOnce = true;
    }
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[email] Resend API error:', res.status, data.message || JSON.stringify(data));
      return { sent: false, reason: data.message || `HTTP ${res.status}` };
    }
    return { sent: true, id: data.id };
  } catch (e) {
    console.error('[email] Failed to reach Resend:', e.message);
    return { sent: false, reason: e.message };
  }
}

module.exports = { sendEmail };
