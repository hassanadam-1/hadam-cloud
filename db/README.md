# Database schema (PostgreSQL / Supabase, Supabase Auth edition)

`schema.sql` is a complete, real relational schema for Supabase — tenants,
profiles, tenant_memberships, categories, products, product images,
orders/order items, support messages, notifications — with Row Level
Security policies enforcing tenant isolation and per-role permissions at
the database level, not just in application code.

**Status: written, not yet run against a live database.** This sandbox has
no network access to any Postgres instance, real or local — confirmed
directly (`apt-get install postgresql` and even `npm install pg` both
returned 403 Forbidden here). Run this in your Supabase project's SQL
Editor and check it there before relying on it.

**Important for deployment: this file is only safe to run in full against
a brand-new, empty Supabase project.** Most of the `create table`
statements do not use `if not exists`, so re-running the whole file
against a project that already has some or all of this schema applied
will error out on the first table that already exists. If your Supabase
project already has this schema from an earlier session, only the newer
additions near the end of the file are relevant — those specifically DO
use `if not exists` / `add column if not exists` and are safe to re-run:
the `user_lang_prefs` table and the `marketplace_members.lang` column.
Check what your project already has (Table Editor, or `\dt` in SQL Editor)
before deciding whether to run the whole file or just those two additions.

## The decision this schema is built around

After weighing it directly: Hadam migrates to **Supabase Auth** as its
identity layer, replacing the custom JWT/password system, because it's the
higher-security choice for a project that will hold real customer data and
real payments — no `SET LOCAL` step to forget on every request (a known,
real risk with connection pooling), and auth code maintained by many eyes
instead of one project's own.

**One login works across all of Hadam.** The same email/password can be a
customer at one store and staff at another — role is a separate fact,
stored per (person, store) pair in `tenant_memberships`, not baked into the
login itself.

## What this is NOT yet

This schema is the foundation, not the finished migration. It does **not**
include the `server.js` rewrite — every route currently reads/writes an
in-memory JS object; moving to this means:

1. Replacing the custom auth code (`hashPassword`, `signToken`, `verifyToken`,
   the login/register/forgot-password routes) with Supabase's client SDK.
2. Rewriting every route's data access into real Supabase queries.
3. Re-testing every one of the 178 existing tests against the real thing,
   since a live database behaves differently from an in-memory array in
   ways that only show up under real testing (this is genuinely necessary,
   not a formality).

## Suggested order of operations

1. Create a Supabase project.
2. Run `schema.sql` in the SQL Editor. Fix anything Supabase's Postgres
   version complains about — I couldn't verify this end to end.
3. Create a Storage bucket for product images (referenced by
   `product_images.storage_path`).
4. Come back and we'll do the `server.js` + auth rewrite against your real
   project, so it can actually be tested as we go instead of guessed at.
