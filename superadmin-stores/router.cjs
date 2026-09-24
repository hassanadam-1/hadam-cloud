'use strict';
/**
 * Hadam — Superadmin Stores (standalone add-on)
 *
 *   Page:  /superadmin/stores
 *   API:   /api/sa-stores/*
 *
 * Features: stores overview (counts per status), find-a-store search,
 * stores with / without a marketplace listing, and Restore for deleted stores.
 *
 * Self-contained: does its own Supabase auth check (valid session + MFA (aal2)
 * + profiles.is_superadmin = true). Hook into server.js (plain http):
 *     const saStores = require('./superadmin-stores/router.cjs');   // near the top
 *     if (await saStores(req, res)) return;   // first line inside http.createServer(async (req, res) => {
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://leodrmnlmbthyixehfve.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MARKET_TABLES = process.env.SA_MARKETPLACE_TABLE
  ? [process.env.SA_MARKETPLACE_TABLE]
  : ['marketplace_listings', 'marketplace_members', 'marketplace_sellers', 'marketplace_stores'];
const RESTORE_STATUS = process.env.SA_RESTORE_STATUS || 'active';

let _admin = null;
function admin() {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  if (!_admin) {
    _admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

function jwtPayload(token) {
  try {
    const part = token.split('.')[1];
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (_) {
    return {};
  }
}

async function requireSuperadmin(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'not_signed_in' });

    const { data, error } = await admin().auth.getUser(token);
    if (error || !data || !data.user) return res.status(401).json({ error: 'invalid_session' });

    if (jwtPayload(token).aal !== 'aal2') return res.status(403).json({ error: 'mfa_required' });

    const { data: prof, error: pErr } = await admin()
      .from('profiles').select('is_superadmin').eq('id', data.user.id).maybeSingle();
    if (pErr) return res.status(500).json({ error: 'profile_lookup_failed', detail: pErr.message });
    if (!prof || prof.is_superadmin !== true) return res.status(403).json({ error: 'not_superadmin' });

    req.saUser = data.user;
    next();
  } catch (e) {
    res.status(500).json({ error: 'auth_check_failed', detail: e.message });
  }
}

// Fetch every row of a table (Supabase caps a single select at 1000 rows).
async function fetchAll(table) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await admin().from(table).select('*').range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}

async function loadMarketplace() {
  for (const table of MARKET_TABLES) {
    try {
      const rows = await fetchAll(table);
      const sample = rows[0] || {};
      const col = ['tenant_id', 'store_id', 'tenant'].find((c) => c in sample) || 'tenant_id';
      const byTenant = {};
      for (const r of rows) {
        const tid = r[col];
        if (tid == null) continue;
        (byTenant[tid] = byTenant[tid] || []).push({
          id: r.id,
          status: r.status || r.approval_status || null,
          tier: r.tier || r.plan || null,
          name: r.name || r.title || r.business_name || null,
        });
      }
      return { available: true, table, column: col, total: rows.length, byTenant };
    } catch (_) {
      // table does not exist or not readable — try the next candidate
    }
  }
  return { available: false, table: null, byTenant: {} };
}

// Emails of owners / deleters, looked up in pages (projects have 265+ users).
async function emailMap(ids) {
  const want = new Set(ids.filter(Boolean));
  const map = {};
  if (!want.size) return map;
  for (let page = 1; page <= 50 && Object.keys(map).length < want.size; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data || !data.users || !data.users.length) break;
    for (const u of data.users) if (want.has(u.id)) map[u.id] = u.email;
    if (data.users.length < 1000) break;
  }
  return map;
}

function pick(t, keys) {
  for (const k of keys) if (t[k] != null && t[k] !== '') return t[k];
  return null;
}

const HERE = __dirname;

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function sendFile(res, file, type) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}
function supabaseUmdPath() {
  try {
    let dir = path.dirname(require.resolve('@supabase/supabase-js'));
    while (path.basename(dir) !== 'dist' && dir !== path.dirname(dir)) dir = path.dirname(dir);
    const file = path.join(dir, 'umd', 'supabase.js');
    if (fs.existsSync(file)) return file;
  } catch (_) { /* ignore */ }
  return null;
}
// Runs requireSuperadmin (written Express-style) against plain http req/res.
function checkSuperadmin(req, res) {
  return new Promise((resolve) => {
    const shim = { status(c) { return { json(o) { sendJson(res, c, o); resolve(false); } }; } };
    requireSuperadmin(req, shim, () => resolve(true));
  });
}

async function listTenants(req, res) {
  const [tenants, market] = await Promise.all([fetchAll('tenants'), loadMarketplace()]);
  const ownerKeys = ['owner_id', 'owner_user_id', 'created_by', 'user_id'];
  const emails = await emailMap(tenants.flatMap((t) => [pick(t, ownerKeys), t.deleted_by]));
  const rows = tenants.map((t) => {
    const listings = market.byTenant[t.id] || [];
    const ownerId = pick(t, ownerKeys);
    return {
      id: t.id,
      name: pick(t, ['name', 'store_name', 'display_name', 'title']) || '(no name)',
      subdomain: pick(t, ['subdomain', 'slug', 'domain']),
      status: t.status || 'active',
      owner_email: pick(t, ['owner_email', 'email']) || emails[ownerId] || null,
      created_at: t.created_at || null,
      deleted_at: t.deleted_at || null,
      deleted_by_email: t.deleted_by ? emails[t.deleted_by] || t.deleted_by : null,
      has_marketplace: listings.length > 0,
      marketplace: listings,
    };
  });
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  sendJson(res, 200, {
    tenants: rows,
    marketplace: { available: market.available, table: market.table, total: market.total || 0 },
    restore_status: RESTORE_STATUS,
  });
}

async function restoreTenant(req, res, id) {
  const { data: t, error } = await admin().from('tenants').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!t) return sendJson(res, 404, { error: 'store_not_found' });
  if (t.status !== 'deleted') return sendJson(res, 409, { error: 'store_not_deleted', status: t.status });
  const patch = { status: RESTORE_STATUS };
  if ('deleted_at' in t) patch.deleted_at = null;
  if ('deleted_by' in t) patch.deleted_by = null;
  const { data: upd, error: uErr } = await admin()
    .from('tenants').update(patch).eq('id', id).eq('status', 'deleted').select('*').maybeSingle();
  if (uErr) throw uErr;
  if (!upd) return sendJson(res, 409, { error: 'restore_conflict' });
  try {
    await admin().from('auth_audit_log').insert({
      event_type: 'store_restored', user_id: req.saUser.id, email: req.saUser.email,
      details: { tenant_id: id, subdomain: t.subdomain || null, restored_to: RESTORE_STATUS },
    });
  } catch (_) { /* best effort */ }
  console.log(`[superadmin-stores] ${req.saUser.email} restored tenant ${id} (${t.subdomain || ''})`);
  sendJson(res, 200, { ok: true, tenant: { id: upd.id, status: upd.status } });
}

/**
 * Plain Node http handler. Returns true if it handled the request, false otherwise.
 * In server.js, first line inside http.createServer(async (req, res) => { ... }):
 *     if (await saStores(req, res)) return;
 */
async function handle(req, res) {
  const url = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (!url.startsWith('/superadmin/stores') && !url.startsWith('/api/sa-stores')) return false;
  try {
    if (req.method === 'GET' && url === '/superadmin/stores') {
      sendFile(res, path.join(HERE, 'page.html'), 'text/html; charset=utf-8'); return true;
    }
    if (req.method === 'GET' && url === '/superadmin/stores/page.js') {
      sendFile(res, path.join(HERE, 'page.js'), 'application/javascript; charset=utf-8'); return true;
    }
    if (req.method === 'GET' && url === '/superadmin/stores/supabase.js') {
      const f = supabaseUmdPath();
      if (f) sendFile(res, f, 'application/javascript; charset=utf-8');
      else { res.writeHead(302, { Location: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js' }); res.end(); }
      return true;
    }
    if (req.method === 'GET' && url === '/api/sa-stores/config') {
      sendJson(res, 200, { url: SUPABASE_URL, anonKey: ANON_KEY || null }); return true;
    }
    if (req.method === 'GET' && url === '/api/sa-stores/tenants') {
      if (await checkSuperadmin(req, res)) await listTenants(req, res);
      return true;
    }
    const m = url.match(/^\/api\/sa-stores\/tenants\/([^/]+)\/restore$/);
    if (req.method === 'POST' && m) {
      if (await checkSuperadmin(req, res)) await restoreTenant(req, res, decodeURIComponent(m[1]));
      return true;
    }
    sendJson(res, 404, { error: 'not_found' });
    return true;
  } catch (e) {
    if (!res.headersSent) sendJson(res, 500, { error: 'server_error', detail: e.message });
    return true;
  }
}

module.exports = handle;
