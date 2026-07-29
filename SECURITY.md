# Hadam Marketplace — Security Architecture

Two independent layers. Either one failing alone should not be enough to
leak or corrupt another tenant's data. That's the actual point of "two
levels" — not two places doing the same check for no reason, but two
places that fail *independently*, so a mistake in one doesn't mean a
mistake in the whole system.

---

## Layer 1 — System-level (application) security

This is what's running today, in `server.js`, and is covered by all 179
automated tests.

### Authentication
- Passwords hashed (never stored in plain text) — see `hashPassword()`.
- Session tokens are HMAC-signed (`signToken()`/`verifyToken()`) — a token
  can't be forged or edited without knowing the server's secret.
- **Known limitation, flagged honestly**: this is Hadam's own custom auth
  code, not a widely-audited third-party system. This is exactly why the
  Supabase Auth migration (Layer 2 below, and future work) is the planned
  next step — more eyes, more production hardening, less of the attack
  surface being "code one project wrote."

### Authorization (roles & permissions)
- Every route declares exactly which roles may call it —
  `roles: ['admin']`, `roles: ['client', 'admin', 'employee']`, etc.
- Tested directly: dozens of tests assert a 403 when the wrong role tries
  a route (e.g. "a client cannot access reports (403)").

### Tenant isolation
- Every tenant-scoped query filters by `tenant.id`, resolved from the
  request's subdomain — a request to `storeA.hadam.com` can never see
  `storeB`'s data through the application code.
- Tested directly: created two real stores with distinctly-named products
  and confirmed zero cross-contamination.
- A suspended, closed, or deleted tenant is unreachable — verified this
  extends to *every* route type (a dispatcher-level bug once let login
  bypass this; fixed and now covered by a permanent test).

### API security
- **Rate limiting**: login, registration, password reset, and store
  creation are all throttled per IP (brute-force / spam protection).
  Verified live: 429 fires at the configured threshold, unaffected clients
  are unaffected.
- **Security headers** on every response (added this round):
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Strict-Transport-Security`. Covered by a permanent test.
- **Known trade-off, not yet tightened**: CORS currently allows any origin
  (`Access-Control-Allow-Origin: *`). Reasonable for local/demo testing
  across dynamic tenant subdomains, but a production deployment should
  restrict this to an explicit allowlist of real domains before launch.

---

## Layer 2 — Supabase-level (database) security

This is the design in `db/schema.sql` — written, reviewed, **not yet run
against a live database** (no network access to any Postgres from this
sandbox — confirmed, not assumed).

### Row Level Security (RLS)
- Every tenant-scoped table has RLS enabled, with policies split by
  *action*, not one blanket rule: any tenant member can browse products,
  but only that tenant's `admin` role can create/edit/delete them; a
  client sees only their own orders, not other clients' orders at the same
  store, even though they share a `tenant_id`.
- Uses Supabase Auth's `auth.uid()`, populated automatically from the
  verified session on every request — nothing for the application to
  remember to set up per-request (the earlier session-variable design had
  exactly that weakness; this doesn't).

### Storage permissions (added this round — a real gap, now filled)
- Product images live in Supabase Storage, not the database. Policies:
  anyone can *view* an image (public storefront), but only that tenant's
  own admin can *upload* or *delete* one — enforced by parsing the
  tenant ID straight out of the storage path, the same defense-in-depth
  pattern as the database tables.

### Access controls
- The Node server should connect using Supabase's standard `authenticated`
  role (tied to a real user session), **not** the `service_role` key —
  `service_role` bypasses every policy above entirely. Reserved only for
  the hourly subscription-alert background job, which intentionally needs
  to see across all tenants, and should be the only code path using it.

---

## Concrete example: how the two layers work together

**Scenario**: a bug is accidentally introduced in `server.js` — someone
removes the `tenant.id` filter from the "delete product" route.

- **Without Layer 2**: any authenticated admin, from any store, could now
  delete any other store's product. A real, silent data-loss bug.
- **With Layer 2 in place**: the buggy query still runs, but Postgres
  itself checks the RLS policy (`admin_deletes_products`, which requires
  `is_tenant_admin(tenant_id)` for *that specific row's* tenant_id) before
  allowing the delete — an admin at Store A still cannot delete Store B's
  product, because the database never agreed to it, regardless of what the
  application code asked for.

That's the actual value of two levels: not redundancy for its own sake,
but a mistake in one layer being caught by the other.

---

## Recommended next steps, in order

1. Share your actual Supabase project's current state (if one already
   exists) so it can be reviewed directly, rather than only against the
   design above.
2. Run `db/schema.sql` in a real Supabase project and fix whatever the
   real Postgres version flags that I couldn't verify from here.
3. Do the `server.js` rewrite to actually use Supabase (auth + queries),
   testing against that real project as we go.
4. Before going live with real payments: tighten CORS to a real domain
   allowlist, and get a security review from someone other than the one
   author (me) who wrote the code being reviewed.
