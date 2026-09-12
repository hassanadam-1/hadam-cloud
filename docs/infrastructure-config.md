# Hadam Infrastructure Configuration Reference

**Purpose:** if Render, Cloudflare, or this laptop were ever lost, this document
contains everything needed to recreate the surrounding infrastructure from
scratch. It deliberately contains **no secret values** — only names,
structure, and settings, so it is safe to keep in Git or anywhere else
alongside the rest of the project.

Last verified: 2026-09-12

---

## 1. Render (application hosting)

- **Service name:** `hadamplatform`
- **Service ID:** `srv-dagqpruk1f9s73cl5csg`
- **Type:** Web Service
- **Repo:** `github.com/hassanadam-1/hadam-cloud`
- **Branch:** `main`
- **Build command:** `npm install`
- **Start command:** `node server.js`
- **Plan:** Free tier (upgrade before real customer launch — free tier spins
  down after inactivity, causing ~50s cold starts)

### Environment variables (names only — actual values live only in Render's
### dashboard and this laptop's secured local files, never here)
| Variable | Purpose |
|---|---|
| `NODE_ENV` | set to `production` |
| `HADAM_AUTH_DRIVER` | set to `supabase` |
| `HADAM_BASE_DOMAIN` | set to `hadamplatform.com` |
| `SUPABASE_URL` | `https://leodrmnlmbthyixehfve.supabase.co` |
| `JWT_SECRET` | app's own session-signing secret |
| `SUPABASE_ANON_KEY` | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret/service_role key |
| `STRIPE_*`, `PAYPAL_*` | **Not yet set** — deferred until live payment credentials are ready |

### Custom domains configured on this Render service
- `hadamplatform.com`
- `www.hadamplatform.com`
- `*.hadamplatform.com` (wildcard, for tenant subdomains)

All three verified with SSL certificates issued as of tonight's deployment.

---

## 2. Cloudflare (DNS — domain registered here)

Domain: **hadamplatform.com**. All records below are **DNS only** (Cloudflare
proxy **OFF**) — this is required for Render's own SSL/domain verification to
work correctly.

| Record type | Name | Target |
|---|---|---|
| CNAME | `www` | `hadamplatform-com.onrender.com` |
| CNAME | `@` (root) | `hadamplatform-com.onrender.com` |
| CNAME | `*` (wildcard) | `hadamplatform-com.onrender.com` |
| CNAME | `_acme-challenge` | `hadamplatform-com.verify.renderdns.com` |
| CNAME | `_cf-custom-hostname` | `hadamplatform-com.hostname.renderdns.com` |

---

## 3. Supabase (database + auth)

- **Project name:** Hadam Marketplace
- **Project ref:** `leodrmnlmbthyixehfve`
- **Region:** eu-central-1 (Frankfurt)
- **Plan:** Free tier (deliberately — Pro upgrade deferred until pre-launch
  Disaster Recovery testing is complete, per the agreed staged plan)

### Authentication → URL Configuration
- **Site URL:** `https://hadamplatform.com`
- **Redirect URLs:**
  - `http://*.localhost:3000/*` (kept for local dev testing)
  - `https://*.hadamplatform.com/*` (tenant subdomains)
  - `https://hadamplatform.com/*` (platform root — needed separately since
    the wildcard above does NOT cover the bare root domain)

  **Known gotcha:** if any of the three above is missing, or if the Site
  URL reverts to a stale value, password-reset and other auth emails will
  silently link to the wrong host. This bit us once already — always
  verify all three are present after any Supabase project settings change.

### Superadmin account
- Email: `hassan.adam2@gmail.com`
- Determined via `profiles.is_superadmin = true`, checked by the
  `is_superadmin()` Postgres function

### Storage buckets
| Bucket | Public? | Contents |
|---|---|---|
| `product-images` | Yes | Product photos |
| `digital-files` | No | Purchased digital downloads |

**Neither Supabase's daily backups nor PITR cover these** — this is why the
separate `storage-backup-full.ps1` pipeline exists (see section 5).

---

## 4. Stripe / PayPal

- **Current mode: TEST only.** Live credentials and live webhooks are
  deliberately not yet configured — this is a launch-gate item, not an
  oversight.
- Webhook endpoint path (once live): `/api/webhooks/stripe` and the
  equivalent PayPal path in `server.js`.
- `STRIPE_WEBHOOK_SECRET` and `PAYPAL_WEBHOOK_ID` are not yet set anywhere —
  these require the real Render production URL to register against, which
  now exists (`https://hadamplatform.com`), so this can proceed whenever
  live credentials are ready.

---

## 5. Local backup infrastructure (this laptop)

Everything below lives on this specific Windows machine and is itself a
single point of failure worth being aware of — see the open Disaster
Recovery roadmap item about testing a real restore on a separate machine.

- **Backup folder:** `C:\HadamBackups`
- **Database backup:** `hadam-backup.ps1`, scheduled daily at **22:00** via
  Windows Task Scheduler (task name: `Hadam Database Backup`). Runs
  `pg_dump` (full schema + data), encrypts with 7-Zip AES-256, deletes the
  unencrypted `.sql` immediately after.
- **Storage backup:** `storage-backup-full.ps1` (calls
  `~/Desktop/hadam-v3/scripts/storage-backup.js`), scheduled daily at
  **23:00** (task name: `Hadam Storage Backup`). Downloads both buckets,
  encrypts, **verifies the archive before deleting the plaintext**,
  applies 14-backup retention.
- **Encryption password:** stored as a DPAPI-protected secure string in
  `C:\HadamBackups\backup-encryption-key.txt` — decryptable only by this
  specific Windows user account. The same password protects both the
  database and Storage archives.
- **Supabase service_role key** (needed by the Storage backup script):
  stored the same DPAPI-protected way, in
  `C:\HadamBackups\supabase-service-key.txt`.
- **Off-site copy:** Google Drive Desktop syncs the entire `C:\HadamBackups`
  folder automatically (Google account: the one signed into Drive on this
  machine).
- **Database connection details** (for manual `pg_dump`/`psql` access):
  - Host: `aws-0-eu-central-1.pooler.supabase.com`
  - Port: `5432`
  - User: `postgres.leodrmnlmbthyixehfve`
  - Database: `postgres`
  - Mode used: **Session pooler** (chosen specifically because it works
    over IPv4 — the Direct connection option defaults to IPv6, which most
    home/office networks can't reach without paying for Supabase's IPv4
    add-on)
  - Password: stored in `%APPDATA%\postgresql\pgpass.conf`, never in any
    script

---

## Still open on the Disaster Recovery roadmap
- Real restore test: restore a backup into a separate, throwaway Supabase
  project and verify integrity
- A genuine simulated-disaster exercise, measuring actual RTO/RPO
- Supabase Pro upgrade (deliberately deferred until the above is proven)
- Store name/subdomain collision handling (separate, pre-launch item)
