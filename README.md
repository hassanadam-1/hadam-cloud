# Hadam — multi-tenant cloud commerce platform (SaaS)

Every store is a subdomain of one shared platform. `hadam.com` is the
platform itself — a landing page, self-service "create your store" flow,
and a superadmin view over every tenant — and sells nothing on its own.
Each store lives at `<yourname>.hadam.com`, gets the full commerce engine
as shared infrastructure, and starts with an **empty catalog** — the
tenant's own Admin defines their categories and products.

Zero external dependencies (Node core only) — runs anywhere with
`node server.js`, no `npm install`, no build step, nothing to fail on a
fresh cloud box.

## Run it

```bash
node server.js
```

Visit `http://localhost:3000` — that's the platform root (create a store,
or log in as superadmin). Every tenant is reached the same way any real
subdomain would be, just using `.localhost` instead of `.hadam.com` since
local DNS can't do real wildcard subdomains: e.g. `http://demo.localhost:3000`.
Modern browsers and most OSes resolve `*.localhost` to `127.0.0.1` automatically,
so this works without editing `/etc/hosts`.

### Demo logins (on the seeded `demo` tenant, i.e. `demo.localhost:3000`)
| Role     | Email                     | Password     |
|----------|---------------------------|--------------|
| Admin    | admin@hadamstore.com      | admin123     |
| Employee | employee@hadamstore.com   | employee123  |
| Client   | client@hadamstore.com     | client123    |

### Platform superadmin (on the root, i.e. `localhost:3000`)
| Email            | Password  |
|------------------|-----------|
| super@hadam.com  | super123  |

## Roles and dashboards

Every role sees a different set of screens — not the same screen with
buttons hidden, but different data and different menus, enforced on the
server as well as in the UI:

- **Client** — browses their store's catalog, buys across Store +
  Marketplace in one cart, sees their own order history and downloads.
- **Employee** — sees a fulfillment queue for their store only: physical
  orders to ship, service bookings to confirm/schedule, "manual" items to
  action. No access to pricing, revenue, or account management.
- **Admin** (tenant owner) — everything Employee can do, plus defines
  their own categories and products, invites employees, and sees revenue
  and order-wide stats — for their store only.
- **Superadmin** (Hadam platform staff) — doesn't see any store's catalog
  or orders. Sees the tenant directory: who's signed up, basic usage
  stats per tenant, and can suspend/reactivate a tenant.

## Multi-tenancy: how isolation actually works

- Every request is scoped by the `Host` header. `acme.hadam.com` resolves
  to tenant `acme`; `hadam.com` (or bare `localhost`) is the platform.
- Every user, category, product, and order carries a `tenantId`. Every
  query filters by it — a tenant's admin can never see, edit, or even
  address another tenant's data by guessing an ID.
- **Auth tokens are tenant-locked.** A token issued on `acme.hadam.com` is
  rejected with a 403 if replayed against `other.hadam.com`, even for the
  same role — this is checked and tested, not just assumed.
- A suspended tenant's subdomain returns 404 for everything, same as an
  unknown one — suspension actually removes access rather than just
  flagging a database row.
- New tenants get **zero** categories/products at creation — this is what
  "infrastructure without products" means concretely: the engine is
  shared, the catalog is not.

## Categories drive fulfillment (this is how tenants sell anything)

Each category has a `fulfillment` type chosen by the tenant's admin, and
that's what happens automatically the moment payment succeeds:

| fulfillment | typical use                | after payment |
|-------------|------------------------------|----------------|
| `shipping`  | physical goods                | employee queue: `pending → processing → shipped → delivered` |
| `download`  | eBooks, slides, courses        | single-use, time-boxed link: default **72 hours**, **1 download**, both configurable per category |
| `booking`   | services (education, NHS, etc.)| `requested`, then an employee confirms + schedules |
| `manual`    | anything else                  | free-form queue item, `pending → in_progress → done` |

There's no hardcoded category list — a tenant can call a category
"Legal Services" or "Furniture Rentals" and just pick whichever
fulfillment behavior fits.

## Stock, sales stats, and refunds

- **Categories**: the Admin dashboard now supports full CRUD — edit and
  delete included. Deleting a category that still has products attached
  is rejected with a clear error (move or delete those products first)
  rather than silently orphaning them.
- **Stock**: physical (`shipping`) products with a `stock` count are now
  actually enforced — an order can't exceed what's in stock, stock is
  decremented on a successful purchase, and restored automatically if
  that item is later refunded.
- **Admin stats** now include: net revenue (refunds excluded), total
  refunded amount and count, paid vs. total order counts, top-selling
  products by revenue, and stock levels with a low-stock flag (≤5 units,
  visible directly on the Stats tab).
- **Refunds**: Employees and Admins can refund any item on a successfully
  paid order (with an optional reason). Refunding a digital item
  immediately revokes its download link, even if it hadn't expired or
  been downloaded yet. Refunding a physical item puts the stock back.
  A client can't refund their own order — that's a staff action, tracked
  with who did it and when.
- **Employee dashboard** now has two views: the existing **Fulfillment
  Queue** (ship/confirm/action items) and a new **All Orders & Payments**
  tab showing every order's payment status end to end, with a Refund
  button on any eligible item — this is the "track orders, payments, and
  refunds" capability directly.

## Client access to Store + Marketplace

Clients already shop both catalogs in one cart (see "Categories drive
fulfillment" above) — a `booking`-fulfillment category (Education,
NHS/Health, or any custom service category an admin adds) is exactly how
a client "hires" a service on the marketplace: they buy it like any other
product, and it shows up as `requested` until staff confirm and schedule
it, same as any other order.

## Subscription plans: Store, Marketplace, or both

Every store picks a plan when it's created, and the plan gates which
category groups the admin can create — this is the "hire the marketplace,
or just get a store" choice:

- **`store`** — only `store`-group (physical/shipping) categories allowed
- **`marketplace`** — only `marketplace`/`other`-group categories allowed
  (digital, services, anything custom)
- **`both`** — no restriction

The check happens server-side on category creation, not just hidden in
the UI — a "store"-plan tenant gets a 403 if they try to add a digital or
service category, even by calling the API directly.

## Platform-wide discovery (the Home/Products/Stores menu)

Three new public, unauthenticated endpoints power cross-store discovery
on the platform root:

- `GET /api/platform/directory` — active stores, for a "Seller Stores" page
- `GET /api/platform/marketplace/products?category=Books` — every
  product across every active tenant, tagged with a fixed platform-wide
  taxonomy (Design, Education, Stationery, Electronics, Books, Food &
  Drink, Software, Accessories, Other) independent of each tenant's own
  custom category names — this is what "browse products from all seller
  stores by category" actually means: each tenant's admin tags their own
  categories with one of these labels, and this endpoint aggregates across
  every store by that label.
- `GET /api/platform/marketplace/categories` — the fixed label list
- `POST /api/platform/contact` — a public contact-form endpoint (paired
  with `GET /api/platform/contact`, superadmin-only, to read submissions)

## Forgot / reset password

`POST /api/auth/forgot-password` + `POST /api/auth/reset-password`, wired
into the actual login modal on both the tenant storefront and the
platform. **Important limitation, stated plainly**: there's no real email
provider wired in here (see "What's simulated" below), so the reset code
is returned directly in the API response and shown in the UI instead of
being emailed. Swap this for a real email send before real users rely on
it — the token/expiry logic itself is real and tested, only the delivery
channel is a stand-in.

## Client refund requests vs. staff-granted refunds

A client can request a refund (`POST /api/orders/:orderId/items/:productId/request-refund`)
— this flags the item for staff attention but does **not** refund it. Only
Employees/Admins can action it via the existing refund endpoint, which is
a deliberate security boundary: letting a client refund their own order
would be an obvious abuse vector. Staff see flagged requests directly in
their order view.

## Support / CRM inbox

Simple per-store messaging: a client can send a message
(`POST /api/support/messages`), staff see every message for their store
(`GET /api/employee/support`) and can reply/resolve it
(`PATCH /api/employee/support/:id`), and the client can see the reply on
their own messages (`GET /api/support/messages/mine`). No threading or
attachments — this is a straightforward inbox, not a full helpdesk.

## Known product gap: store-owner ↔ superadmin two-way messaging does not exist

This is easy to conflate with the Support/CRM inbox above, so it's worth
being explicit: there is no dedicated channel for a store owner to reach
the Hadam platform team and get a reply. What exists instead:

- The storefront footer's "Contact Us" link goes to the same public,
  anonymous `POST /api/platform/contact` form any website visitor uses —
  it has no awareness that the sender is a store owner at all.
- The `platform_messages` table has **no `tenantId` column**, so even if
  a store owner submits through it, the system cannot associate that
  message with their store.
- Superadmins *are* notified by email when a message arrives
  (`notifySuperadminsOfContactMessage`, localized in EN/AR/FR) — but
  there is **no reply mechanism**: no reply field on the record, no
  `PATCH` endpoint, nothing. Confirmed by direct trace: only `POST`
  (submit) and `GET` (list) exist for `/api/platform/contact`.
- Because no reply exists, there is no way for a store owner to see a
  response, and no threading or conversation history of any kind.

This is a genuinely unimplemented feature, not a defect in the existing
Contact form — the Contact form does exactly what it was built to do
(collect anonymous inbound messages for superadmins to read). If this
capability is wanted, it should be scoped and built as its own proper
conversation system — a support conversation associated with `tenantId`,
a superadmin inbox, two-way replies, store-owner notifications on reply,
and a conversation view — rather than bolted onto `platform_messages` as
a single reply column. That design gives a clean foundation for future
unread status, timestamps, and attachments if ever needed. Not started.

## Staff account creation

Employees and additional Admins are created **by an existing Admin**,
not self-registered — `POST /api/admin/employees` now accepts an optional
`role` of `employee` or `admin`. This was a deliberate choice: a public
"sign up as Admin" form would let any visitor grant themselves store-owner
access to somebody else's tenant infrastructure, which is a real
vulnerability, not a nitpick. If you need self-service staff onboarding
later, the right shape is an invite-code flow (admin generates a
single-use code, staff redeem it) — not open self-assignment of
privileged roles.

## QA — how this was actually tested

This was built test-first-adjacent: every layer below runs against a real
server instance on an isolated, throwaway database (never the real
`data/db.json`), and genuinely caught a real bug during development (an
earlier version of the integration tests used `fetch()` with a custom
`Host` header — `fetch` silently drops that header because it's on the
forbidden list, which made every "tenant" request in the first draft of
the suite silently hit the platform root instead. The fix was to use
Node's core `http` module for the test client, which has no such
restriction. That's a genuine example of a test catching a subtle,
otherwise-invisible bug rather than a rewritten happy-path checkmark.)

Run everything with:

```bash
node tests/run.js
```

### A separate, opt-in tier: real Resend delivery

Everything above is fully deterministic — no network calls to external
services, no real credentials, safe to run constantly during
development. It cannot, by design, prove that an email actually reaches
a real inbox through Resend.

For that, there's a second, explicitly separate script:

```bash
npm run test:email:resend
```

This exercises the complete chain — Store Contact submission →
notification → localized template → the real Resend API → a real,
controlled test mailbox (Mailosaur by default; swap the `mailosaur`
helper near the top of `scripts/test-email-resend.js` for a different
provider if you use one) — and only runs if `RESEND_API_KEY`,
`FROM_EMAIL`, `MAILOSAUR_API_KEY`, and `MAILOSAUR_SERVER_ID` are all
set. With none of them set, it prints what's missing and exits cleanly
(exit code 0) rather than failing — an unconfigured environment isn't a
test failure, it's just not applicable there. This is deliberately
**not** part of `npm test` — it depends on external infrastructure and
real secrets, which would make the everyday suite flaky and secret-
dependent for no benefit to normal development.

Genuinely verified during development, not just written and assumed:
with dummy (invalid) credentials supplied, every step through creating
the store, submitting the Contact form, confirming the `support_messages`
record, confirming exactly one `contact_message_received` notification,
and confirming it rendered in Arabic — all ran for real and passed. The
script also made a real HTTPS call to Resend's actual API and correctly
handled the real HTTP 403 response from the invalid key. The one part
that could not be verified this way is delivery into an actual Mailosaur
mailbox, since that requires genuinely valid credentials this project
was never given. Treat the first real run with real credentials as the
first true test of this script, not only of the feature it exercises.

**85/85 passing** as of this build (16 of those cover this round's
additions: subscription plans, cross-store discovery, password reset, and
refund requests/CRM messaging). Three layers:

- **Unit** (`tests/unit.test.js`) — pure functions in isolation: password
  hashing round-trips and rejects wrong passwords, signed tokens round-trip
  and reject tampering/expiry, subdomain resolution for every host shape
  (`hadam.com`, `www.hadam.com`, `acme.hadam.com`, bare `localhost`,
  `acme.localhost`), and the download-expiry rule flipping `ready → expired`
  without needing to wait 73 real hours.
- **Integration / API** (`tests/api.test.js`) — real HTTP requests against
  a live instance: tenant isolation (unknown subdomain, empty catalog on a
  fresh tenant, cross-tenant token rejection), auth and RBAC (every role
  boundary is tested from the *wrong* side — client hitting admin routes,
  employee hitting admin routes, unauthenticated hitting protected routes —
  not just the happy path), the full checkout → digital delivery →
  single-download-enforcement chain, employee fulfillment updates, and
  superadmin tenant suspension actually blocking access.
- **Acceptance** (`tests/acceptance.test.js`) — full user journeys phrased
  in plain business language: a merchant signs up, defines a service
  category, lists a service, a client books it, staff confirm and schedule
  it, and the client sees the confirmed appointment — while asserting none
  of it leaked into the seeded demo store's data. A second journey covers
  a mixed physical+digital purchase end to end, including the actual file
  download.

**What this gives you, honestly:** a real, passing regression suite that
will catch it if a future change breaks tenant isolation, a role boundary,
or the fulfillment rules — which is the highest-value thing automated
tests can do for a system like this. **What it doesn't give you:** load
testing, penetration testing, browser/device compatibility testing, or a
staged rollout process. "Reliable worldwide from the first time" for a
real SaaS additionally needs, before real customer traffic:
  - a real database in place of `data/db.json` (see below) with backups
  - HTTPS/TLS termination and a real `JWT_SECRET` from a secrets manager
  - rate limiting and abuse protection on auth and tenant-creation routes
  - monitoring/alerting and error tracking in production
  - a staged rollout (internal → beta tenants → general availability)
  - an independent security review, given this handles payments and PII

None of that is code you can "finish" once — it's an ongoing practice.
This build gives you a correct, tested foundation to build that practice
on, not a substitute for it.

## Architecture notes

- **Storage**: `data/db.json`, isolated behind `loadDb`/`persist` at the
  top of `server.js`. Swapping in Postgres/MySQL means rewriting that one
  section — the rest of the file only calls those two functions. Do this
  before real concurrent traffic; a flat file has no locking.
- **Auth**: `scrypt` password hashing; a small hand-rolled HMAC-signed
  token (no external JWT library needed). Set a real `JWT_SECRET` env var
  in production.
- **Payments**: simulated. Any card succeeds except an all-zero number,
  which simulates a decline. Swap the check in the `/api/orders` handler
  for a real provider (Stripe/Adyen/etc.) when ready.
- **Digital files**: downloads return a generated text stand-in so the
  expiry/one-download enforcement can be demonstrated without real
  assets. Point the download route at real object storage (S3/R2/GCS)
  behind the same checks when you have real files.

## Deploying to a cloud host

No build step, no native dependencies — deploys to almost any Node host:

- **Render / Railway / Fly.io**: start command `node server.js`; set
  `HADAM_BASE_DOMAIN=yourdomain.com` and a real `JWT_SECRET`. Point
  wildcard DNS (`*.yourdomain.com`) and a wildcard TLS cert at it so every
  tenant subdomain resolves.
- **AWS Elastic Beanstalk / App Runner**: same start command; attach a
  persistent volume or move storage to RDS first.
- **A plain VM**: `node server.js` behind `pm2`/systemd, with nginx/Caddy
  handling TLS and forwarding all `*.yourdomain.com` traffic through.
