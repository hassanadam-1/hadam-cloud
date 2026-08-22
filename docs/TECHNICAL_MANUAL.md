# Hadam Marketplace — Technical / System Manual

For admins, developers, and technical support. Reflects the actual current implementation — update this file alongside code changes; it is not a spec for planned work.

---

## 1. Architecture Overview

**Stack:** Node.js backend (`server.js`, single-process HTTP router, no framework), vanilla JS frontends (no build step), Supabase (Postgres + Auth) as the production data/auth layer, with a local JSON-file driver (`db.json`) used for fast local development and the automated test suite.

**Three frontends, one backend:**
| Frontend | Files | Purpose |
|---|---|---|
| Platform site | `public-platform/` | `hadam.com` — home, Marketplace & Stores directory, Sell on Hadam (create/join/add/renew), Contact, Superadmin dashboard |
| Tenant storefront | `public/` | `yourstore.hadam.com` — catalog, cart, checkout, My Orders, Admin panel, Fulfillment Queue, Employee dashboard |
| — | `server.js` | Single Express-like router serving both, host-scoped by subdomain |

**Multi-tenancy:** every tenant-scoped API route resolves the requesting host to a `tenants` row (`hostScope: 'tenant'` in route definitions) and enforces `tenant_id` on every query. `hostScope: 'platform'` routes only work on the bare platform domain; `hostScope: 'any'` work on either.

**Auth driver switch:** `AUTH_DRIVER` env var selects `'supabase'` (production) or `'file'` (local/test). Nearly every route has two code branches — always check both when changing auth/data logic. This has been a repeated source of bugs in this codebase (see §9).

---

## 2. Roles & Permissions

| Role | Scope | Can do |
|---|---|---|
| `client` | Per-tenant | Browse, buy, view own orders, request refunds, confirm/dispute delivery |
| `employee` | Per-tenant | Everything client can, plus: Fulfillment Queue (update status/tracking, approve/reject refund decisions), reply to support messages |
| `admin` | Per-tenant | Everything employee can, plus: manage products/categories/employees, store settings, renewals, view stats, delete the store |
| `superadmin` | Platform-wide | Manage all tenants (suspend/activate), review Marketplace applications, view audit log, reset any store's MFA, view Contact messages |

A single email can hold different roles at different tenants (e.g., admin at Store A, client at Store B) — role is always resolved per-tenant via `tenant_memberships` (Supabase) or `db.users` filtered by `tenantId` (local driver).

---

## 3. Database Structure (Supabase / Postgres)

Full source of truth: `db/schema.sql`. Key tables:

- **`tenants`** — one row per store. `plan` (`store`/`marketplace`/`both`), `status` (`active`/`suspended`/`deleted`), `enabled_tiers` (which subscription tiers that store's admin has chosen to show themselves, self-service only — see §6), `require_mfa_for_staff`, `registration_enabled`.
- **`tenant_memberships`** — join table: `user_id` × `tenant_id` × `role`. This is how a Supabase Auth user gets a role at a given store.
- **`plans`** / **`current_subscriptions`** — the three tiers (starter/professional/enterprise) and each tenant's active subscription (tier, expiry).
- **`products`**, **`categories`** — catalog. Category has `fulfillment` (`shipping`/`download`/`booking`/`manual`) which drives the whole order-item lifecycle.
- **`orders`**, **`order_items`** — one order can span multiple fulfillment types. `order_items` carries the full status + refund + delivery-confirmation lifecycle (see §7, §8).
- **`marketplace_members`** — external/Marketplace-only businesses (no tenant). `plan` (`free`/`featured`), `status` (`pending`/`active`/`rejected`/`more_info_requested`/`suspended`/`expired`).
- **`mfa_*` tables** — TOTP factors (Supabase-native), `mfa_email_otp_settings`/`_codes`, `mfa_backup_codes`.
- **`auth_audit_log`** — every auth-relevant event (login, MFA changes, password resets, lockouts), superadmin-viewable.
- **`platform_messages`** — Contact form submissions (see §11).
- **`recovery_mfa_verified`** — short-lived marker proving a password-recovery session already passed its MFA check, so the actual password-set step doesn't need the code re-entered.

**Row-Level Security (RLS):** every table has policies scoped by `tenant_id` + role, using helper functions `is_tenant_admin()`, `is_tenant_staff()`, `is_superadmin()`. Staff writes to `order_items` and reads are correctly RLS-scoped for `is_tenant_staff()` — **do not assume a write is RLS-blocked without checking the actual policy first** (a real diagnostic mistake was made and corrected earlier in this project's history; see `db/schema.sql` comments near `order_items` policies for the exact grants).

---

## 4. Authentication

- Supabase Auth is the identity provider. One email = one Supabase Auth identity, usable across every store (a person can be a client at one store and admin at another under the same login).
- **MFA:** TOTP (authenticator app), Email OTP, and backup codes — all optional per-user, with `require_mfa_for_staff` allowing a store to mandate it for admin/employee accounts.
- **Password recovery:** email-link based, redirect URL built dynamically from the requesting store's own subdomain (`req.headers.host`) — never hardcoded, so every store's reset links land back on that same store automatically. Requires a **one-time** Supabase dashboard setting: a wildcard Redirect URL (`https://*.hadam.com/**`) — without it, only exactly-allowlisted subdomains work.
- **MFA-gated recovery is a two-step flow:** (1) verify the MFA code, which marks a short `recovery_mfa_verified` window; (2) set the new password using that window. This means a password rejected for being the same as the old one never consumes or requires re-entering the MFA code.
- **"Same as current password" pre-check:** before even showing the MFA code screen, a dedicated endpoint tests the proposed password by attempting a real sign-in with it (the only reliable way to compare against a value Supabase never exposes as plaintext) — using a fresh, isolated client, never the shared module-level one, to avoid cross-request session interference.

---

## 5. Order & Fulfillment Lifecycle

Each `order_items` row has its own `fulfillment` type and independent status lifecycle:

| Fulfillment | Statuses |
|---|---|
| `shipping` (or `pickup` delivery method) | `pending → processing → shipped → delivered` (or `pending → ready_for_pickup → picked_up`) |
| `download` | Access granted immediately on successful payment; tracked via `first_downloaded_at` (blocks later refunds) |
| `booking` | `requested → confirmed → completed` / `cancelled`, staff sets `scheduled_at` |
| `manual` | `pending → in_progress → done` |

Staff update status/tracking via `PATCH /api/employee/orders/:orderId/items/:productId`, gated to `employee`/`admin` roles.

---

## 6. Subscriptions & Payments (Simulated)

**No real payment gateway is integrated.** Card details are validated (format only — never real charges) and never persisted beyond a masked last-4 digits for refund audit trail. Test values: `4111 1111 1111 1111` always succeeds; `0000 0000 0000 0000` always declines.

**Shared validation** (`validateFullCard()` server-side, `cardValidationError()` + `wireCardFieldValidation()` client-side, one implementation per frontend file, kept behaviorally identical):

- Card number: ≥12 digits after stripping spaces
- Expiry: `MM/YY`, must be a future month
- CVV: **exactly 3 digits**, required — client-side input is hard-filtered as you type (letters can't even be entered, 4th digit is physically blocked)
- Cardholder name: required, non-empty

Every payment-collecting flow uses this same validation, both client-side (live, per-field, inline messages) and server-side (authoritative): store signup, tier renewal/change (both the tenant-admin-facing and platform-level forms), Add Marketplace to Store, Join Marketplace (Featured), refund payment confirmation, and the main product checkout.

**Renewal gating:** a renewal is blocked as unnecessary if the subscription is >7 days from expiry and the tier isn't changing — picking a different tier is always treated as an explicit change and never blocked. `enabled_tiers` on `tenants` lets a store's own admin self-service hide tiers they don't want to see (defaults to all three enabled); this is not a platform-wide restriction and is enforced server-side too (a store's current tier can never be removed from its own enabled list).

**Every successful renewal or new-store paid signup notifies every superadmin** by email (`notifySuperadminsOfRenewal` / the shared `notifyAllSuperadmins` helper) with client, service(s), payment confirmation, and period.

---

## 7. Refund Workflow

Deliberately structured so a real payment gateway can slot in later without redesigning the workflow around it — the "payment confirmation" step is already a distinct stage from "approval."

**State machine** (`order_items.refund_status`): `none → requested → approved|rejected → processed` (only reachable from `approved`).

1. **Customer requests** (`POST /api/orders/:orderId/items/:productId/request-refund`) — reason recorded, `refund_status='requested'`, `refund_requested_at` set. **Every admin/employee at that store is emailed immediately.**
2. **Staff decides** (`POST /api/employee/orders/:orderId/items/:productId/refund-decision`, body `{decision: 'approve'|'reject', reason}`) — records who decided, when, and why. **Customer is emailed the outcome.** A rejection never touches order/stock state at all.
3. **Customer confirms payment** (`POST /api/orders/:orderId/items/:productId/submit-refund-payment`, only valid from `approved` state) — full card validation (see §6) required; only the **last 4 digits** are stored (`refund_payment_last4`), never the full number or CVV. On success: `status='refunded'`, `refund_status='processed'`, physical stock automatically restored, **both staff and customer emailed** final confirmation.

| Actor | Can do |
|---|---|
| Customer | Request, provide reason, confirm refund payment method after approval, see status/decision reason |
| Employee/Admin | Approve or reject, with a reason; see all refund state via Fulfillment Queue |
| Superadmin | No special refund role — refunds are store-scoped |

---

## 8. Delivery Confirmation (separate from refunds)

Two independent signals on the same `order_items` row, never conflated:

- **Staff status** (`status='delivered'`) — the store/courier's claim.
- **Customer confirmation** (`customer_confirmed_at`) or **dispute** (`customer_reported_problem`, `customer_problem_note`) — the customer's own signal.

Marking delivered triggers a customer email prompting confirmation; if they do nothing, an hourly job (`checkDeliveryConfirmationReminders`, part of the same interval as subscription-alert checks) sends one reminder after 3 days. Staff see whichever of the three states (confirmed / disputed / awaiting) applies, directly in Fulfillment Queue.

**Built-in diagnostic** (`Run Tracking Status` button in Fulfillment Queue, `POST /api/admin/orders/:orderId/items/:productId/run-tracking-self-test`) exercises the entire real workflow end-to-end through the actual production code paths — employee update, customer visibility, confirmation, staff sees it, dispute, staff sees that too — then restores every touched field to its exact original value. No SQL required for staff to self-verify the pipeline.

---

## 9. Known Architectural Risk Pattern — Read Before Touching Auth-Adjacent Code

A confirmed, repeated bug class in this codebase: using the **caller's own Supabase client** (`supabaseForRequest(bearerToken(req))`, subject to RLS) for a write that RLS silently rejects or partially permits, instead of the **admin/service-role client** (`supabaseAdmin()`) for actions already authorized by the route's own role gate. This produces a failure that looks identical to "not found" or "no rows affected," with no indication RLS was the cause.

Confirmed instances fixed: meeting-link notification lookup (embedded/joined query), fulfillment status update endpoint. A full audit of the codebase's other ~30+ admin/employee-gated routes for this same pattern **has not been completed** — treat any route doing a write via the caller's own client as worth double-checking against the actual RLS policy in `db/schema.sql` before assuming it's broken, and prefer `supabaseAdmin()` for any staff-authorized write to be safe.

---

## 10. Validation Rules Reference

- **Subdomain:** 2-30 lowercase letters/numbers/hyphens, not reserved.
- **Password:** ≥8 characters, at least one letter, one number, one special character.
- **CVV:** exactly 3 digits (not 3-4 — this was tightened from an earlier, looser rule).
- **Card expiry:** `MM/YY`, must resolve to a future month.
- **One active store per email** at signup (checked before creation).
- **One non-rejected Marketplace application per email** — duplicate/conflicting applications are blocked with a 409; a rejected one can be resubmitted.
- **Refund:** blocked if item already refunded, a decision is already in progress/made, or (for digital items) already downloaded.

---

## 11. Contact Form

`POST /api/platform/contact` (public, platform-scoped) — stores the message (`platform_messages` table / `db.platformMessages`), **emails every superadmin immediately** (`notifySuperadminsOfContactMessage`), and returns a success confirmation the frontend displays on-screen. Superadmins view and manage all submissions from the **Superadmin dashboard → Contact form messages** section (`GET /api/platform/contact`, superadmin-only).

---

## 12. Key Endpoints Reference

Not exhaustive — grep `server.js` for `route(` for the full list. High-traffic / high-risk ones:

| Method & Path | Purpose |
|---|---|
| `POST /api/orders` | Main checkout — full card validation required |
| `PATCH /api/employee/orders/:orderId/items/:productId` | Staff status/tracking update |
| `POST .../request-refund`, `.../refund-decision`, `.../submit-refund-payment` | Refund workflow, §7 |
| `POST .../confirm-receipt`, `.../report-problem` | Delivery confirmation, §8 |
| `POST /api/admin/store/renew` | Store/Marketplace renewal, full card validation, enabled-tiers + expiry gating |
| `POST /api/platform/tenants` | Store creation |
| `POST /api/platform/marketplace-members` | Join Marketplace — duplicate-blocked |
| `POST /api/platform/add-marketplace-to-store` | Add existing store to Marketplace |
| `POST /api/platform/contact` | Contact form |
| `GET /api/tenant/info` | Store's own current plan/tier/expiry/enabled-tiers |

---

## 13. Troubleshooting

- **"Save changes" or similar staff action silently does nothing / 404s unexpectedly:** check whether the write uses the caller's client vs. `supabaseAdmin()` (§9) before assuming the frontend is broken.
- **Password reset link goes to the wrong store or a generic URL:** check the Supabase Redirect URLs wildcard setting (§4) — this is a one-time dashboard config issue, not application code.
- **A payment-collecting form doesn't validate CVV/cardholder name:** confirm it's actually calling `validateFullCard()`/`validateFullCard`-equivalent server-side and `wireCardFieldValidation()` client-side — several flows were found missing this entirely during this project's development and had to be retrofitted one at a time; when adding a new payment flow, copy an existing one rather than writing card handling from scratch.
- **A new database column added to `db.json`/local driver doesn't show up:** the local driver initializes fields explicitly at record-creation time (e.g. in the checkout/order-item construction code) — a new Supabase column needs a matching explicit default added to the local driver's equivalent object literal, or it will be `undefined` (not `null`), which fails strict-equality checks in tests.
- **Self-test / diagnostic tool reports a failure that doesn't match reality:** check for object-reference vs. snapshot bugs — the local driver mutates objects in place, so any "restore original state" logic must capture the original values as plain primitives *before* any write, not read them again afterward from what may now be a mutated reference.
