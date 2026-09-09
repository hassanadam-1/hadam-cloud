-- =========================================================================
-- Hadam Marketplace — PostgreSQL / Supabase schema (Supabase Auth edition)
-- =========================================================================
-- This is real, complete, carefully-written SQL — but it has NOT been run
-- against a live Supabase project. This sandbox has no network access to
-- any database, real or local (confirmed earlier: even `npm install pg` and
-- `apt-get install postgresql` were blocked here). Run this in your
-- Supabase project's SQL Editor and verify it yourself before depending on
-- it — that is a real, necessary step, not a formality.
--
-- ARCHITECTURAL DECISION (made deliberately, not a default):
-- This version uses Supabase's own Auth system (auth.users, auth.uid()) as
-- the identity layer, replacing Hadam's custom JWT/password-hashing code.
-- One login works across all of Hadam — the SAME person can be a customer
-- at one store and staff at another with a single email/password. Their
-- role at any given store is a separate fact, held in tenant_memberships
-- below, not baked into the login itself.
--
-- Why this instead of the session-variable approach from the first draft:
-- that approach depended on the application remembering to run
-- `SET LOCAL app.tenant_id = ...` on every single request, forever, with no
-- error if it was ever forgotten — a real, known failure mode with
-- connection pooling in particular. Supabase Auth's auth.uid() is populated
-- automatically by their infrastructure from the verified JWT on every
-- request, so there's no manual step to forget. That's a genuinely stronger
-- security posture, at the cost of migrating the login system itself —
-- a deliberate trade this project has decided is worth making.
--
-- Bonus simplification: Supabase Auth handles password reset/recovery
-- natively, so the old password_resets table is gone entirely — one less
-- thing for this project's own code to get right.
-- =========================================================================

-- =========================================================================
-- ⚠ REQUIRED ONE-TIME PRODUCTION SETUP — Supabase Redirect URLs
-- =========================================================================
-- This is NOT SQL — it's a setting in the Supabase dashboard itself, and
-- it must be done once, before any real store goes live, or password
-- resets will fail (or silently redirect somewhere wrong) for every store
-- except whichever exact URL(s) happen to already be allowlisted.
--
-- WHY: every store gets its own subdomain (yourname.hadam.com), and the
-- password-reset link this app generates always points back to whichever
-- store's subdomain the request came from (see requestPasswordReset() in
-- lib/auth.js, and the redirectTo construction in server.js's
-- /api/auth/forgot-password handler — both already correct, dynamic code,
-- no per-store logic needed there). But Supabase itself refuses to honor a
-- redirect URL unless it matches an entry on the project's own allowlist,
-- regardless of what the application asks for.
--
-- WHERE: Supabase Dashboard → Authentication → URL Configuration →
-- Redirect URLs.
--
-- WHAT TO ADD (one time, covers every current and future store):
--   https://*.hadam.com/**
-- (replace hadam.com with the actual production domain if different)
--
-- This is a ONE-TIME action. Once set, no developer or admin ever needs to
-- touch this again for any new store — a wildcard matches any subdomain,
-- current or created years from now. Do NOT add stores individually; that
-- defeats the purpose and will eventually be forgotten for some store.
--
-- For local development, this sandbox's own Supabase project already
-- appears to permit *.localhost testing (confirmed working across
-- multiple test stores this session) — this note is specifically about
-- what to check/set before the FIRST real production deployment.
-- =========================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- -------------------------------------------------------------------------
-- TENANTS — one row per store. Bilingual/multi-language content (name,
-- tagline, about text) is stored as JSONB rather than normalized into
-- separate columns per language, since the set of languages a store owner
-- adds is open-ended (see translations columns throughout this schema).
--
-- NOTE: subscription/billing info deliberately does NOT live here — see
-- PLANS and SUBSCRIPTIONS below. `plan` here is a different concept: it's
-- the Store/Marketplace/Both LISTING VISIBILITY choice (does this store show
-- up in Hadam's shared Marketplace directory), independent of which paid
-- tier they're subscribed to.
-- -------------------------------------------------------------------------
create table tenants (
  id             uuid primary key default gen_random_uuid(),
  subdomain      text unique not null check (subdomain ~ '^[a-z0-9-]{2,30}$'),
  name           text not null,
  tagline        text default '',
  about_text     text default '',
  translations   jsonb default '{}'::jsonb, -- { "ar": {"name":..,"tagline":..,"aboutText":..}, "fr": {...} }
  plan           text not null default 'store' check (plan in ('store', 'marketplace', 'both')),
  status         text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  closed_by_self boolean not null default false,
  deleted_at     timestamptz,
  deleted_by     text,
  registration_enabled  boolean not null default true, -- whether new customers can self-register at this store
  require_mfa_for_staff boolean not null default false, -- whether admin/employee accounts at this store must have two-factor authentication enrolled to log in
  -- Which subscription tiers this store's own admin has chosen to make
  -- selectable on their own Sale on Hadam page — purely a self-service
  -- convenience for that one store's admin (e.g. hiding a tier they'll
  -- never use), not a platform-wide restriction. Defaults to every tier
  -- enabled; enforced server-side too, not just hidden in the UI.
  enabled_tiers  text[] not null default array['starter', 'professional', 'enterprise'],
  created_at     timestamptz not null default now()
);
create index idx_tenants_subdomain on tenants (subdomain);
create index idx_tenants_status on tenants (status);

-- -------------------------------------------------------------------------
-- PLANS — the pricing tiers themselves (Starter/Professional/Enterprise,
-- or whatever a real deployment configures). Kept as actual rows, not a
-- fixed enum, so pricing/limits can change without a schema migration.
-- -------------------------------------------------------------------------
create table plans (
  id                   uuid primary key default gen_random_uuid(),
  name                 text unique not null,
  monthly_price        numeric(10, 2) not null default 0,
  yearly_price         numeric(10, 2) not null default 0, -- annual billing option
  commission_rate      numeric(5, 4) not null default 0, -- e.g. 0.15 = 15% per sale
  max_products         int, -- null = unlimited
  max_storage_mb       int, -- product image storage allowance
  staff_accounts       int not null default 1, -- how many employee/admin memberships this plan allows
  marketplace_allowed  boolean not null default false, -- can this plan even be listed on the shared Marketplace
  custom_domain        boolean not null default false, -- future feature: bring-your-own-domain
  active               boolean not null default true, -- false = no longer offered to new signups, but existing subscribers keep it
  created_at           timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- SUBSCRIPTIONS — one row per billing period, not overwritten on renewal.
-- This is the real improvement over the first draft (which just mutated a
-- single expiry date on the tenant row, losing all history): renewing
-- creates a NEW row, so "did they renew last month" is a real, queryable fact.
-- -------------------------------------------------------------------------
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  plan_id         uuid not null references plans (id) on delete restrict,
  billing_cycle   text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  start_date      date not null default current_date,
  expiry_date     date not null,
  auto_renew      boolean not null default true,
  payment_status  text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  status          text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  last_alert_level text, -- '1_month' | '2_weeks' | '1_week' | 'expired' | null — prevents duplicate reminder emails; naturally resets each renewal since that creates a new row
  created_at      timestamptz not null default now()
);
create index idx_subscriptions_tenant on subscriptions (tenant_id);
create index idx_subscriptions_status on subscriptions (status);

-- Convenience view: each tenant's current (most recent) subscription, so
-- "what plan are they on right now" doesn't require hand-writing this
-- query everywhere it's needed.
create view current_subscriptions as
select distinct on (tenant_id) *
from subscriptions
order by tenant_id, created_at desc;

-- -------------------------------------------------------------------------
-- PROFILES — one row per Supabase Auth identity (auth.users is managed by
-- Supabase itself; we never create rows there directly, only reference it).
-- Holds platform-wide info that isn't tied to any one store. is_superadmin
-- is a platform-staff flag, entirely separate from any tenant relationship.
-- -------------------------------------------------------------------------
create table profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text,
  is_superadmin  boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Auto-create a profile row the moment someone signs up via Supabase Auth,
-- so the app never has to remember to do it manually.
create or replace function handle_new_auth_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- -------------------------------------------------------------------------
-- TENANT MEMBERSHIPS — one Hadam-wide login (one auth.users row) can hold a
-- DIFFERENT role at DIFFERENT stores: a customer at Store A, an employee at
-- Store B. This table is what makes that possible — role lives here, per
-- (user, tenant) pair, not on the identity itself.
-- -------------------------------------------------------------------------
create table tenant_memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  tenant_id   uuid not null references tenants (id) on delete cascade,
  role        text not null check (role in ('admin', 'employee', 'client')),
  created_at  timestamptz not null default now(),
  unique (user_id, tenant_id) -- one role per person per store — no ambiguity about which role applies
);
create index idx_memberships_user on tenant_memberships (user_id);
create index idx_memberships_tenant on tenant_memberships (tenant_id);

-- Helper: does the current user hold ANY membership at this tenant (used
-- for "can browse/read" checks — any role qualifies for read access).
create or replace function is_tenant_member(check_tenant_id uuid) returns boolean as $$
  select exists (
    select 1 from tenant_memberships
    where user_id = auth.uid() and tenant_id = check_tenant_id
  );
$$ language sql stable security definer;

-- Helper: does the current user hold the 'admin' role specifically at this
-- tenant (used for "can create/edit/delete store data" checks).
create or replace function is_tenant_admin(check_tenant_id uuid) returns boolean as $$
  select exists (
    select 1 from tenant_memberships
    where user_id = auth.uid() and tenant_id = check_tenant_id and role = 'admin'
  );
$$ language sql stable security definer;

-- Helper: 'admin' or 'employee' — used for fulfillment/order-management checks.
create or replace function is_tenant_staff(check_tenant_id uuid) returns boolean as $$
  select exists (
    select 1 from tenant_memberships
    where user_id = auth.uid() and tenant_id = check_tenant_id and role in ('admin', 'employee')
  );
$$ language sql stable security definer;

-- Helper: is the current user platform staff (Hadam itself, not any one store).
create or replace function is_superadmin() returns boolean as $$
  select coalesce((select is_superadmin from profiles where id = auth.uid()), false);
$$ language sql stable security definer;

-- -------------------------------------------------------------------------
-- CATEGORIES
-- -------------------------------------------------------------------------
create table categories (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants (id) on delete cascade,
  name                   text not null,
  translations           jsonb default '{}'::jsonb, -- { "ar": {"name":..,"description":..}, ... }
  "group"                text not null check ("group" in ('store', 'marketplace', 'other')),
  fulfillment            text not null check (fulfillment in ('shipping', 'download', 'booking', 'manual')),
  description            text default '',
  download_window_hours  int,       -- only meaningful when fulfillment = 'download'
  max_downloads          int,       -- only meaningful when fulfillment = 'download'
  allow_pickup           boolean default false, -- only meaningful when fulfillment = 'shipping'
  custom_type_name       text,      -- store owner's own label, only meaningful when fulfillment = 'manual' ("Other")
  platform_category      text not null default 'Other', -- cross-store Marketplace browse tag
  created_at             timestamptz not null default now()
);
create index idx_categories_tenant on categories (tenant_id);
-- Enforces "category names must be unique per store, regardless of
-- capitalization or spacing" at the database level, not just in
-- application code — protects against race conditions, concurrent
-- requests, and any future code path that bypasses the app-layer check.
create unique index if not exists categories_tenant_name_unique on categories (tenant_id, lower(trim(name)));

-- -------------------------------------------------------------------------
-- PRODUCTS
-- -------------------------------------------------------------------------
-- A single global counter across every store on the platform — this is what
-- makes the SKU globally unique (not just unique within one store) and
-- gives it a stable, permanent numbering that never depends on which
-- tenant created the product or in what order.
create sequence product_sku_seq start 1;

create table products (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  category_id    uuid not null references categories (id) on delete restrict,
  name           text not null,
  sku            text not null unique default ('HDM-' || lpad(nextval('product_sku_seq')::text, 6, '0')), -- assigned automatically at creation, globally unique, and permanent — the business identifier used everywhere (inventory, orders, reports, digital products, stock movements); never changes after creation regardless of edits to name/price/category
  translations   jsonb default '{}'::jsonb, -- { "ar": {"name":..,"description":..}, ... }
  description    text default '',
  price          numeric(10, 2) not null check (price >= 0),
  stock          int check (stock is null or stock >= 0), -- null = not stock-tracked (digital/service items); a number = physical inventory count, never negative
  external_url   text, -- optional demo/sample link
  meeting_link   text, -- Zoom/Teams/etc. link for online courses and other booking-fulfillment products — shown to the customer only after purchase, and only meaningful when the product's category fulfillment is 'booking'
  created_at     timestamptz not null default now()
);
create index idx_products_tenant on products (tenant_id);
create index idx_products_sku on products (sku);
create index idx_products_category on products (category_id);

-- DOWNLOAD_PRODUCTS: the actual digital file attached to a download-fulfillment
-- product — original filename, extension (derived from filename), MIME type,
-- size, and the real Supabase Storage path (in the private "digital-files"
-- bucket). One row per product — re-uploading replaces the existing row via
-- upsert rather than creating a second one, matching how the admin UI treats
-- "the current file for this product" as a single thing to replace.
create table download_products (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null unique references products (id) on delete cascade,
  tenant_id         uuid not null references tenants (id) on delete cascade,
  sku               text, -- the product's permanent code, kept in sync at upload/replace time — every uploaded file is linked to both the product's id (above) and its sku
  storage_provider  text not null default 'supabase', -- kept explicit and separate from bucket/path so a future non-Supabase backend wouldn't require a schema change
  storage_bucket    text not null default 'digital-files',
  storage_path      text not null,      -- the name actually used inside storage (sanitized, prefixed with a random id to avoid collisions)
  original_filename text not null,      -- exactly what the admin's file was called on their own computer, BEFORE any optional compression — this describes the file the customer actually gets after extracting, not the .zip wrapper itself
  extension         text not null,      -- derived from original_filename at upload time and stored explicitly, not recomputed later
  mime_type         text not null,
  size_bytes        bigint not null check (size_bytes >= 0), -- the size of what's actually in storage (the .zip size, if compressed)
  is_compressed     boolean not null default false, -- true = the object in storage is a .zip wrapper around original_filename, unchanged inside; customers need a one-line "extract this" hint
  upload_status     text not null default 'completed' check (upload_status in ('completed', 'failed')), -- a row is only ever written here AFTER the upload is verified successful (see uploadDigitalFileToSupabase and the confirm-upload route), so 'completed' is the only value this ever actually takes today — tracked explicitly rather than only implied by the row's existence
  uploaded_at       timestamptz not null default now(),
  uploaded_by       text not null       -- the admin's name at the time of upload
);
create index idx_download_products_tenant on download_products (tenant_id);

-- Every stock change (restock or sale) gets one audit row here — the trail
-- that answers "where did this product's stock go?" after the fact.
create table product_stock_movements (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  product_id   uuid references products (id) on delete set null, -- kept even if the product is later deleted, for audit purposes
  sku          text, -- the product's permanent code at the time of this movement — survives even if the product itself is later deleted
  change       int not null, -- positive = stock added, negative = stock sold/removed
  reason       text not null check (reason in ('restock', 'sale', 'refund_restock', 'manual_adjustment')),
  order_id     uuid references orders (id) on delete set null, -- set when reason is 'sale' or 'refund_restock'
  created_by   text, -- staff member's name, for manual restocks; null for automated sale/refund entries
  created_at   timestamptz not null default now()
);
create index idx_stock_movements_tenant on product_stock_movements (tenant_id);
create index idx_stock_movements_product on product_stock_movements (product_id);

/**
 * Atomically adjusts a product's stock and records the movement, all as one
 * database transaction (a Postgres function body is always transactional —
 * either everything in it commits, or none of it does). The guard is in the
 * UPDATE's WHERE clause itself: "would the result still be >= 0?" — checked
 * and applied in a single atomic statement, which is what actually prevents
 * a race condition between two simultaneous sales of the same last unit
 * (unlike reading the current stock in one step and writing a new value in
 * a separate step later, which is not safe under concurrent access).
 *
 * Returns the new stock value on success, or null if there wasn't enough
 * stock to cover a negative (sale) adjustment — the caller checks for null
 * and treats it as "insufficient stock," without ever having written
 * anything or logged a movement for a rejected sale.
 */
create or replace function adjust_product_stock(
  p_product_id uuid, p_tenant_id uuid, p_change int, p_reason text, p_order_id uuid default null, p_created_by text default null
) returns int
language plpgsql
security definer
as $$
declare
  v_new_stock int;
  v_sku text;
begin
  update products set stock = stock + p_change
  where id = p_product_id and tenant_id = p_tenant_id and stock is not null and (stock + p_change) >= 0
  returning stock, sku into v_new_stock, v_sku;

  if v_new_stock is null then
    return null; -- either the product doesn't exist/isn't stock-tracked, or the sale would have gone negative
  end if;

  insert into product_stock_movements (tenant_id, product_id, sku, change, reason, order_id, created_by)
  values (p_tenant_id, p_product_id, v_sku, p_change, p_reason, p_order_id, p_created_by);

  return v_new_stock;
end;
$$;

-- -------------------------------------------------------------------------
-- PRODUCT IMAGES — genuinely normalized (a real one-to-many relationship),
-- unlike translations above which stay as JSONB since languages are open-ended.
-- The files themselves live in Supabase Storage; this table just references them.
-- -------------------------------------------------------------------------
create table product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  tenant_id    uuid not null references tenants (id) on delete cascade, -- denormalized for simple, fast RLS
  sku          text, -- the product's permanent code at time of upload — same completeness standard as download_products
  storage_path text not null, -- e.g. "tenant-<id>/products/<image-id>.png" inside a Supabase Storage bucket
  filename     text,
  mime_type    text not null,
  size_bytes   bigint, -- nullable only for rows created before this column existed; every new upload populates it
  uploaded_by  text, -- the admin's name at the time of upload
  uploaded_at  timestamptz not null default now()
);
create index idx_product_images_product on product_images (product_id);
create index idx_product_images_tenant on product_images (tenant_id);

-- -------------------------------------------------------------------------
-- ORDERS + ORDER ITEMS — split into two tables (a real relational
-- improvement over the current single-JSON-blob order model): one order,
-- many line items, each independently trackable through fulfillment.
-- -------------------------------------------------------------------------
create table orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants (id) on delete cascade,
  client_id         uuid not null references auth.users (id) on delete restrict,
  payment_status    text not null check (payment_status in ('success', 'failed', 'pending')),
  status            text not null default 'pending' check (status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  shipping_address  text,
  total             numeric(10, 2) not null,
  created_at        timestamptz not null default now(),
  payment_method              text check (payment_method in ('simulated', 'stripe', 'paypal', 'bank_transfer', 'cash')),
  pending_provider_reference  text
);
create index idx_orders_tenant on orders (tenant_id);
create index idx_orders_client on orders (client_id);

-- Every change to an order's overall lifecycle status gets one row here —
-- who changed it, to what, and when. This is distinct from the per-item
-- fulfillment tracking on order_items (shipping/download/booking status),
-- which is a separate, finer-grained concept already covered there.
create table order_status_history (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  order_id    uuid not null references orders (id) on delete cascade,
  status      text not null,
  changed_by  text not null, -- staff member's name; 'System' for the automatic entry made at order creation
  changed_at  timestamptz not null default now()
);
create index idx_order_status_history_order on order_status_history (order_id);

-- =========================================================================
-- PAYMENTS — Phase 1 of the multi-provider payment architecture. This is
-- deliberately ADDITIVE: orders.payment_status and its existing
-- 'success'/'failed' values are UNTOUCHED, so the current simulated
-- checkout flow keeps working exactly as before. This table exists
-- alongside it as the provider-independent model that Stripe, PayPal,
-- bank transfer, and cash will all write into in later phases — none of
-- those providers are wired up yet; this phase only builds the foundation
-- and proves it with automated tests.
--
-- One order can have more than one payment row over its lifetime (e.g. an
-- initial authorization, then a later capture; or a failed attempt
-- followed by a successful retry) — the CURRENT state of an order's
-- payment is whichever row is most recent, not a 1:1 relationship.
-- =========================================================================
create table payments (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants (id) on delete cascade,
  order_id              uuid not null references orders (id) on delete cascade,
  client_id             uuid not null references auth.users (id) on delete restrict,
  method                text not null check (method in ('stripe', 'paypal', 'bank_transfer', 'cash', 'simulated')),
  status                text not null default 'pending' check (status in ('pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded')),
  amount                numeric(10, 2) not null,
  currency              text not null default 'usd',
  -- The provider's own identifier for this transaction (Stripe PaymentIntent
  -- ID, PayPal order ID, a staff-entered bank reference, etc.) — null for
  -- methods that have none yet (e.g. cash before staff confirms it).
  provider_reference    text,
  -- Prevents the same external event (e.g. a webhook retried by the
  -- provider, or a double-submitted request) from creating two payment
  -- records for what is really one transaction. Callers generate this
  -- once per real-world payment attempt and always pass the same value
  -- on retry.
  idempotency_key       text,
  -- Free-form, provider-specific detail that doesn't warrant its own
  -- column (e.g. card brand/last4, PayPal payer email, staff note for a
  -- manually-confirmed bank transfer). Never a place for secrets.
  metadata              jsonb not null default '{}'::jsonb,
  -- Who took the action that produced this row, for methods requiring
  -- staff judgement (bank transfer, cash) rather than an automatic
  -- provider callback. Null for provider-driven methods.
  confirmed_by          uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_payments_tenant on payments (tenant_id);
create index idx_payments_order on payments (order_id);
-- Enforces the idempotency guarantee described above: the same
-- (tenant, method, idempotency_key) combination can only ever produce one
-- row. Partial index — most methods (cash, a first bank-transfer
-- instruction) never supply a key at all, and NULL never collides with
-- NULL under a unique index, so this only activates once a real key is
-- actually provided.
create unique index idx_payments_idempotency on payments (tenant_id, method, idempotency_key) where idempotency_key is not null;
create unique index idx_payments_provider_reference on payments (tenant_id, method, provider_reference) where provider_reference is not null;
alter table payments enable row level security;

-- One row per (tenant, method) — which payment methods a store has
-- turned on, and any NON-SECRET configuration each needs (e.g. a PayPal
-- receiving email, or bank-transfer instructions text shown to the
-- customer). Real provider secrets (a Stripe secret key, a PayPal client
-- secret) must NEVER be stored here or in any other database row readable
-- by normal queries — those belong in environment variables or a proper
-- secrets manager, scoped per-tenant at the application layer, exactly
-- like JWT_SECRET and RESEND_API_KEY already are for the platform itself.
-- This table is intentionally silent on how per-tenant provider secrets
-- are stored; that is decided when each provider is actually implemented
-- (Phase 2 onward), not here.
create table tenant_payment_methods (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  method        text not null check (method in ('stripe', 'paypal', 'bank_transfer', 'cash', 'simulated')),
  enabled       boolean not null default false,
  config        jsonb not null default '{}'::jsonb, -- non-secret only, see comment above
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index idx_tenant_payment_methods_unique on tenant_payment_methods (tenant_id, method);
alter table tenant_payment_methods enable row level security;

-- Phase 2: Stripe Connect fields. stripe_account_id (e.g. 'acct_1AbC...') is
-- Stripe's own PUBLIC identifier for the connected account — not a secret,
-- safe in a normal row, same as a Stripe customer ID would be. No Stripe
-- secret key or OAuth token is ever stored here or anywhere else in this
-- database; those live only in environment variables at the application
-- layer, exactly like JWT_SECRET and RESEND_API_KEY already do.
alter table tenant_payment_methods add column stripe_account_id text;
alter table tenant_payment_methods add column stripe_onboarding_status text
  check (stripe_onboarding_status in ('not_connected', 'pending', 'connected', 'restricted'));

-- Dedicated webhook-event idempotency, keyed on Stripe's OWN event.id — the
-- correct webhook-level identifier, distinct from payments.idempotency_key
-- (which guards against duplicate PAYMENT records, not duplicate webhook
-- DELIVERIES of the same event). Stripe redelivers events on retry/timeout,
-- and this table is what makes reprocessing the same event.id a safe no-op.
create table stripe_webhook_events (
  event_id      text primary key,
  account_id    text,
  event_type    text not null,
  processed_at  timestamptz not null default now()
);
alter table stripe_webhook_events enable row level security;
-- No policies (see comment above the Stripe RLS section) — internal
-- server-only dedupe ledger, denies all normal client access by default.

-- PayPal Connect fields (mirrors Stripe Connect exactly). paypal_merchant_id
-- is the seller's PayPal-assigned merchant ID — a public identifier
-- returned after onboarding, not a secret, safe in a normal row. No
-- PayPal client secret or OAuth access token is ever stored here or
-- anywhere else in this database; those live only in environment
-- variables at the application layer, exactly like the Stripe secret key.
alter table tenant_payment_methods add column paypal_merchant_id text;
alter table tenant_payment_methods add column paypal_onboarding_status text
  check (paypal_onboarding_status in ('not_connected', 'pending', 'connected', 'restricted'));

-- Dedicated PayPal webhook-event idempotency, keyed on PayPal's own event
-- id — NOT the same table as stripe_webhook_events, since PayPal's event
-- id format/namespace is entirely separate from Stripe's, and conflating
-- the two providers' dedupe ledgers would be a genuine correctness risk
-- (a collision between an unrelated Stripe and PayPal event id, however
-- unlikely, should never be possible even in principle).
create table paypal_webhook_events (
  event_id      text primary key,
  merchant_id   text,
  event_type    text not null,
  processed_at  timestamptz not null default now()
);
alter table paypal_webhook_events enable row level security;
-- Same reasoning as stripe_webhook_events: no policies, server-only
-- access via the service-role key.

create table order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references orders (id) on delete cascade,
  tenant_id             uuid not null references tenants (id) on delete cascade, -- denormalized for simple, fast RLS
  product_id            uuid references products (id) on delete set null, -- kept even if the product is later deleted
  -- Snapshotted at purchase time — these must NOT change if the product is edited later:
  name                  text not null,
  sku                   text, -- the product's permanent code at time of purchase — this is what actually survives product deletion for auditing, since product_id above gets nulled out when that happens
  translations          jsonb default '{}'::jsonb,
  price                 numeric(10, 2) not null,
  qty                   int not null check (qty > 0),
  category_name         text not null,
  fulfillment           text not null,
  -- Fulfillment lifecycle:
  status                text not null default 'pending',
  delivery_method       text, -- 'shipping' | 'pickup', only for fulfillment = 'shipping'
  tracking_note         text,
  scheduled_at          timestamptz, -- only for fulfillment = 'booking'
  -- Customer delivery confirmation — deliberately separate from `status`
  -- above. `status = 'delivered'` is the STORE'S claim (staff or courier
  -- update); these fields are the CUSTOMER'S own confirmation, and the two
  -- are never conflated or overwritten by each other. Only meaningful for
  -- fulfillment = 'shipping'.
  customer_confirmed_at       timestamptz, -- set once, when the customer clicks "Confirm Receipt"
  customer_reported_problem   boolean not null default false,
  customer_problem_note       text,
  customer_problem_reported_at timestamptz,
  delivered_at                timestamptz, -- set when status transitions to 'delivered' — the reminder job's reference point
  delivery_reminder_sent_at   timestamptz, -- so the reminder job never sends more than one nudge per item
  -- Digital delivery:
  download_token        text,
  download_window_hours int,
  download_expires_at   timestamptz, -- snapshotted at purchase time (created_at + window) — not recomputed later even if the category's window setting changes afterward
  max_downloads         int,         -- snapshotted at purchase time, same reasoning
  download_used_count   int not null default 0,
  image_download_used_count int not null default 0, -- tracked separately from the file's own count, but checked against the same max_downloads limit — each asset gets its own allowance rather than sharing one counter
  first_downloaded_at   timestamptz, -- set once, the first time the file is actually downloaded — this is what the refund policy checks, and what an audit needs to answer "was this ever accessed?"
  -- Refunds — a full request/decision/payment lifecycle, not just a
  -- boolean flag. `refund_status` is the authoritative state machine:
  -- none -> requested -> (approved -> processed) | rejected
  -- `refund_requested` is kept as a simple boolean alongside `refund_status`
  -- purely for backward compatibility with existing code that already
  -- reads it — new code should treat refund_status as the source of truth.
  refund_requested       boolean not null default false,
  refund_status          text not null default 'none' check (refund_status in ('none', 'requested', 'approved', 'rejected', 'processed')),
  refund_request_reason  text,        -- what the CUSTOMER said when requesting
  refund_requested_at    timestamptz,
  refund_decision_by     text,        -- staff name/email who approved or rejected
  refund_decision_at     timestamptz,
  refund_decision_reason text,        -- staff's own note — especially important for a rejection
  -- The customer's refund destination — NEVER the full card number or CVV,
  -- only a masked last-4 for audit/reference. When a real payment gateway
  -- is integrated, this becomes the gateway's own token/reference id
  -- instead, without changing the shape of this table or the workflow
  -- around it — the payment step already exists as a distinct stage,
  -- deliberately kept separate from the approval decision itself.
  refund_payment_last4   text,
  refunded_at            timestamptz, -- when the (simulated) payment reversal was actually confirmed — the final "processed" step
  refunded_by            text,
  refund_reason          text         -- kept for backward compatibility — mirrors refund_decision_reason once processed
);
create index idx_order_items_order on order_items (order_id);
create index idx_order_items_tenant on order_items (tenant_id);
create index idx_order_items_product on order_items (product_id);

-- -------------------------------------------------------------------------
-- (No password_resets table — Supabase Auth's built-in recovery flow
-- handles this natively: supabase.auth.resetPasswordForEmail(), etc.
-- One less thing for this project's own code to get right.)
-- -------------------------------------------------------------------------

-- -------------------------------------------------------------------------
-- SUPPORT MESSAGES (client <-> store CRM)
-- -------------------------------------------------------------------------
create table support_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  client_id   uuid not null references auth.users (id) on delete cascade,
  subject     text,
  message     text not null,
  reply       text,
  replied_by  text,
  replied_at  timestamptz,
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now()
);
create index idx_support_messages_tenant on support_messages (tenant_id);

-- -------------------------------------------------------------------------
-- PLATFORM CONTACT MESSAGES — not tenant-scoped; goes to Hadam staff, not
-- any specific store, so this table intentionally has no tenant_id.
-- -------------------------------------------------------------------------
create table platform_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- NOTIFICATIONS — the outbox described earlier (subscription reminders,
-- renewal/expiry notices). Real email delivery still needs a provider
-- (Resend/SendGrid/etc.) wired in at the application layer; this table is
-- where the application logs what it sent, regardless of provider.
-- -------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  type        text not null,
  to_email    text not null,
  subject     text not null,
  body        text not null,
  sent_at     timestamptz not null default now()
);
create index idx_notifications_tenant on notifications (tenant_id);

-- =========================================================================
-- ROW LEVEL SECURITY — this is what makes "the database itself prevents
-- data leaks" literally true, not just an application-code convention.
-- Uses auth.uid() directly (Supabase populates this automatically from the
-- verified session on every request — nothing for the application to
-- remember to set up on each request, unlike the session-variable approach).
--
-- Policies below are split by ACTION, not just one blanket rule per table:
-- e.g. any tenant member can browse products, but only an 'admin' can
-- create/edit/delete them; a client can see their OWN orders, but not other
-- clients' orders at the same store, even though they share a tenant_id.
-- =========================================================================

alter table tenants             enable row level security;
alter table plans                enable row level security;
alter table subscriptions        enable row level security;
alter table profiles             enable row level security;
alter table tenant_memberships   enable row level security;
alter table categories           enable row level security;
alter table products             enable row level security;
alter table product_images       enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table support_messages     enable row level security;
alter table notifications        enable row level security;
-- platform_messages has no RLS — it's platform-staff-only, not tenant data.

-- PROFILES: everyone can read their own; only the trigger (security definer)
-- writes new rows. Ordinary users can update their own full_name, but never
-- grant themselves is_superadmin through this policy — that flag should only
-- ever be changed directly (Supabase dashboard / service_role), never through
-- a user-facing update path.
create policy read_own_profile on profiles for select
  using (id = auth.uid() or is_superadmin());
create policy update_own_profile on profiles for update
  using (id = auth.uid() and is_superadmin = false)
  with check (id = auth.uid() and is_superadmin = false);

-- TENANT_MEMBERSHIPS: you can see your own memberships (which stores you
-- belong to, and as what role); a store's admin can see/manage everyone
-- else's membership at THEIR store; superadmin sees everything.
create policy read_own_memberships on tenant_memberships for select
  using (user_id = auth.uid() or is_tenant_admin(tenant_id) or is_superadmin());
-- An admin can add/manage OTHER people's memberships at their own store
-- (inviting employees, adding a second admin, etc.):
create policy admin_manages_memberships on tenant_memberships for insert
  with check (is_tenant_admin(tenant_id) or is_superadmin());
-- Separately: becoming the FOUNDING admin of a brand-new store is a
-- chicken-and-egg case — you can't already be that store's admin before
-- your first membership row exists. Allow it only when the store has no
-- memberships at all yet (i.e. this really is the very first one, right
-- after self-service store creation), and only as 'admin' for yourself:
create policy self_service_founding_admin on tenant_memberships for insert
  with check (
    user_id = auth.uid() and role = 'admin'
    and not exists (select 1 from tenant_memberships tm2 where tm2.tenant_id = tenant_memberships.tenant_id)
  );
-- Separately, and much more commonly: anyone registering as an ordinary
-- customer at ANY existing store — no admin approval needed, since becoming
-- a shopper should never require the store's admin to first let you in.
create policy self_service_client_signup on tenant_memberships for insert
  with check (user_id = auth.uid() and role = 'client');
create policy admin_updates_memberships on tenant_memberships for update
  using (is_tenant_admin(tenant_id) or is_superadmin());
create policy admin_removes_memberships on tenant_memberships for delete
  using (is_tenant_admin(tenant_id) or is_superadmin());

-- PLANS: anyone can read (needed for a public pricing page); only Hadam
-- staff manage the tiers themselves — pricing is a platform-level decision,
-- not something any individual store owner controls.
create policy read_plans on plans for select using (true);
create policy superadmin_manages_plans on plans for insert with check (is_superadmin());
create policy superadmin_updates_plans on plans for update using (is_superadmin());
create policy superadmin_deletes_plans on plans for delete using (is_superadmin());

-- SUBSCRIPTIONS: a store's own admin can see its subscription history;
-- superadmin sees everything (needed for the platform-wide expiry-alert
-- job). No delete policy at all — subscription history is a billing audit
-- trail and should never be deletable through the app, only kept forever.
create policy read_own_subscriptions on subscriptions for select
  using (is_tenant_admin(tenant_id) or is_superadmin());
create policy admin_creates_subscription on subscriptions for insert
  with check (is_tenant_admin(tenant_id) or is_superadmin());
create policy admin_or_system_updates_subscription on subscriptions for update
  using (is_tenant_admin(tenant_id) or is_superadmin());

-- TENANTS: anyone can read (needed for the public storefront/marketplace
-- pages — no login required to browse). Creating a NEW store is self-service
-- — this is the "Sell on Hadam" signup flow, open to any logged-in person,
-- not just Hadam staff. Only that store's own admin (or Hadam staff) can
-- update it afterward; only Hadam staff can outright delete a tenant record.
create policy read_tenants on tenants for select using (true);
create policy authenticated_creates_tenant on tenants for insert
  with check (auth.uid() is not null);
create policy admin_updates_own_tenant on tenants for update
  using (is_tenant_admin(id) or is_superadmin());
create policy superadmin_deletes_tenants on tenants for delete using (is_superadmin());

-- CATEGORIES / PRODUCTS: anyone can browse (public storefront); only that
-- store's admin can create/edit/delete.
create policy read_categories on categories for select using (true);
create policy admin_writes_categories on categories for insert with check (is_tenant_admin(tenant_id));
create policy admin_updates_categories on categories for update using (is_tenant_admin(tenant_id));
create policy admin_deletes_categories on categories for delete using (is_tenant_admin(tenant_id));

create policy read_products on products for select using (true);
create policy admin_writes_products on products for insert with check (is_tenant_admin(tenant_id));
create policy admin_updates_products on products for update using (is_tenant_admin(tenant_id));
create policy admin_deletes_products on products for delete using (is_tenant_admin(tenant_id));

create policy read_product_images on product_images for select using (true);
create policy admin_writes_product_images on product_images for insert with check (is_tenant_admin(tenant_id));
create policy admin_deletes_product_images on product_images for delete using (is_tenant_admin(tenant_id));

-- ORDERS: a client sees and creates only THEIR OWN orders — not other
-- clients' orders at the same store, even though they share a tenant_id.
-- Staff (admin/employee) see and manage every order at their own store.
create policy read_own_or_staff_orders on orders for select
  using (client_id = auth.uid() or is_tenant_staff(tenant_id) or is_superadmin());
create policy client_creates_own_order on orders for insert
  with check (client_id = auth.uid() and is_tenant_member(tenant_id));
create policy staff_updates_orders on orders for update
  using (is_tenant_staff(tenant_id));

-- Order status history: same visibility as the order itself. Insert is
-- allowed for staff (making a status change) AND for the order's own client
-- (needed for the initial 'pending' entry logged at checkout time, which
-- runs under the client's own session, not staff's).
create policy read_own_or_staff_order_status_history on order_status_history for select
  using (is_tenant_staff(tenant_id) or is_superadmin() or exists (select 1 from orders o where o.id = order_status_history.order_id and o.client_id = auth.uid()));
create policy staff_or_own_client_logs_status_change on order_status_history for insert
  with check (is_tenant_staff(tenant_id) or exists (select 1 from orders o where o.id = order_status_history.order_id and o.client_id = auth.uid()));

create policy read_own_or_staff_order_items on order_items for select
  using (
    is_tenant_staff(tenant_id) or is_superadmin()
    or exists (select 1 from orders o where o.id = order_items.order_id and o.client_id = auth.uid())
  );
create policy client_creates_own_order_items on order_items for insert
  with check (exists (select 1 from orders o where o.id = order_items.order_id and o.client_id = auth.uid()));
create policy staff_updates_order_items on order_items for update
  using (is_tenant_staff(tenant_id)); -- fulfillment status changes, refunds

-- PAYMENTS: same visibility shape as orders — a client sees only their own
-- payment records; staff see every payment at their own store. Only staff
-- can insert/update — even for a client-initiated method like a card
-- payment, the record of whether it actually succeeded is something the
-- server decides (via the simulated check today, a real provider
-- callback/webhook later), never something the client's own request can
-- assert directly.
create policy read_own_or_staff_payments on payments for select
  using (client_id = auth.uid() or is_tenant_staff(tenant_id) or is_superadmin());
create policy staff_creates_payments on payments for insert
  with check (is_tenant_staff(tenant_id));
create policy staff_updates_payments on payments for update
  using (is_tenant_staff(tenant_id));

-- TENANT PAYMENT METHODS: only that store's own admin (or superadmin) can
-- view or change which payment methods are enabled and their non-secret
-- configuration. Deliberately admin-only, not staff-wide — enabling a
-- payment method is a business decision, not a day-to-day fulfillment
-- action like an employee's other duties.
create policy admin_manages_payment_methods on tenant_payment_methods for all
  using (is_tenant_admin(tenant_id) or is_superadmin())
  with check (is_tenant_admin(tenant_id) or is_superadmin());
-- A client can flag their own item for a refund request (request-refund route
-- only ever sends {refund_requested: true} for this — actually granting the
-- refund itself still requires staff, via the policy above).
create policy client_requests_own_refund on order_items for update
  using (exists (select 1 from orders o where o.id = order_items.order_id and o.client_id = auth.uid()));

-- SUPPORT MESSAGES: a client sees only their own thread; staff see every
-- thread at their own store.
create policy read_own_or_staff_support on support_messages for select
  using (client_id = auth.uid() or is_tenant_staff(tenant_id) or is_superadmin());
create policy client_creates_own_support_message on support_messages for insert
  with check (client_id = auth.uid() and is_tenant_member(tenant_id));
create policy staff_replies_to_support on support_messages for update
  using (is_tenant_staff(tenant_id));

-- NOTIFICATIONS (the email outbox): store admin can see what was sent about
-- their store; not employees or clients (it may include billing details).
create policy admin_reads_notifications on notifications for select
  using (is_tenant_admin(tenant_id) or is_superadmin());
-- The store's own admin can create a notification about their OWN store (e.g.
-- the renewal flow logs its own "renewed" notice this way). The separate,
-- system-wide subscription-alert job runs under service_role instead, which
-- bypasses RLS entirely by design — see the CONNECTION ROLE note below.
create policy admin_creates_own_notifications on notifications for insert
  with check (is_tenant_admin(tenant_id));
-- A checkout runs under the CUSTOMER's own session, not staff's — so notifying
-- the store owner about a successful payment (or confirming the order to the
-- customer) needs its own, narrower policy: any tenant member can create ONLY
-- these two specific notification types, never anything broader.
create policy member_creates_order_notifications on notifications for insert
  with check (is_tenant_member(tenant_id) and type in ('payment_received', 'order_confirmation'));

-- PRODUCT STOCK MOVEMENTS (inventory audit trail): tenant staff can see their
-- own store's history. No insert/update/delete policy at all — every row is
-- written exclusively by adjust_product_stock(), a security-definer function
-- that bypasses RLS by design, so this table is never writable directly
-- through the normal API even by an admin.
alter table product_stock_movements enable row level security;
create policy staff_reads_own_stock_movements on product_stock_movements for select
  using (is_tenant_staff(tenant_id) or is_superadmin());

-- DOWNLOAD_PRODUCTS: only the store's own admin manages this (uploading the
-- real file for a digital product). Deliberately NO policy at all for
-- regular clients — a customer never queries this table directly; the
-- actual download route looks it up via service_role regardless of the
-- caller's own permissions, then separately enforces "did this specific
-- person actually pay for this" before returning any file content. That
-- separation matters: table-level access here is not what protects the
-- file, the payment/ownership check in the download route is.
alter table download_products enable row level security;
create policy admin_manages_own_download_products on download_products for all
  using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));

-- =========================================================================
-- STORAGE — product images live in Supabase Storage, not the database
-- itself (product_images.storage_path just references them). Create the
-- bucket first (dashboard or API, name: "product-images", NOT public by
-- default — these policies are what actually control access), then run
-- the policies below. Storage path convention: "<tenant_id>/products/<image_id>.<ext>"
-- so foldername(name)[1] recovers the tenant_id straight from the path.
-- =========================================================================

create policy "Public read access to product images"
on storage.objects for select
using (bucket_id = 'product-images');

create policy "Tenant admin can upload own product images"
on storage.objects for insert
with check (
  bucket_id = 'product-images'
  and is_tenant_admin((storage.foldername(name))[1]::uuid)
);

create policy "Tenant admin can delete own product images"
on storage.objects for delete
using (
  bucket_id = 'product-images'
  and is_tenant_admin((storage.foldername(name))[1]::uuid)
);
-- No update policy: images are replaced by deleting and re-uploading, not
-- edited in place — simpler to reason about and matches how the current
-- app.js image-upload UI already works (upload new, delete old).

-- DIGITAL-FILES bucket: unlike product-images, this bucket is NOT public
-- (create it manually in the dashboard with "Public bucket" left OFF). Reads
-- never go through a direct bucket policy at all — every download goes
-- through the payment-gated /api/downloads route, which uses service_role
-- to generate a short-lived signed URL only after confirming the customer
-- actually paid for this specific item. Writes ARE allowed directly to a
-- tenant admin's own folder, though — this is what makes true TUS resumable
-- uploads work using the admin's own session token, instead of routing large
-- file bytes through this server at all.
create policy "Tenant admin can upload own digital files"
on storage.objects for insert
with check (
  bucket_id = 'digital-files'
  and is_tenant_admin((storage.foldername(name))[1]::uuid)
);
create policy "Tenant admin can resume own digital file uploads"
on storage.objects for update
using (
  bucket_id = 'digital-files'
  and is_tenant_admin((storage.foldername(name))[1]::uuid)
);
-- Required even though customers never read this bucket directly (see above):
-- Supabase's upload API performs the INSERT and then reads the new row back
-- to return its details to the client. Without a matching SELECT policy,
-- that read-back fails — and Supabase reports the failure as though the
-- INSERT itself violated RLS, even though the INSERT's own condition was
-- satisfied. This is a documented Supabase behavior, not a guess.
create policy "Tenant admin can read own uploaded digital files"
on storage.objects for select
using (
  bucket_id = 'digital-files'
  and is_tenant_admin((storage.foldername(name))[1]::uuid)
);

-- -------------------------------------------------------------------------
-- A SEPARATE BUCKET, "digital-files" (purchased digital products — ebooks,
-- software, etc.), needs the OPPOSITE security model from product-images
-- above, and deliberately gets NO policies here:
--
-- Product images: "anyone can view" is correct — browsing requires it.
-- Digital product files: the check isn't a role, it's "did THIS PERSON buy
-- THIS SPECIFIC item" — exactly what order_items (download_token,
-- download_window_hours, download_used_count) already tracks. Writing that
-- as a storage RLS policy is possible but fragile; the standard, safer
-- pattern instead:
--   1. Mark the bucket NOT public (Storage → digital-files → bucket
--      settings — this can't be done via SQL, only the dashboard).
--   2. Leave it with zero object policies. With RLS on and no policies,
--      every role except your backend's service_role is denied by default.
--   3. Your Node server verifies the purchase itself (same check the
--      current download endpoint already does), then calls Supabase's
--      createSignedUrl() to hand out a short-lived, one-time link — nobody
--      can reach the file by skipping that check and hitting Storage directly.
-- -------------------------------------------------------------------------


-- =========================================================================
-- MARKETPLACE MEMBERS — "Basic" external sellers who want Marketplace
-- visibility only, without becoming a full Hadam Store tenant. No
-- subdomain, no cart/checkout/payment/order management — purchases are
-- fulfilled entirely on the seller's own external site. Deliberately a
-- separate, lighter table from `tenants`, since these sellers never get a
-- catalog, cart, or any of the full-tenant machinery.
-- =========================================================================
create table marketplace_members (
  id                uuid primary key default gen_random_uuid(),
  business_name     text not null,
  owner_name        text not null,
  email             text not null,
  phone             text,
  country           text,
  city              text,
  address           text,
  website_url       text not null,
  category          text,
  description       text,
  logo_url          text,
  social_links      jsonb not null default '{}', -- { facebook, instagram, linkedin, x, whatsapp, youtube }
  registration_number text,
  vat_number        text,
  plan              text not null default 'free' check (plan in ('free', 'featured')),
  -- Subscription lifecycle: free-plan members have no expiry at all (nothing
  -- to renew), but Featured is a real recurring paid subscription and needs
  -- the same start/expiry tracking every other paid tier in this app has.
  subscription_started_at timestamptz,
  subscription_expires_at timestamptz,
  -- Approval workflow: every application starts pending and is never listed
  -- in the public directory until a superadmin reviews it. 'active' is the
  -- only status the public directory endpoint ever shows. 'expired' is set
  -- automatically (not by an admin) once a Featured subscription's expiry
  -- date passes without renewal.
  status            text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'more_info_requested', 'suspended', 'expired')),
  admin_note        text, -- reason shown to the applicant for rejection / more-info requests
  -- Set once this member upgrades to a full Hadam Store tenant — the
  -- membership record and its info are retained, not deleted, per the
  -- agreed upgrade path (existing business info carries over).
  upgraded_to_tenant_id uuid references tenants(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_marketplace_members_status on marketplace_members (status);

alter table marketplace_members enable row level security;

-- Public read: only fully approved, active members are ever visible in the
-- public directory — pending/rejected/suspended applications are invisible
-- to everyone except platform staff.
create policy "Anyone can view active marketplace members"
on marketplace_members for select
using (status = 'active');

-- Only superadmins (platform staff) manage membership records directly —
-- there's no per-member "admin" login for a Basic seller (they have no
-- Hadam account at all until/unless they upgrade to a full tenant).
create policy "Superadmins manage marketplace members"
on marketplace_members for all
using (is_superadmin())
with check (is_superadmin());

-- =========================================================================
-- EMAIL OTP MFA — a second MFA method alongside TOTP, for users without an
-- authenticator app. A user can enable this independently of (or alongside)
-- TOTP; the login flow offers whichever method(s) are enabled.
-- =========================================================================
create table mfa_email_otp_settings (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  enabled  boolean not null default false
);
alter table mfa_email_otp_settings enable row level security;
create policy "Users manage their own email OTP setting"
on mfa_email_otp_settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table mfa_email_otp_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null, -- never store the plain code, same principle as a password
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_mfa_email_otp_codes_user on mfa_email_otp_codes (user_id, created_at desc);
-- No public RLS policy at all — only the backend's service-role key ever
-- touches this table directly; a code's validity must never be checkable
-- by the client itself.
alter table mfa_email_otp_codes enable row level security;

-- =========================================================================
-- MFA BACKUP CODES — one-time recovery codes generated at enrollment,
-- letting a user get in (or complete password recovery) if their
-- authenticator app or email access is unavailable. Regenerating always
-- invalidates every previous code — there is never more than one active set.
-- =========================================================================
create table mfa_backup_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null, -- never store the plain code, same principle as a password
  used        boolean not null default false,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_mfa_backup_codes_user on mfa_backup_codes (user_id);
-- No public RLS policy at all — only the backend's service-role key ever
-- touches this table directly; a code's validity must never be checkable
-- by the client itself, same principle as the email OTP codes table.
alter table mfa_backup_codes enable row level security;

-- =========================================================================
-- AUTH AUDIT LOG — a record of every security-relevant event, for
-- monitoring and compliance. tenant_id is nullable since some events
-- (superadmin actions, platform-wide account creation) aren't scoped to
-- any one store. user_id is nullable too, since a failed login attempt
-- against a nonexistent email has no real user to attach to — email is
-- captured separately as a point-in-time snapshot either way, since a
-- user row can later be deleted while the log entry must still make sense.
-- =========================================================================
create table auth_audit_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  email        text, -- snapshot at the time of the event, not a live join
  event_type   text not null check (event_type in (
    'login_success', 'login_failure', 'logout',
    'password_reset_requested', 'password_reset_completed',
    'mfa_totp_enrolled', 'mfa_totp_disabled', 'mfa_totp_verify_success', 'mfa_totp_verify_failure',
    'mfa_email_otp_enabled', 'mfa_email_otp_disabled', 'mfa_email_otp_verify_success', 'mfa_email_otp_verify_failure',
    'mfa_backup_codes_generated', 'mfa_backup_code_used', 'mfa_backup_code_verify_failure',
    'account_locked', 'admin_mfa_reset', 'account_created', 'account_deleted'
  )),
  outcome      text not null default 'success' check (outcome in ('success', 'failure')),
  ip_address   text,
  user_agent   text,
  details      jsonb not null default '{}', -- free-form extra context, e.g. { "actingAdminId": "...", "reason": "..." }
  created_at   timestamptz not null default now()
);
create index if not exists idx_auth_audit_log_tenant on auth_audit_log (tenant_id, created_at desc);
create index if not exists idx_auth_audit_log_user on auth_audit_log (user_id, created_at desc);
create index if not exists idx_auth_audit_log_event_type on auth_audit_log (event_type, created_at desc);
-- No public RLS policy — only the backend's service-role key writes and
-- reads this table; the audit trail must not be visible to, or alterable
-- by, the accounts it's recording. The superadmin-only viewer endpoint
-- enforces access at the application layer instead.
alter table auth_audit_log enable row level security;

-- =========================================================================
-- RECOVERY MFA VERIFIED — a short-lived marker proving a password-recovery
-- session already completed its MFA check (via Email OTP or backup code),
-- so the actual password-setting step doesn't need the code re-entered.
-- Splits "verify who you are" from "set the new password" into genuinely
-- separate steps, so a rejected password (e.g. same as current) never
-- reads as if the code itself was somehow wrong.
-- =========================================================================
create table recovery_mfa_verified (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  verified_at  timestamptz not null default now()
);
-- No public RLS policy — only the backend's service-role key touches this;
-- it's an internal handoff between two backend steps, never read by the client.
alter table recovery_mfa_verified enable row level security;

-- =========================================================================
-- CONNECTION ROLE — with Supabase Auth, this part is simpler than the
-- session-variable approach: your Node server (or any Supabase client)
-- should connect using the standard "authenticated" role Supabase already
-- provides (via the anon/publishable key + a user's session token) — NOT
-- the service_role key, which bypasses RLS entirely and would make every
-- policy above a no-op. As long as requests carry a real user's session
-- (which Supabase's client libraries handle for you), auth.uid() resolves
-- automatically and every policy above just works — no SET LOCAL, no
-- custom role creation needed.
--
-- Reserve the service_role key only for genuinely trusted, no-user-context
-- backend jobs (e.g. the hourly subscription-alert check) that intentionally
-- need to see across all tenants — and audit those code paths carefully,
-- since they bypass every policy above by design.
-- =========================================================================

-- =========================================================================
-- USER LANGUAGE PREFERENCES — for email localization. Passively captured
-- (see captureRecipientLang() in server.js) from the X-Lang header on any
-- authenticated request, keyed by email since that's the stable identity
-- across tenants. Looked up at email-send time so notifications reach a
-- recipient in their own language even when they aren't the one who
-- triggered the action that generated the email (e.g. a refund decision
-- made by staff, emailed to the customer).
-- =========================================================================
create table if not exists user_lang_prefs (
  email text primary key,
  lang text not null default 'en' check (lang in ('en', 'ar', 'fr')),
  updated_at timestamptz not null default now()
);
alter table user_lang_prefs enable row level security;
-- No public policies: this table is only ever read/written via the
-- service-role client (supabaseAdmin()) from trusted server code, never
-- directly from the frontend.

NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- Marketplace applicant language — a Marketplace application is submitted
-- via an UNAUTHENTICATED route (no login exists for this flow at all), so
-- the passive user_lang_prefs capture above (which only fires on
-- authenticated requests) can never learn this person's language. Storing
-- it directly on the application record at submission time is the only
-- reliable source for both the "application received" email and the later
-- "reviewed" email, which is sent asynchronously by a superadmin.
-- =========================================================================
alter table marketplace_members add column if not exists lang text not null default 'en' check (lang in ('en', 'ar', 'fr'));

NOTIFY pgrst, 'reload schema';
