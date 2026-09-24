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
 * Self-contained: does its own auth check (valid Supabase session + profiles.is_superadmin = true
 * + a 6-digit code emailed to the superadmin via Resend). Hook into server.js (plain http):
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

const crypto = require('crypto');
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@hadamplatform.com';
const VERIFY_SECRET = process.env.SA_VERIFY_SECRET || SERVICE_KEY || crypto.randomBytes(32).toString('hex');
const CODE_TTL_MS = 10 * 60 * 1000;      // email code valid 10 minutes
const CODE_MAX_TRIES = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const PASS_TTL_MS = 8 * 60 * 60 * 1000;   // verified for 8 hours
const pendingCodes = new Map();           // userId -> { hash, exp, tries, sentAt }

function sha(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function sign(v) { return crypto.createHmac('sha256', VERIFY_SECRET).update(v).digest('base64url'); }
function makePass(userId) {
  const exp = Date.now() + PASS_TTL_MS;
  const body = userId + '.' + exp;
  return { pass: Buffer.from(body).toString('base64url') + '.' + sign(body), exp };
}
function passValid(pass, userId) {
  if (!pass || typeof pass !== 'string') return false;
  const [b, sig] = pass.split('.');
  if (!b || !sig) return false;
  const body = Buffer.from(b, 'base64url').toString('utf8');
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const [uid, exp] = body.split('.');
  return uid === userId && Number(exp) > Date.now();
}
function maskEmail(e) {
  const [u, d] = String(e || '').split('@');
  return d ? u.slice(0, 2) + '***@' + d : '';
}

// Signed-in superadmin check WITHOUT the second step (used to send/verify the email code).
async function authSuperadmin(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return { code: 401, error: 'not_signed_in' };
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data || !data.user) return { code: 401, error: 'invalid_session' };
  const { data: prof, error: pErr } = await admin()
    .from('profiles').select('is_superadmin').eq('id', data.user.id).maybeSingle();
  if (pErr) return { code: 500, error: 'profile_lookup_failed', detail: pErr.message };
  if (!prof || prof.is_superadmin !== true) return { code: 403, error: 'not_superadmin' };
  return { user: data.user, token };
}

// Full check: superadmin + second step (email code pass, or an existing aal2 session).
async function requireSuperadmin(req, res, next) {
  try {
    const a = await authSuperadmin(req);
    if (a.error) return res.status(a.code).json({ error: a.error, detail: a.detail });
    const emailOk = passValid(req.headers['x-sa-verify'], a.user.id);
    if (!emailOk && jwtPayload(a.token).aal !== 'aal2') return res.status(403).json({ error: 'verification_required' });
    req.saUser = a.user;
    next();
  } catch (e) {
    res.status(500).json({ error: 'auth_check_failed', detail: e.message });
  }
}

async function sendCodeEmail(to, code) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set on the server');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Hadam <' + FROM_EMAIL + '>',
      to: [to],
      subject: 'Your Hadam superadmin verification code: ' + code,
      text: 'Your Hadam superadmin verification code is ' + code + '.\n\nIt expires in 10 minutes. If you did not try to sign in, change your password now.',
      html: '<p>Your Hadam superadmin verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">' + code +
        '</p><p>It expires in 10 minutes. If you did not try to sign in, change your password now.</p>',
    }),
  });
  if (!r.ok) throw new Error('Email service error ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

async function sendCode(req, res) {
  const a = await authSuperadmin(req);
  if (a.error) return sendJson(res, a.code, { error: a.error, detail: a.detail });
  const prev = pendingCodes.get(a.user.id);
  if (prev && Date.now() - prev.sentAt < RESEND_COOLDOWN_MS) {
    return sendJson(res, 429, { error: 'wait_before_resend', seconds: Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - prev.sentAt)) / 1000) });
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await sendCodeEmail(a.user.email, code);
  pendingCodes.set(a.user.id, { hash: sha(a.user.id + ':' + code), exp: Date.now() + CODE_TTL_MS, tries: 0, sentAt: Date.now() });
  console.log('[superadmin-stores] verification code emailed to ' + a.user.email);
  sendJson(res, 200, { sent: true, to: maskEmail(a.user.email) });
}

async function verifyCode(req, res) {
  const body = await readJsonBody(req);
  const a = await authSuperadmin(req);
  if (a.error) return sendJson(res, a.code, { error: a.error, detail: a.detail });
  const p = pendingCodes.get(a.user.id);
  if (!p || p.exp < Date.now()) { pendingCodes.delete(a.user.id); return sendJson(res, 400, { error: 'code_expired' }); }
  p.tries += 1;
  if (p.tries > CODE_MAX_TRIES) { pendingCodes.delete(a.user.id); return sendJson(res, 429, { error: 'too_many_attempts' }); }
  const code = String(body.code || '').replace(/\D/g, '');
  if (sha(a.user.id + ':' + code) !== p.hash) return sendJson(res, 400, { error: 'wrong_code', tries_left: CODE_MAX_TRIES - p.tries });
  pendingCodes.delete(a.user.id);
  const { pass, exp } = makePass(a.user.id);
  console.log('[superadmin-stores] email code verified for ' + a.user.email);
  sendJson(res, 200, { ok: true, pass, expires_at: exp });
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
    if (req.method === 'GET' && url === '/superadmin/stores/nav.js') {
      sendFile(res, path.join(HERE, 'nav.js'), 'application/javascript; charset=utf-8'); return true;
    }
    if (req.method === 'GET' && url === '/api/sa-stores/whoami') {
      const a = await authSuperadmin(req);
      sendJson(res, 200, a.error ? { superadmin: false, reason: a.error } : { superadmin: true });
      return true;
    }
    if (req.method === 'GET' && url === '/api/sa-stores/config') {
      sendJson(res, 200, { url: SUPABASE_URL, anonKey: ANON_KEY || null }); return true;
    }
    if (req.method === 'GET' && url === '/api/sa-stores/tenants') {
      if (await checkSuperadmin(req, res)) await listTenants(req, res);
      return true;
    }
    if (req.method === 'POST' && url === '/api/sa-stores/email-code/send') { await sendCode(req, res); return true; }
    if (req.method === 'POST' && url === '/api/sa-stores/email-code/verify') { await verifyCode(req, res); return true; }
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
