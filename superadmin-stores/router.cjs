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

const MEMBER_TABLE = process.env.SA_MARKETPLACE_TABLE || 'marketplace_members';
// Marketplace statuses a superadmin may switch back to "active" directly.
// pending / rejected must go through the normal Marketplace approval flow (payment-gated Featured tier).
const MEMBER_REACTIVATABLE = ['suspended', 'expired', 'deleted', 'inactive', 'cancelled', 'disabled'];

async function loadMembers() {
  try { return { available: true, rows: await fetchAll(MEMBER_TABLE) }; }
  catch (e) { return { available: false, rows: [], error: e.message }; }
}
async function loadSubs() {
  try { return await fetchAll('current_subscriptions'); } catch (_) { return []; }
}
// Same rules as GET /api/platform/directory (the public "Marketplace & Stores" page).
const DIRECTORY_PLANS = ['marketplace', 'both'];
function directoryState(t, expiry) {
  const expired = !!(expiry && new Date(expiry).getTime() < Date.now());
  let reason = null;
  if (t.status !== 'active') reason = 'store_not_active';
  else if (!DIRECTORY_PLANS.includes(t.plan)) reason = 'plan_store_only';
  else if (expired) reason = 'subscription_expired';
  return { listed: !reason, reason, plan: t.plan || null, expiry: expiry || null, expired };
}
async function loadMemberships() {
  try { return await fetchAll('tenant_memberships'); } catch (_) { return []; }
}
function memberView(m, link) {
  return {
    id: m.id,
    status: m.status || null,
    plan: m.plan || null,
    business_name: m.business_name || m.name || null,
    email: m.email || null,
    expires_at: m.subscription_expires_at || null,
    link,
  };
}
const STATUS_RANK = { active: 0, pending: 1, suspended: 2, expired: 3, deleted: 4, rejected: 5 };

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
  const [tenants, members, memberships, subs] = await Promise.all([fetchAll('tenants'), loadMembers(), loadMemberships(), loadSubs()]);
  const expiryByTenant = {};
  for (const s of subs) if (s.tenant_id) expiryByTenant[s.tenant_id] = s.expiry_date || null;
  const ownerKeys = ['owner_id', 'owner_user_id', 'created_by', 'user_id'];

  // Owner user ids per store: tenant owner column + owner/admin memberships.
  const ownersByTenant = {};
  for (const t of tenants) { const o = pick(t, ownerKeys); ownersByTenant[t.id] = o ? [o] : []; }
  for (const ms of memberships) {
    const role = String(ms.role || '').toLowerCase();
    if (ms.tenant_id && ms.user_id && (role === 'owner' || role === 'admin') && ownersByTenant[ms.tenant_id]) {
      if (!ownersByTenant[ms.tenant_id].includes(ms.user_id)) ownersByTenant[ms.tenant_id].push(ms.user_id);
    }
  }
  const allIds = Object.values(ownersByTenant).flat().concat(tenants.map((t) => t.deleted_by));
  const emails = await emailMap(allIds);

  // Owner emails per store (lowercase) and reverse lookup email -> stores.
  const ownerEmails = {};
  const storesByEmail = {};
  for (const t of tenants) {
    const set = new Set();
    const direct = pick(t, ['owner_email', 'email']);
    if (direct) set.add(String(direct).toLowerCase());
    for (const uid of ownersByTenant[t.id]) if (emails[uid]) set.add(emails[uid].toLowerCase());
    ownerEmails[t.id] = [...set];
    for (const e of set) (storesByEmail[e] = storesByEmail[e] || []).push(t.id);
  }

  // Link marketplace memberships to stores: upgraded_to_tenant_id first, then same owner email.
  const memberByTenant = {};
  const unlinked = [];
  for (const m of members.rows) {
    let tid = null, link = null;
    if (m.upgraded_to_tenant_id && ownersByTenant[m.upgraded_to_tenant_id]) { tid = m.upgraded_to_tenant_id; link = 'upgraded'; }
    else {
      const hits = storesByEmail[String(m.email || '').toLowerCase()] || [];
      if (hits.length === 1) { tid = hits[0]; link = 'email'; }
    }
    if (!tid) { unlinked.push(m); continue; }
    const cur = memberByTenant[tid];
    const rank = (x) => (x.status in STATUS_RANK ? STATUS_RANK[x.status] : 9);
    if (!cur || rank(m) < rank(cur.m)) memberByTenant[tid] = { m, link };
  }

  const rows = tenants.map((t) => {
    const mm = memberByTenant[t.id];
    return {
      kind: 'store',
      id: t.id,
      name: pick(t, ['name', 'store_name', 'display_name', 'title']) || '(no name)',
      subdomain: pick(t, ['subdomain', 'slug', 'domain']),
      status: t.status || 'active',
      store_plan: t.plan || null,
      owner_email: ownerEmails[t.id][0] || null,
      created_at: t.created_at || null,
      deleted_at: t.deleted_at || null,
      deleted_by_email: t.deleted_by ? emails[t.deleted_by] || t.deleted_by : null,
      marketplace: mm ? memberView(mm.m, mm.link) : null,
      directory: directoryState(t, expiryByTenant[t.id]),
    };
  });
  for (const m of unlinked) {
    rows.push({
      kind: 'member',
      id: 'member:' + m.id,
      name: m.business_name || m.name || '(no name)',
      subdomain: null,
      status: null,
      store_plan: null,
      owner_email: m.email || null,
      created_at: m.created_at || null,
      marketplace: memberView(m, null),
    });
  }
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  sendJson(res, 200, {
    tenants: rows,
    marketplace: { available: members.available, table: MEMBER_TABLE, total: members.rows.length, error: members.error || null },
    reactivatable: MEMBER_REACTIVATABLE,
  });
}

async function audit(user, event, details) {
  try {
    await admin().from('auth_audit_log').insert({ event_type: event, user_id: user.id, email: user.email, details });
  } catch (_) { /* best effort */ }
}

// Check (without changing anything) whether a store / membership can be activated.
async function checkStore(id) {
  const { data: t, error } = await admin().from('tenants').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!t) return { error: 'store_not_found', code: 404 };
  if (t.status === 'active') return { error: 'store_already_active', code: 409, detail: 'Store is already active.' };
  return { t };
}
async function checkMember(id) {
  const { data: m, error } = await admin().from(MEMBER_TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!m) return { error: 'marketplace_not_found', code: 404 };
  if (m.status === 'active') return { error: 'marketplace_already_active', code: 409, detail: 'Member listing is already active.' };
  if (!MEMBER_REACTIVATABLE.includes(m.status)) {
    return { error: 'marketplace_needs_approval', code: 409, detail: 'Status is "' + m.status + '" — approve it through the normal Marketplace approvals.' };
  }
  if (m.plan === 'featured' && m.subscription_expires_at && new Date(m.subscription_expires_at) < new Date()) {
    return { error: 'marketplace_subscription_expired', code: 409, detail: 'Featured subscription ended ' + String(m.subscription_expires_at).slice(0, 10) + ' — use Renew so it is not expired again.' };
  }
  return { m };
}

// Put a store back on the public Marketplace & Stores directory (plan 'store' -> 'both').
async function checkDirectory(id, storeWillBeActive) {
  const { data: t, error } = await admin().from('tenants').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!t) return { error: 'store_not_found', code: 404 };
  let expiry = null;
  try {
    const { data: s } = await admin().from('current_subscriptions').select('expiry_date').eq('tenant_id', id).maybeSingle();
    expiry = s && s.expiry_date;
  } catch (_) {}
  if (expiry && new Date(expiry).getTime() < Date.now()) {
    return { error: 'subscription_expired', code: 409, detail: 'Store subscription ended ' + String(expiry).slice(0, 10) + ' — renew the subscription to list it again.' };
  }
  if (t.status !== 'active' && !storeWillBeActive) {
    return { error: 'store_not_active', code: 409, detail: 'Activate the store first (or use Activate both).' };
  }
  const needPlan = !DIRECTORY_PLANS.includes(t.plan);
  return { t, needPlan };
}
async function applyDirectory(d) {
  if (!d.needPlan) return d.t;
  const { data, error } = await admin().from('tenants').update({ plan: 'both' }).eq('id', d.t.id).select('*').maybeSingle();
  if (error) throw error;
  return data;
}

async function activateStore(t) {
  const patch = { status: RESTORE_STATUS };
  if ('deleted_at' in t) patch.deleted_at = null;
  if ('deleted_by' in t) patch.deleted_by = null;
  const { data, error } = await admin().from('tenants').update(patch).eq('id', t.id).eq('status', t.status).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('store changed while activating — reload and try again');
  return data;
}
async function activateMember(m) {
  const patch = { status: 'active' };
  if ('deleted_at' in m) patch.deleted_at = null;
  if ('deleted_by' in m) patch.deleted_by = null;
  const { data, error } = await admin().from(MEMBER_TABLE).update(patch).eq('id', m.id).eq('status', m.status).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('marketplace listing changed while activating — reload and try again');
  return data;
}

// POST /api/sa-stores/activate  { what: 'store'|'marketplace'|'both', tenant_id, member_id }
// For a store, "marketplace" = be listed on the public directory (plan + subscription) AND
// re-activate its linked marketplace membership if it has one that can be re-activated.
async function activate(req, res, body) {
  const what = body.what;
  if (!['store', 'marketplace', 'both'].includes(what)) return sendJson(res, 400, { error: 'bad_request' });
  const wantStore = what !== 'marketplace';
  const wantMarket = what !== 'store';
  if (wantStore && !body.tenant_id) return sendJson(res, 400, { error: 'store_missing' });
  if (wantMarket && !body.tenant_id && !body.member_id) return sendJson(res, 400, { error: 'no_marketplace_listing' });

  // 1) Check everything first so nothing is half-applied.
  let s = null, d = null, mm = null;
  if (wantStore) {
    s = await checkStore(body.tenant_id);
    if (s.error && !(s.error === 'store_already_active' && what === 'both')) return sendJson(res, s.code, { error: s.error, detail: s.detail });
    if (s.error) s = null;
  }
  let dirNote = null, memNote = null;
  if (wantMarket && body.tenant_id) {
    d = await checkDirectory(body.tenant_id, !!s);
    if (d.error) { dirNote = d; d = null; }
  }
  if (wantMarket && body.member_id) {
    mm = await checkMember(body.member_id);
    if (mm.error) { memNote = mm; mm = null; }
  }
  // Nothing on the marketplace side can be done -> report the most useful reason.
  if (wantMarket && !(d && d.needPlan) && !mm && !s) {
    const why = dirNote || memNote;
    if (why) return sendJson(res, why.code, { error: why.error, detail: why.detail });
  }
  if (!s && !(d && d.needPlan) && !mm) {
    return sendJson(res, 409, { error: 'nothing_to_activate', detail: 'Already active and listed — nothing to change.' });
  }

  // 2) Apply.
  const out = {};
  if (s) {
    const t = await activateStore(s.t);
    out.store = { id: t.id, status: t.status };
    await audit(req.saUser, 'store_restored', { tenant_id: t.id, subdomain: s.t.subdomain || null, from: s.t.status, to: t.status });
    console.log('[superadmin-stores] ' + req.saUser.email + ' activated store ' + t.id + ' (' + (s.t.subdomain || '') + ') from ' + s.t.status);
  }
  if (d && d.needPlan) {
    const t = await applyDirectory(d);
    out.directory = { id: t.id, plan: t.plan };
    await audit(req.saUser, 'store_listed_in_marketplace', { tenant_id: t.id, subdomain: d.t.subdomain || null, plan_from: d.t.plan, plan_to: t.plan });
    console.log('[superadmin-stores] ' + req.saUser.email + ' listed store ' + t.id + ' (' + (d.t.subdomain || '') + ') in marketplace: plan ' + d.t.plan + ' -> ' + t.plan);
  }
  if (mm) {
    const m = await activateMember(mm.m);
    out.marketplace = { id: m.id, status: m.status };
    await audit(req.saUser, 'marketplace_reactivated', { member_id: m.id, business_name: mm.m.business_name || null, from: mm.m.status, to: m.status });
    console.log('[superadmin-stores] ' + req.saUser.email + ' activated marketplace member ' + m.id + ' (' + (mm.m.business_name || '') + ') from ' + mm.m.status);
  }
  const notes = [dirNote, memNote].filter(Boolean).map((n) => n.detail || n.error);
  sendJson(res, 200, Object.assign({ ok: true, notes }, out));
}

// Check (without changing anything) whether a store can move to a given status. Mirrors
// checkStore()'s shape above, but for the suspend/delete direction instead of activate.
// Not restricted to only-from-active on purpose (same flexibility checkStore() has for
// activate) -- the UI only ever calls this when a store is active, but the route itself
// just guards against a no-op (already in that status), same as checkStore() does.
async function checkStoreForStatusChange(id, targetStatus) {
  const { data: t, error } = await admin().from('tenants').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!t) return { error: 'store_not_found', code: 404 };
  if (t.status === targetStatus) return { error: 'store_already_' + targetStatus, code: 409, detail: 'Store is already ' + targetStatus + '.' };
  return { t };
}
async function suspendStore(t) {
  const { data, error } = await admin().from('tenants').update({ status: 'suspended' }).eq('id', t.id).eq('status', t.status).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('store changed while suspending — reload and try again');
  return data;
}
async function deleteStoreRow(t, deletedByUserId) {
  const patch = { status: 'deleted' };
  if ('deleted_at' in t) patch.deleted_at = new Date().toISOString();
  if ('deleted_by' in t) patch.deleted_by = deletedByUserId;
  const { data, error } = await admin().from('tenants').update(patch).eq('id', t.id).eq('status', t.status).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('store changed while deleting — reload and try again');
  return data;
}

// POST /api/sa-stores/suspend  { tenant_id }
async function suspend(req, res, body) {
  if (!body.tenant_id) return sendJson(res, 400, { error: 'store_missing' });
  const s = await checkStoreForStatusChange(body.tenant_id, 'suspended');
  if (s.error) return sendJson(res, s.code, { error: s.error, detail: s.detail });
  const t = await suspendStore(s.t);
  await audit(req.saUser, 'store_suspended', { tenant_id: t.id, subdomain: s.t.subdomain || null, from: s.t.status, to: t.status });
  console.log('[superadmin-stores] ' + req.saUser.email + ' suspended store ' + t.id + ' (' + (s.t.subdomain || '') + ') from ' + s.t.status);
  sendJson(res, 200, { ok: true, store: { id: t.id, status: t.status } });
}

// POST /api/sa-stores/delete  { tenant_id }  -- soft delete only: status='deleted' plus
// deleted_at/deleted_by, the same fields activateStore() already clears on reactivation,
// so this stays reversible via the existing Activate store button. No hard delete.
async function removeStore(req, res, body) {
  if (!body.tenant_id) return sendJson(res, 400, { error: 'store_missing' });
  const s = await checkStoreForStatusChange(body.tenant_id, 'deleted');
  if (s.error) return sendJson(res, s.code, { error: s.error, detail: s.detail });
  const t = await deleteStoreRow(s.t, req.saUser.id);
  await audit(req.saUser, 'store_deleted', { tenant_id: t.id, subdomain: s.t.subdomain || null, from: s.t.status, to: t.status });
  console.log('[superadmin-stores] ' + req.saUser.email + ' deleted store ' + t.id + ' (' + (s.t.subdomain || '') + ') from ' + s.t.status);
  sendJson(res, 200, { ok: true, store: { id: t.id, status: t.status } });
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
    if (req.method === 'POST' && url === '/api/sa-stores/activate') {
      const body = await readJsonBody(req);
      if (await checkSuperadmin(req, res)) await activate(req, res, body);
      return true;
    }
    if (req.method === 'POST' && url === '/api/sa-stores/suspend') {
      const body = await readJsonBody(req);
      if (await checkSuperadmin(req, res)) await suspend(req, res, body);
      return true;
    }
    if (req.method === 'POST' && url === '/api/sa-stores/delete') {
      const body = await readJsonBody(req);
      if (await checkSuperadmin(req, res)) await removeStore(req, res, body);
      return true;
    }
    const m = url.match(/^\/api\/sa-stores\/tenants\/([^/]+)\/restore$/);
    if (req.method === 'POST' && m) {
      if (await checkSuperadmin(req, res)) await activate(req, res, { what: 'store', tenant_id: decodeURIComponent(m[1]) });
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
