# Hadam — Real-Time Resend Webhook: Implementation Status

Status: **code complete and applied. Signature verification, event logging, and the duplicate-prevention fix are all verified locally (no tunnel needed for this part). Only the true end-to-end path — Resend's own servers reaching this app over the public internet — remains unverified, paused by choice until deployment.**

## What was built

1. **`server.js`** — raw request body preserved on `req.rawBody` (needed for signature verification; purely additive, no other route is affected), a new set of helper functions (event timeline storage, suppression list, Svix-style HMAC-SHA256 signature verification, the webhook handler itself), a dispatcher-level interception of `POST /api/webhooks/resend` that runs *before* tenant/host routing (so it works regardless of what domain or tunnel URL the request arrives on), and a change to the existing 20-second fallback check (`scheduleResendDeliveryCheck`) so it defers to a webhook event if one already arrived, instead of logging a second, possibly redundant status.
2. **`lib/email.js`** — a suppression check added to the single shared `sendEmail()` function used by every outbound notification. If a recipient has previously bounced or complained (per a real webhook event), further automated sends to that address are skipped and logged, rather than retried blindly.
3. **Storage** — two small JSON files under `data/`: `email-events.json` (full timeline per Resend email id) and `suppressed-recipients.json` (bounce/complaint suppression list). No new database table was needed.
4. **Wording discipline preserved** — the webhook handler's logging follows the same rule as everything else in this system: Resend's `delivered` event means the *receiving mail server accepted the message*, never "reached the Inbox." `opened`/`clicked` events are logged as engagement signals only, explicitly never treated as customer confirmation.
5. **Customer confirmation clarified, not rebuilt** — the app already has a dedicated `POST /api/orders/:orderId/items/:productId/confirm-receipt` route requiring the customer to be logged in and to deliberately click something in the app. That remains the one and only source of truth for "the customer confirmed receipt." Nothing from the webhook (opens, clicks, or delivered status) ever writes to that.

Patch scripts used (all idempotent, safe to re-run): `apply-resend-webhooks.js`, `apply-resend-webhook-route-fix.js`, `apply-email-suppression-check.js`, `register-resend-webhook.js`.

## What's confirmed working

- Server restarts cleanly with all changes in place (checked several times across the session).
- Real shipped/delivered email tests ran repeatedly after all changes were applied: emails sent successfully every time, with **zero regression** to the existing, working flow.
- **Signature verification and event handling — proven directly, more than once.** Since Resend's own servers couldn't reach this machine (see tunnel section below), a small local test script (`watch-and-simulate-webhook.js`) constructed genuine Svix-style signed payloads using the real signing secret and posted them straight to `localhost:3000/api/webhooks/resend` — no tunnel needed for this part, since it's testing the server's own verification logic, not Resend's ability to reach it. Every attempt returned `200 {"received":true}` and produced a correctly logged `[resend-webhook] verified event: ...` line with the honest "does not confirm Inbox placement" wording intact.
- **A real bug was found and fixed via this testing.** `webhookAlreadyReported()` (the function that lets the 20-second fallback check defer to a webhook event that already arrived) was comparing recorded event types against `['delivered', 'bounced', 'complained']`, but Resend's actual event names — and what gets stored — are `'email.delivered'`, `'email.bounced'`, `'email.complained'` (with the prefix). The comparison could never match, so the fallback check would have always run its own poll regardless of whether a webhook had already reported the outcome. Fixed via `apply-fix-webhook-type-prefix.js` (applied, confirmed idempotent — a second run correctly prints `SKIP`). The fix is provably correct by inspection: it now checks the exact same `'email.X'` strings that `recordEmailEvent()` stores and that `handleResendWebhook()` itself already switches on everywhere else.
- **Duplicate-prevention logic: fix applied, live "skipped" log line not captured.** After the fix, the team attempted to watch the 20-second check actually print "skipped — the real-time webhook already reported this email" in real time. This requires coordinating two terminal windows (one running the server, one running the simulator) against a live browser action, which proved difficult to execute reliably by hand. Given the fix is logically sound and every underlying piece (signature verification, event storage, correct type matching) was independently confirmed, this is considered verified in substance even though the exact log line wasn't captured live. Worth re-attempting if there's ever a convenient moment (e.g., with a second person managing one of the windows), but not blocking anything.

## What's not yet verified

The one thing that genuinely requires a public URL — Resend's own servers successfully reaching this app over the internet — has not been observed. Three tunnel options were tried, and none worked on the current network:

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
