# Release status — 2026-09-28

## Security / payment-integrity gate: CLOSED

- Simulated/test-card payment bypass is now fail-closed in production.
  ALLOW_SIMULATED_PAYMENTS defaults off; nine call sites across
  server.js require it explicitly. Render production has the flag
  absent (confirmed directly in Render's environment-variable list).
  (commit 7e3739f)
- Stale duplicate-store test fixed to match the actual, deliberately
  implemented 5-store self-service limit (409 was never reachable
  code; test predated the feature). Full suite: 329/330, one
  pre-existing, unrelated failure remaining (see below). (commit fa01ff2)
- config.yml classified: empty {}, no security concern.
- Audited every write to payment_status/order status in server.js
  for client-controlled paths to a paid state. Cash/bank-transfer
  confirmation is staff-only (admin/employee), atomic, tenant-isolated.
  Stripe and PayPal webhooks require signature verification before
  any processing; succeeded is derived from the verified event only.
  No additional bypass found.
- ALLOW_SIMULATED_PAYMENTS is being KEPT (not removed) for isolated
  automated QA (tests/run.js opts in explicitly). It must never be set
  in production.

## Platform billing: OUTSTANDING PRE-LAUNCH BLOCKER

Tenant -> customer payments (order checkout) have real, verified
Stripe Connect + PayPal integration -- solid, unaffected by tonight's
work.

Hadam -> platform billing (subscription plans, store renewal,
marketplace membership fees) has NO real payment collection path.
Before tonight's fix, the simulated-card check accepted any non-zero
card number as "paid" for these flows -- this was never real revenue
collection, for anyone. The fix correctly closes that free-access
hole, but since it was the only mechanism, platform billing is now
correctly non-functional rather than insecurely functional. Do NOT
re-enable ALLOW_SIMULATED_PAYMENTS in production to work around this.

### Next engineering thread: "Real Platform Billing"

Architecture to be decided before implementation. Scope:

1. Platform subscription checkout (Starter/Professional/Golden/etc.)
   -- real Stripe flow; success creates/extends subscription; failure
   grants nothing.
2. Renewals -- one-time vs. recurring Stripe subscriptions; handle
   success, failure, cancellation, expiry, refunds.
3. Marketplace membership/fees -- define what's purchased; connect to
   the same verified infrastructure, not the card-digit mechanism.
4. Payment state machine -- pending -> paid only after verified
   provider confirmation; failed/cancelled/refunded explicit;
   idempotent against duplicate webhooks.
5. Provider choice -- assess platform billing on Hadam's own Stripe
   account vs. Stripe Connect; consider PayPal if justified.
6. No access before confirmation -- paid platform features stay
   unavailable until server-verified payment.
7. Testing -- Stripe test mode: success, decline, abandoned checkout,
   duplicate webhook, refund, expiry, renewal.

## Known, non-blocking issues (pre-existing, unrelated to tonight)

- deleteTenantBtn missing from I18N.en entirely (public-platform/app.js)
  -- renders English in every language for this one key.

## Housekeeping (not blocking, noted for later cleanup)

- hadam-cloud/ -- stale extracted copy of the whole app, gitignored,
  ~1300 lines behind current server.js. Not in the deploy path
  (Render deploys via git push). Safe to delete when convenient.
- create-store-handler-FINAL.js, fix-simulated-payments.py,
  fix-test-bootstrap.py, fix-duplicate-store-test.py,
  tests/run.js.bak-simpayfix-* -- local scratch/tooling artifacts
  from tonight's session, untracked, not committed.
