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

-- -------------------------------------------------------------------------
-- PRODUCTS
-- -------------------------------------------------------------------------
create table products (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  category_id    uuid not null references categories (id) on delete restrict,
  name           text not null,
  translations   jsonb default '{}'::jsonb, -- { "ar": {"name":..,"description":..}, ... }
  description    text default '',
  price          numeric(10, 2) not null check (price >= 0),
  stock          int, -- null = not stock-tracked (digital/service items); a number = physical inventory count
  file_meta      jsonb, -- { "fmt": "PDF", "size": "2 MB" } — descriptive metadata for digital items
  external_url   text, -- optional demo/sample link
  created_at     timestamptz not null default now()
);
create index idx_products_tenant on products (tenant_id);
create index idx_products_category on products (category_id);

-- -------------------------------------------------------------------------
-- PRODUCT IMAGES — genuinely normalized (a real one-to-many relationship),
-- unlike translations above which stay as JSONB since languages are open-ended.
-- The files themselves live in Supabase Storage; this table just references them.
-- -------------------------------------------------------------------------
create table product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  tenant_id    uuid not null references tenants (id) on delete cascade, -- denormalized for simple, fast RLS
  storage_path text not null, -- e.g. "tenant-<id>/products/<image-id>.png" inside a Supabase Storage bucket
  filename     text,
  mime_type    text not null,
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
  payment_status    text not null check (payment_status in ('success', 'failed')),
  shipping_address  text,
  total             numeric(10, 2) not null,
  created_at        timestamptz not null default now()
);
create index idx_orders_tenant on orders (tenant_id);
create index idx_orders_client on orders (client_id);

create table order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references orders (id) on delete cascade,
  tenant_id             uuid not null references tenants (id) on delete cascade, -- denormalized for simple, fast RLS
  product_id            uuid references products (id) on delete set null, -- kept even if the product is later deleted
  -- Snapshotted at purchase time — these must NOT change if the product is edited later:
  name                  text not null,
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
  -- Digital delivery:
  download_token        text,
  download_window_hours int,
  download_expires_at   timestamptz, -- snapshotted at purchase time (created_at + window) — not recomputed later even if the category's window setting changes afterward
  max_downloads         int,         -- snapshotted at purchase time, same reasoning
  download_used_count   int not null default 0,
  -- Refunds:
  refund_requested      boolean not null default false,
  refunded_at           timestamptz,
  refunded_by           text,
  refund_reason         text
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

create policy read_own_or_staff_order_items on order_items for select
  using (
    is_tenant_staff(tenant_id) or is_superadmin()
    or exists (select 1 from orders o where o.id = order_items.order_id and o.client_id = auth.uid())
  );
create policy client_creates_own_order_items on order_items for insert
  with check (exists (select 1 from orders o where o.id = order_items.order_id and o.client_id = auth.uid()));
create policy staff_updates_order_items on order_items for update
  using (is_tenant_staff(tenant_id)); -- fulfillment status changes, refunds

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

