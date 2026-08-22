# Hadam — Real-Time Resend Webhook: Implementation Status

Status as of this session: **code complete and applied, live delivery unverified (paused by choice, not by failure).**

## What was built

1. **`server.js`** — raw request body preserved on `req.rawBody` (needed for signature verification; purely additive, no other route is affected), a new set of helper functions (event timeline storage, suppression list, Svix-style HMAC-SHA256 signature verification, the webhook handler itself), a dispatcher-level interception of `POST /api/webhooks/resend` that runs *before* tenant/host routing (so it works regardless of what domain or tunnel URL the request arrives on), and a change to the existing 20-second fallback check (`scheduleResendDeliveryCheck`) so it defers to a webhook event if one already arrived, instead of logging a second, possibly redundant status.
2. **`lib/email.js`** — a suppression check added to the single shared `sendEmail()` function used by every outbound notification. If a recipient has previously bounced or complained (per a real webhook event), further automated sends to that address are skipped and logged, rather than retried blindly.
3. **Storage** — two small JSON files under `data/`: `email-events.json` (full timeline per Resend email id) and `suppressed-recipients.json` (bounce/complaint suppression list). No new database table was needed.
4. **Wording discipline preserved** — the webhook handler's logging follows the same rule as everything else in this system: Resend's `delivered` event means the *receiving mail server accepted the message*, never "reached the Inbox." `opened`/`clicked` events are logged as engagement signals only, explicitly never treated as customer confirmation.
5. **Customer confirmation clarified, not rebuilt** — the app already has a dedicated `POST /api/orders/:orderId/items/:productId/confirm-receipt` route requiring the customer to be logged in and to deliberately click something in the app. That remains the one and only source of truth for "the customer confirmed receipt." Nothing from the webhook (opens, clicks, or delivered status) ever writes to that.

Patch scripts used (all idempotent, safe to re-run): `apply-resend-webhooks.js`, `apply-resend-webhook-route-fix.js`, `apply-email-suppression-check.js`, `register-resend-webhook.js`.

## What's confirmed working

- Server restarts cleanly with all changes in place (checked twice).
- A real shipped/delivered email test ran after all changes were applied: both emails sent successfully, and the 20-second fallback check reported delivery status exactly as it did before this work — **zero regression** to the existing, working flow.

## What's not yet verified

A real, live webhook event has not yet been observed arriving at the server. Three tunnel options were tried to test this locally, and none worked on the current network:

- **Cloudflare quick tunnel**: failed immediately with `tls: access denied` — something on this network (firewall, antivirus HTTPS inspection, or similar) is interfering with Cloudflare's tunnel protocol specifically.
- **localtunnel (`loca.lt`)**: connected, but was unreliable — a `403 Forbidden` on the first request, then connection failures on every request after. A real email test through it showed no webhook event arriving.
- **serveo.net (SSH tunnel)**: failed immediately — `Network is unreachable` on port 22, meaning outbound SSH is blocked on this network entirely.

The next candidate (ngrok, over standard HTTPS) would very likely have worked, but requires a free account signup, and the user chose to defer this rather than create another account — a reasonable call, and not a code problem.

## What happens next (when ready)

1. Deploy the app to a server with a real public address (this also resolves the tunnel problem entirely — no workaround needed once there's a real domain).
2. Re-run `register-resend-webhook.js` with `TUNNEL_URL` changed to the real production URL. This automatically cleans up the old (currently dead) `loca.lt` registration, creates the new one, and writes the new signing secret into the environment — no manual Resend dashboard work needed.
3. Trigger one real shipped/delivered save and confirm a `[resend-webhook] verified event: ...` line appears in the server log. That's the same test that was set up for today, just pointed at a real URL instead of a tunnel.
4. This is also the natural time to complete the verified-domain / SPF / DKIM / DMARC work described in `deliverability-production-readiness-plan.md` — both share the same "we need a real, public, permanent domain" prerequisite.

## Current harmless loose end

Resend still has a webhook registered pointing at the now-shut-down `loca.lt` URL from today's test. It will just fail silently in the background (visible only in Resend's own dashboard logs, if you happen to look) — it doesn't affect email sending, the 20-second fallback check, or anything else. Step 2 above replaces it; no separate cleanup is required.
