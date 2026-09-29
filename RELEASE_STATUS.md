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

---

## Update — 2026-09-29: commission collection is also uncollected

Broader than initially scoped. SUBSCRIPTION_TIERS defines a per-tier
commissionRate (starter 15%, professional 8%, enterprise 3%) applied
to every tenant's order revenue regardless of plan -- this is meant
to be the platform's primary, ongoing revenue source, distinct from
the flat monthly subscription fee.

Confirmed via two independent code reads (/api/admin/stats and
/api/admin/reports, both Supabase and local-driver branches):
commissionOwed is only ever CALCULATED (revenue * commissionRate) and
returned as a display figure on the tenant's own dashboard. It is
never actually collected. Zero references to Stripe's
application_fee_amount exist anywhere in server.js, and the existing
createPaymentIntent calls (order checkout, real Stripe Connect) pass
the full order amount with no fee split -- the tenant's connected
account receives 100% of every real payment. No Stripe Transfer-based
alternative exists either.

Net effect: on every real, successfully processed order today, the
platform collects nothing. commissionOwed is informational only, not
a receivable, not enforced -- for every tenant, on every tier,
including the free starter tier.

### Revised "Real Platform Billing" scope

1. Platform subscription checkout (Starter/Professional/Enterprise --
   note: roadmap originally said "Golden"; actual tier enum in code
   is starter/professional/enterprise, reconcile naming against
   frontend display copy before building Stripe Products).
2. Renewals -- one-time vs. recurring Stripe subscriptions.
3. Commission collection on order revenue (NEW, likely higher
   priority than #1 -- this is the recurring revenue source across
   every tenant, not just paid-tier ones). Architecture choice: Stripe
   application_fee_amount at charge time (automatic, requires
   modifying the existing createPaymentIntent calls) vs. periodic
   reconciliation/invoicing against the already-computed
   commissionOwed figure.
4. Marketplace membership/fees -- define exactly what's purchased;
   connect to the same verified infrastructure, not the card-digit
   mechanism.
5. Payment state machine -- pending -> paid only after verified
   provider confirmation; failed/cancelled/refunded explicit;
   idempotent against duplicate webhooks.
6. Provider choice -- assess platform billing (and commission
   collection) on Hadam's own Stripe account vs. extending Stripe
   Connect; consider PayPal if justified.
7. No access before confirmation -- paid platform features stay
   unavailable until server-verified payment.
8. Testing -- Stripe test mode: success, decline, abandoned checkout,
   duplicate webhook, refund, expiry, renewal, AND commission
   collection/reconciliation scenarios.
