# PayPal Sandbox E2E — evidence model and setup

## Why this document exists

PayPal's Orders API genuinely requires an interactive, PayPal-hosted
buyer-approval redirect before an order can be captured. This is
confirmed directly from PayPal's own API documentation: even when
`payment_source.paypal` is supplied at order-creation time, the response
still comes back with `status: "PAYER_ACTION_REQUIRED"` and an `approve`
link pointing to a real `https://www.sandbox.paypal.com/checkoutnow?...`
page. There is no supported API parameter that bypasses this for a fresh
order.

This means a GitHub Actions workflow — which has no browser, no human,
and no PayPal-authenticated session — cannot complete a real PayPal
checkout on its own. Rather than fake this (mocking the provider, or
using a headless browser to script around PayPal's unversioned,
unsupported hosted UI), this project draws the line explicitly, exactly
where the real capability boundary is.

## The three-tier evidence model

1. **Mocked/offline application tests** (`npm test`, 330+ tests) — proves
   the application's own logic: validation, tenant isolation, state
   machines, webhook-consequence handling (stock, notifications, order
   status) — all using fake data, no network access.

2. **Real PayPal Sandbox API E2E** (`npm run test:paypal:sandbox`, or the
   `PayPal Sandbox E2E` GitHub Actions workflow) — proves the actual
   network integration is genuine: real OAuth, real credential
   acceptance, real order creation against a real merchant, real
   confirmation that the order targets the correct merchant. No mocks.
   This is everything reachable without the interactive approval step.

3. **Manual verification** (occasional, by a person, not CI) — the only
   way to actually exercise buyer approval, capture, webhook delivery,
   and refund confirmation. See "Manual E2E checklist" below.

Automated CI (tiers 1 and 2) proves the API/backend integration
continuously, on every push to `main`. Tier 3 proves the one
provider-hosted interactive boundary that PayPal does not expose as a
supported headless API — and is documented as exactly that, not silently
assumed to be covered by CI.

## One-time manual setup (required before tier 2 can run)

This only needs to be done once, by a person, and then reused indefinitely
by CI:

1. Go to `developer.paypal.com` → **Sandbox** → **Accounts**, or use an
   existing sandbox business account.
2. Complete PayPal's own hosted onboarding for that sandbox account as a
   seller under your Platform app (the same "Partner Referrals" flow the
   application itself uses for real store owners — for this one-time
   setup, you're standing in as that first test seller yourself).
3. Once onboarding shows as complete, note that account's `merchant_id`.
4. Add three **GitHub Actions secrets**, scoped to the
   `paypal-sandbox-e2e` **Environment** (Settings → Environments → New
   environment → name it exactly `paypal-sandbox-e2e`, then add secrets
   there — not as plain repository secrets, so you can optionally require
   manual approval before a run can access them):
   - `PAYPAL_CLIENT_ID` — your Platform app's sandbox client ID
   - `PAYPAL_CLIENT_SECRET` — your Platform app's sandbox client secret
   - `PAYPAL_SANDBOX_MERCHANT_ID` — the merchant_id from step 3

**Never commit these values or paste them into chat, an issue, or a PR.**

## What the automated workflow actually verifies (tier 2)

Every item below is a genuine network call to PayPal's real sandbox —
nothing here is mocked:

- OAuth token acquisition succeeds with the configured credentials
- The Platform app's credentials are genuinely accepted (not just
  well-formed) — a real 401 from PayPal would fail this step
- The pre-onboarded sandbox merchant's real onboarding status is
  fetched and correctly mapped
- A real order is created, routed to that merchant
- The order is read back and confirmed to genuinely target the correct
  `merchant_id` — this is the real, live proof that tenant/merchant
  routing works end-to-end against PayPal's actual API, not just against
  a mock
- The order's status is confirmed to be exactly `PAYER_ACTION_REQUIRED`
  or `CREATED` — the correct, expected state for an order nobody has
  approved yet

## What it deliberately does NOT and cannot cover

- Buyer approval of the order (requires the interactive, PayPal-hosted
  checkout page)
- Capture confirmation
- A real webhook actually being delivered and processed
- A real refund and its webhook confirmation

These all depend on approval happening first, which requires the manual
step below.

## Manual E2E checklist (occasional, not per-push)

To actually exercise the parts CI cannot reach:

1. Run `npm run test:paypal:sandbox` locally (or trigger the GitHub
   Actions workflow) to get a fresh, real sandbox order id printed to
   the log.
2. Open `https://www.sandbox.paypal.com/checkoutnow?token=<that order id>`
   in a browser.
3. Log in with a **sandbox buyer** account (never your real PayPal
   login) and approve the payment.
4. Call `POST /api/orders/paypal/:orderId/capture` against your running
   Hadam instance (with real sandbox credentials configured) to trigger
   the server-side capture.
5. Confirm the real PayPal webhook reaches your server (use the Stripe
   CLI-equivalent for PayPal if needed, or a real configured webhook URL
   in the sandbox app's settings) and that `payments.status` moves
   `pending → paid`.
6. Use the refund endpoint (`POST /api/admin/payments/:paymentId/refund`)
   against this same real payment.
7. Confirm the refund webhook arrives and `payments.status` moves
   `paid → refunded`.

Only once all seven of these have genuinely been observed should the
PayPal integration be considered proven end-to-end, not merely
tested at the code and API levels.
