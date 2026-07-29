/**
 * Hadam — multi-tenant cloud commerce platform (API server)
 * ---------------------------------------------------------------
 * Zero external dependencies (Node core only) — runs anywhere with
 * `node server.js`, no npm install, no build step, no native deps
 * to fail on a fresh cloud box.
 *
 * MULTI-TENANCY
 * The root domain (hadam.com, or `localhost` for local dev) is the
 * PLATFORM: a landing page, self-service "create your store" flow,
 * and a superadmin view over all tenants. It sells nothing itself.
 *
 * Every tenant lives at <subdomain>.hadam.com (or <subdomain>.localhost
 * locally) and gets the full store engine — auth, catalog, cart,
 * checkout, fulfillment, three role-based dashboards — as shared
 * infrastructure. New tenants start with NO products or categories;
 * the tenant's own admin defines their categories and products from
 * their dashboard. Tenant data (users, categories, products, orders)
 * is strictly isolated by tenantId and by which subdomain the request
 * came in on — a token issued for one tenant is rejected on another.
 *
 * Storage: data/db.json (see DATA LAYER below) — swap for a real
 * managed database before relying on this under concurrent traffic.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'hadam-dev-secret-change-in-production';
const BASE_DOMAIN = (process.env.HADAM_BASE_DOMAIN || 'hadam.com').toLowerCase();
const DB_PATH = process.env.HADAM_DB_PATH || path.join(__dirname, 'data', 'db.json');
const SEED_PATH = path.join(__dirname, 'data', 'seed.json');
const TENANT_PUBLIC_DIR = path.join(__dirname, 'public');
const PLATFORM_PUBLIC_DIR = path.join(__dirname, 'public-platform');

const SEED_PASSWORDS = {
  'u-super': 'super123', 'u-admin': 'admin123', 'u-emp1': 'employee123', 'u-client1': 'client123',
};
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'app', 'admin', 'static', 'assets', 'mail', 'platform']);
const LANG_CODE_RE = /^[a-z]{2,8}$/;

/**
 * Rate limiting for the endpoints most worth protecting against scripted abuse:
 * login (credential stuffing / brute force), registration and tenant creation
 * (spam signups), and password-reset requests (enumeration/spam). This is a
 * sliding window per client IP, in-memory — fine for a single process; behind
 * a load balancer with multiple instances, move this to a shared store (Redis)
 * so limits apply across all of them, and add IP reputation/CAPTCHA/WAF-level
 * protection in front for a real production deployment — this is one layer,
 * not the whole defense.
 */
const rateLimitBuckets = new Map();
function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (rateLimitBuckets.get(key) || []).filter(ts => now - ts < windowMs);
  arr.push(now);
  rateLimitBuckets.set(key, arr);
  return arr.length <= limit;
}
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
function rateLimited(req, res, bucket, limit, windowMinutes) {
  const ok = checkRateLimit(`${bucket}:${getClientIp(req)}`, limit, windowMinutes * 60 * 1000);
  if (!ok) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(windowMinutes * 60), 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Too many attempts. Please wait a few minutes and try again.' }));
  }
  return !ok;
}
function mergeTranslations(record, incoming, allowedFields) {
  if (incoming === undefined) return null;
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) return 'translations must be an object keyed by language code, e.g. { "fr": { "name": "..." } }.';
  record.translations = record.translations || {};
  for (const [lang, fields] of Object.entries(incoming)) {
    if (!LANG_CODE_RE.test(lang)) return `"${lang}" is not a valid language code (use 2-8 lowercase letters, e.g. ar, fr, es).`;
    if (typeof fields !== 'object' || fields === null) return `translations.${lang} must be an object.`;
    record.translations[lang] = record.translations[lang] || {};
    for (const field of allowedFields) {
      if (fields[field] !== undefined) record.translations[lang][field] = String(fields[field]);
    }
  }
  return null;
}
const PLATFORM_CATEGORIES = ['Design', 'Education', 'Stationery', 'Electronics', 'Books', 'Food & Drink', 'Software', 'Accessories', 'Other'];
const TENANT_PLANS = ['store', 'marketplace', 'both'];
/**
 * Subscription tiers. This is a real, enforced feature (product limits are
 * actually checked below) — what is NOT real is recurring billing: there is
 * no payment gateway wired in here, so selecting a paid tier does not
 * actually charge anyone $29/$99 a month. Treat monthlyFee/commissionRate as
 * the numbers a real billing integration (Stripe Billing, etc.) would use.
 */
const SUBSCRIPTION_TIERS = {
  starter: { maxProducts: 10, commissionRate: 0.15, monthlyFee: 0 },
  professional: { maxProducts: 100, commissionRate: 0.08, monthlyFee: 29 },
  enterprise: { maxProducts: null, commissionRate: 0.03, monthlyFee: 99 }, // null = unlimited
};

/**
 * Subscription lifecycle. A tenant's plan (store/marketplace/both) runs on a 30-day cycle
 * with an expiry date; renewing extends it another 30 days and lets the owner change which
 * plan variant they're renewing as. Alert thresholds below are used to decide when a renewal
 * reminder is due (1 month / 2 weeks / 1 week out) — see checkSubscriptionAlerts().
 */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ALERT_THRESHOLDS_DAYS = [30, 14, 7]; // "a month", "two weeks", "a week" before expiry

function daysUntilExpiry(tenant) {
  if (!tenant.subscriptionExpiresAt) return null;
  return Math.ceil((tenant.subscriptionExpiresAt - Date.now()) / (24 * 60 * 60 * 1000));
}
function subscriptionAlertLevel(tenant) {
  const days = daysUntilExpiry(tenant);
  if (days === null) return null;
  if (days <= 0) return 'expired';
  if (days <= 7) return '1_week';
  if (days <= 14) return '2_weeks';
  if (days <= 30) return '1_month';
  return null;
}

/* =========================================================
   NOTIFICATIONS — the actual email-sending is NOT wired to a real provider
   (no network access to test one from this environment). sendEmail() below
   logs the exact email that would be sent into db.notifications, viewable
   by the store admin, so the trigger logic and content are real and tested
   — swapping in a real provider (Resend, SendGrid, etc.) later is a single
   function body to replace, not a design change.
========================================================= */
async function sendEmail({ to, subject, body, tenantId, type }) {
  const notification = { id: newId('note'), tenantId, type, to, subject, body, sentAt: Date.now() };
  db.notifications = db.notifications || [];
  db.notifications.push(notification);
  await persist();
  return notification;
}
function findUserToNotify(tenantId) {
  // The store's own admin is who gets subscription notices.
  return db.users.find(u => u.tenantId === tenantId && u.role === 'admin');
}
async function sendRenewalReminder(tenant, alertLevel) {
  const admin = findUserToNotify(tenant.id);
  if (!admin) return null;
  const labels = { '1_month': 'in 1 month', '2_weeks': 'in 2 weeks', '1_week': 'in 1 week' };
  return sendEmail({
    to: admin.email, tenantId: tenant.id, type: `renewal_reminder_${alertLevel}`,
    subject: `Your Hadam subscription for "${tenant.name}" expires ${labels[alertLevel]}`,
    body: `Hi ${admin.name},\n\nYour store "${tenant.name}" (plan: ${tenant.plan}) is set to expire ${labels[alertLevel]}, on ${new Date(tenant.subscriptionExpiresAt).toDateString()}.\n\nRenew anytime from Admin → Store Settings to keep your store (and Marketplace listing, if applicable) running without interruption.\n\n— Hadam Marketplace`,
  });
}
async function sendRenewedNotice(tenant) {
  const admin = findUserToNotify(tenant.id);
  if (!admin) return null;
  return sendEmail({
    to: admin.email, tenantId: tenant.id, type: 'renewed',
    subject: `Your Hadam subscription for "${tenant.name}" has been renewed`,
    body: `Hi ${admin.name},\n\nYour store "${tenant.name}" has been renewed as: ${tenant.plan}. Your new expiry date is ${new Date(tenant.subscriptionExpiresAt).toDateString()}.\n\nThank you for staying with Hadam Marketplace.\n\n— Hadam Marketplace`,
  });
}
async function sendExpiredNotice(tenant) {
  const admin = findUserToNotify(tenant.id);
  if (!admin) return null;
  return sendEmail({
    to: admin.email, tenantId: tenant.id, type: 'expired',
    subject: `Your Hadam subscription for "${tenant.name}" has expired`,
    body: `Hi ${admin.name},\n\nYour store "${tenant.name}"'s subscription expired on ${new Date(tenant.subscriptionExpiresAt).toDateString()} without being renewed.\n\nYour store and data are safe — you can renew anytime from Admin → Store Settings to pick up right where you left off.\n\n— Hadam Marketplace`,
  });
}
/**
 * Runs the alert/expiry checks for every tenant once. In a real deployment this would be
 * called by a scheduled job (cron, etc.); here it's also called on a repeating in-process
 * timer (see setInterval near the bottom of this file) AND exposed as an endpoint so it can
 * be triggered deterministically in tests and via the admin dashboard.
 */
async function checkSubscriptionAlerts() {
  const sent = [];
  for (const tenant of db.tenants) {
    if (tenant.status !== 'active' || !tenant.subscriptionExpiresAt) continue;
    const level = subscriptionAlertLevel(tenant);
    if (!level) continue;
    tenant.lastAlertLevel = tenant.lastAlertLevel || null;
    if (level === 'expired') {
      if (tenant.lastAlertLevel !== 'expired') {
        sent.push(await sendExpiredNotice(tenant));
        tenant.lastAlertLevel = 'expired';
      }
    } else if (tenant.lastAlertLevel !== level) {
      sent.push(await sendRenewalReminder(tenant, level));
      tenant.lastAlertLevel = level;
    }
  }
  await persist();
  return sent.filter(Boolean);
}

/* =========================================================
   DATA LAYER — pluggable: file (default, tested) / postgres / mongo (reference).
   Every other part of the file only touches `db` (in memory) and calls
   persist() below — swapping backends never requires touching route logic.
   See store/index.js for how the backend is selected (HADAM_DB_DRIVER).
========================================================= */
const { createStore } = require('./store');
const dataStore = createStore({ dbPath: DB_PATH, seedPath: SEED_PATH, seedPasswordHasher: hashPassword, seedPasswords: SEED_PASSWORDS });

let db; // populated by initDb() — the server does not start listening until this resolves
async function initDb() {
  db = await dataStore.load();
  // Forward-compatible defaults for stores created before these collections existed.
  db.resets = db.resets || [];
  db.messages = db.messages || [];
  db.platformMessages = db.platformMessages || [];
  db.notifications = db.notifications || [];
  db.tenants.forEach(t => { if (!t.subscriptionExpiresAt) t.subscriptionExpiresAt = Date.now() + THIRTY_DAYS_MS; });
  db.tenants.forEach(t => { if (!t.plan) t.plan = 'both'; if (t.tagline === undefined) t.tagline = ''; if (!t.subscriptionTier) t.subscriptionTier = 'starter'; });
}
async function persist() { await dataStore.save(db); }

/* =========================================================
   AUTH — password hashing (scrypt) + hand-rolled JWT (HMAC)
========================================================= */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(check));
}
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function signToken(payload, expSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Date.now(), exp: Date.now() + expSeconds * 1000 };
  const data = `${b64url(header)}.${b64url(body)}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function verifyToken(token) {
  try {
    const [h, p, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

/* =========================================================
   TENANT RESOLUTION — Host header -> platform | tenant
========================================================= */
function resolveHost(hostHeader) {
  const host = (hostHeader || '').split(':')[0].toLowerCase();
  for (const base of [BASE_DOMAIN, 'localhost']) {
    if (host === base || host === 'www.' + base) return { isPlatform: true, subdomain: null };
    if (host.endsWith('.' + base)) {
      const sub = host.slice(0, host.length - base.length - 1).split('.')[0];
      return { isPlatform: false, subdomain: sub };
    }
  }
  // Unknown host (e.g. a bare sandbox hostname/IP during local testing) — treat as platform
  // so the app is still reachable; production DNS should always match BASE_DOMAIN.
  return { isPlatform: true, subdomain: null, unknownHost: true };
}

/* =========================================================
   HELPERS (all tenant-scoped lookups take tenantId explicitly)
========================================================= */
function findTenantBySubdomain(sub) { return db.tenants.find(t => t.subdomain === sub); }
async function findTenantBySubdomainAsync(sub) {
  if (AUTH_DRIVER === 'supabase') {
    if (!sub) return null;
    const { data, error } = await supabaseAnon.from('tenants').select('*').eq('subdomain', sub).maybeSingle();
    if (error) { console.error('[tenant lookup error]', sub, error.message); return null; }
    return data ? rowToTenant(data) : null;
  }
  return findTenantBySubdomain(sub);
}
function findUserByEmail(email, tenantId) {
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.tenantId === tenantId);
}
function findSuperadminByEmail(email) {
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.role === 'superadmin');
}
function findCategory(id, tenantId) { return db.categories.find(c => c.id === id && c.tenantId === tenantId); }
function findProduct(id, tenantId) { return db.products.find(p => p.id === id && p.tenantId === tenantId); }
function publicUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role, tenantId: u.tenantId }; }
function newId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function refreshItemStatus(item) {
  if (item.fulfillment === 'download' && item.status === 'ready' && Date.now() > item.downloadExpiresAt) item.status = 'expired';
  return item;
}
function orderForClient(order) { order.items.forEach(refreshItemStatus); return order; }

/** Maps a Supabase order_items row into the same camelCase shape the frontend already expects. */
function orderItemRowToItem(row) {
  return {
    productId: row.product_id, name: row.name, translations: row.translations || {}, price: Number(row.price), qty: row.qty,
    categoryName: row.category_name, fulfillment: row.fulfillment, status: row.status,
    deliveryMethod: row.delivery_method, trackingNote: row.tracking_note, scheduledAt: row.scheduled_at,
    downloadToken: row.download_token, downloadWindowHours: row.download_window_hours,
    downloadExpiresAt: row.download_expires_at ? new Date(row.download_expires_at).getTime() : null,
    maxDownloads: row.max_downloads, downloadsUsed: row.download_used_count,
    refundRequested: row.refund_requested, refundedAt: row.refunded_at, refundedBy: row.refunded_by, refundReason: row.refund_reason,
  };
}
/** Maps a Supabase order row (with its order_items already fetched) into the client-facing shape. */
function orderRowForClient(row) {
  const order = {
    id: row.id, tenantId: row.tenant_id, clientId: row.client_id, total: Number(row.total),
    paymentStatus: row.payment_status, shippingAddress: row.shipping_address, createdAt: row.created_at,
    items: (row.order_items || []).map(orderItemRowToItem),
  };
  order.items.forEach(refreshItemStatus);
  return order;
}

/* =========================================================
   MINI ROUTER
   opts.hostScope: 'tenant' (default) | 'platform' | 'any'
   opts.auth: boolean   opts.roles: [role,...]
========================================================= */
const routes = [];
function route(method, pattern, opts, handler) {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  opts.hostScope = opts.hostScope || 'tenant';
  const paramNames = [];
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, seg => { paramNames.push(seg.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ method, regex, paramNames, opts, handler });
}
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(pathname);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 5_000_000) req.destroy(); });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', // stops browsers guessing a different content-type than declared, a real MIME-sniffing attack vector
  'X-Frame-Options': 'DENY', // stops this site being embedded in an <iframe> elsewhere — the standard clickjacking defense
  'Referrer-Policy': 'strict-origin-when-cross-origin', // don't leak full URLs (which can contain tokens/IDs) to third-party sites via the Referer header
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains', // once real HTTPS is in front of this (see README), forces browsers to only ever use HTTPS for two years — has no effect over plain HTTP, so it's safe to send now and just as important once TLS is added
};
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}
function authenticate(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return db.users.find(u => u.id === payload.sub) || null;
}

/**
 * AUTH_DRIVER: 'custom' (default — the tested system, unchanged, all 179
 * tests run against this) or 'supabase' (real Supabase Auth — see lib/auth.js).
 * Deliberately a branch here rather than a full parallel adapter file: the
 * two systems' data models are different enough (embedded JWT role vs.
 * per-tenant membership lookup) that forcing them through one identical
 * interface would obscure more than it'd simplify. This keeps the tested
 * default path completely untouched while making the Supabase path real,
 * reviewable code — not a rewrite of everything at once.
 */
const AUTH_DRIVER = process.env.HADAM_AUTH_DRIVER || 'custom';
const authSupabase = AUTH_DRIVER === 'supabase' ? require('./lib/auth') : null;
const { supabaseAnon, supabaseForRequest, supabaseAdmin } = AUTH_DRIVER === 'supabase' ? require('./lib/supabaseClient') : {};

/** Assembles the same {id, name, email, role, tenantId} shape the rest of
 * server.js already expects, regardless of which identity system verified it. */
async function authenticateSupabase(req, tenant, hostCtx) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  let supaUser;
  try { supaUser = await authSupabase.getUserFromToken(token); } catch { return null; }
  const profile = await authSupabase.getProfile(token);
  if (hostCtx.isPlatform) {
    if (!profile.is_superadmin) return null;
    return { id: supaUser.id, name: profile.full_name || supaUser.email, email: supaUser.email, role: 'superadmin', tenantId: null };
  }
  const role = await authSupabase.getMembership(token, tenant.id);
  if (!role) return null; // authenticated identity, but no membership at THIS store
  return { id: supaUser.id, name: profile.full_name || supaUser.email, email: supaUser.email, role, tenantId: tenant.id };
}

function bearerToken(req) {
  const header = req.headers['authorization'] || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
/** Maps between our JS camelCase field names and Postgres's snake_case columns for categories. */
function categoryToRow(cat, tenantId) {
  return {
    tenant_id: tenantId, name: cat.name, translations: cat.translations || {}, group: cat.group, fulfillment: cat.fulfillment,
    description: cat.description || '', download_window_hours: cat.downloadWindowHours, max_downloads: cat.maxDownloads,
    allow_pickup: !!cat.allowPickup, custom_type_name: cat.customTypeName, platform_category: cat.platformCategory,
  };
}
/** Maps a Supabase tenants row into the camelCase shape the frontend expects. */
function rowToTenant(row) {
  return {
    id: row.id, subdomain: row.subdomain, name: row.name, tagline: row.tagline || '', aboutText: row.about_text || '',
    translations: row.translations || {}, plan: row.plan, status: row.status, closedBySelf: row.closed_by_self,
    createdAt: row.created_at,
  };
}
function rowToCategory(row) {
  return {
    id: row.id, tenantId: row.tenant_id, name: row.name, translations: row.translations || {}, group: row.group, fulfillment: row.fulfillment,
    description: row.description, downloadWindowHours: row.download_window_hours, maxDownloads: row.max_downloads,
    allowPickup: row.allow_pickup, customTypeName: row.custom_type_name, platformCategory: row.platform_category, createdAt: row.created_at,
  };
}

/* =========================================================
   PLATFORM ROUTES (root domain only — no products live here)
========================================================= */
route('GET', '/api/platform/tenants', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res) => {
  const tenants = db.tenants.map(t => ({
    ...t,
    productCount: db.products.filter(p => p.tenantId === t.id).length,
    orderCount: db.orders.filter(o => o.tenantId === t.id).length,
    userCount: db.users.filter(u => u.tenantId === t.id).length,
    revenue: db.orders.filter(o => o.tenantId === t.id && o.paymentStatus === 'success').flatMap(o => o.items).filter(i => i.status !== 'refunded').reduce((s, i) => s + i.price * i.qty, 0),
  }));
  send(res, 200, { tenants, baseDomain: BASE_DOMAIN });
});

/**
 * Manually trigger the subscription-expiry alert check (normally also run automatically every
 * hour by the in-process timer near the bottom of this file — see checkSubscriptionAlerts()).
 * Exposed here so tests can trigger it deterministically instead of waiting for real time to
 * pass, and so a real deployment could wire an external cron to call it too.
 */
route('POST', '/api/platform/run-subscription-checks', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res) => {
  const sent = await checkSubscriptionAlerts();
  send(res, 200, { checked: db.tenants.length, notificationsSent: sent.length });
});

/**
 * Test-only backdoor: lets the automated test suite set a tenant's subscription expiry
 * directly, so alert-threshold behavior (1 month / 2 weeks / 1 week / expired) can be tested
 * deterministically instead of waiting for real days to pass. Gated behind an explicit env
 * flag that the test runner sets — returns 404 (as if the route doesn't exist) otherwise, so
 * this is never reachable in a real deployment even if the URL were guessed.
 */
route('PATCH', '/api/test-only/tenants/:id/expiry', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (process.env.HADAM_TEST_MODE !== '1') return send(res, 404, { error: 'Not found.' });
  const tenant = db.tenants.find(t => t.id === params.id);
  if (!tenant) return send(res, 404, { error: 'Tenant not found.' });
  tenant.subscriptionExpiresAt = Number(body.subscriptionExpiresAt);
  if (body.resetAlertLevel) tenant.lastAlertLevel = null;
  await persist();
  send(res, 200, { tenant });
});


/* Public directory of active stores — "Seller Stores" on the platform site. No auth: this is a marketing/discovery page. */
/* Public directory of Marketplace-listed stores. hostScope 'any': reachable both from the
   platform root AND from any tenant's own subdomain, so every store's "Stores" page can show
   the same directory. A "store"-plan tenant sells anything but stays OFF this shared listing —
   that's what the plan actually gates now, not what kind of product a store can sell. */
route('GET', '/api/platform/directory', { hostScope: 'any' }, async (req, res) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data: tenants, error } = await supabaseAnon.from('tenants').select('*').eq('status', 'active').in('plan', ['marketplace', 'both']);
    if (error) return send(res, 500, { error: error.message });
    const stores = [];
    for (const t of tenants) {
      const { count } = await supabaseAnon.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
      stores.push({ subdomain: t.subdomain, name: t.name, tagline: t.tagline || '', translations: t.translations || {}, plan: t.plan, productCount: count || 0 });
    }
    return send(res, 200, { stores, baseDomain: BASE_DOMAIN });
  }
  const stores = db.tenants.filter(t => t.status === 'active' && ['marketplace', 'both'].includes(t.plan)).map(t => ({
    subdomain: t.subdomain, name: t.name, tagline: t.tagline || '', translations: t.translations || {}, plan: t.plan,
    productCount: db.products.filter(p => p.tenantId === t.id).length,
  }));
  send(res, 200, { stores, baseDomain: BASE_DOMAIN });
});

/* Cross-store marketplace browse — "Browse products from all seller stores". No auth: public discovery.
   Same listing rule as the directory above: only marketplace|both-plan stores appear here. */
route('GET', '/api/platform/marketplace/products', { hostScope: 'any' }, async (req, res, params, body, query) => {
  const wantCategory = query.get('category');
  const q = (query.get('q') || '').toLowerCase();
  if (AUTH_DRIVER === 'supabase') {
    const { data: tenants, error: tenantsErr } = await supabaseAnon.from('tenants').select('id, name, translations, subdomain').eq('status', 'active').in('plan', ['marketplace', 'both']);
    if (tenantsErr) return send(res, 500, { error: tenantsErr.message });
    const byId = Object.fromEntries(tenants.map(t => [t.id, t]));
    const tenantIds = tenants.map(t => t.id);
    if (tenantIds.length === 0) return send(res, 200, { products: [], categories: PLATFORM_CATEGORIES });
    const { data: rows, error } = await supabaseAnon.from('products').select('*, categories(*)').in('tenant_id', tenantIds);
    if (error) return send(res, 500, { error: error.message });
    let list = rows.map(row => {
      const t = byId[row.tenant_id];
      return { ...rowToProduct(row), storeName: t.name, storeTranslations: t.translations || {}, storeSubdomain: t.subdomain };
    });
    if (wantCategory) list = list.filter(p => p.category.platformCategory === wantCategory);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    return send(res, 200, { products: list, categories: PLATFORM_CATEGORIES });
  }
  let list = [];
  db.tenants.filter(t => t.status === 'active' && ['marketplace', 'both'].includes(t.plan)).forEach(t => {
    db.products.filter(p => p.tenantId === t.id).forEach(p => {
      const cat = findCategory(p.categoryId, t.id);
      if (!cat) return;
      if (wantCategory && cat.platformCategory !== wantCategory) return;
      if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return;
      list.push({ ...p, category: cat, storeName: t.name, storeTranslations: t.translations || {}, storeSubdomain: t.subdomain });
    });
  });
  send(res, 200, { products: list, categories: PLATFORM_CATEGORIES });
});

route('GET', '/api/platform/marketplace/categories', { hostScope: 'any' }, async (req, res) => {
  send(res, 200, { categories: PLATFORM_CATEGORIES });
});

route('POST', '/api/platform/contact', { hostScope: 'platform' }, async (req, res, params, body) => {
  const { name, email, message } = body;
  if (!name || !email || !message) return send(res, 400, { error: 'Name, email, and a message are required.' });
  if (AUTH_DRIVER === 'supabase') {
    const { error } = await supabaseAnon.from('platform_messages').insert({ name, email, message: message.slice(0, 2000) });
    if (error) return send(res, 400, { error: error.message });
    return send(res, 201, { ok: true });
  }
  db.platformMessages.push({ id: newId('pm'), name, email, message: message.slice(0, 2000), createdAt: Date.now(), status: 'open' });
  await persist();
  send(res, 201, { ok: true });
});

route('GET', '/api/platform/contact', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res) => {
  send(res, 200, { messages: [...db.platformMessages].sort((a, b) => b.createdAt - a.createdAt) });
});

route('POST', '/api/platform/tenants', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'create-tenant', 30, 5)) return;
  const { subdomain, storeName, adminName, adminEmail, adminPassword, plan, tagline, subscriptionTier, card } = body;
  const sub = (subdomain || '').toLowerCase().trim();
  if (!/^[a-z0-9-]{2,30}$/.test(sub)) return send(res, 400, { error: 'Subdomain must be 2-30 lowercase letters, numbers, or hyphens.' });
  if (RESERVED_SUBDOMAINS.has(sub)) return send(res, 400, { error: 'That subdomain is reserved. Please choose another.' });
  if (!storeName || !adminName || !adminEmail || !adminPassword || adminPassword.length < 6) {
    return send(res, 400, { error: 'Store name, your name, email, and a 6+ character password are all required.' });
  }
  const chosenPlan = TENANT_PLANS.includes(plan) ? plan : null;
  if (!chosenPlan) return send(res, 400, { error: `plan must be one of: ${TENANT_PLANS.join(', ')}.` });
  const chosenTier = subscriptionTier || 'starter';

  if (AUTH_DRIVER === 'supabase') {
    const { data: existingTenant } = await supabaseAnon.from('tenants').select('id').eq('subdomain', sub).maybeSingle();
    if (existingTenant) return send(res, 409, { error: 'That subdomain is already taken.' });

    // One Hadam-wide identity: if this email already has an account (they're a
    // customer somewhere, or run another store), sign them in with the password
    // given here rather than creating a second identity — that's the same
    // account claiming a new store, not a new person.
    let session, adminUser;
    try {
      const result = await authSupabase.register(adminEmail, adminPassword, adminName);
      session = result.session; adminUser = result.user;
    } catch {
      try {
        const result = await authSupabase.login(adminEmail, adminPassword);
        session = result.session; adminUser = result.user;
      } catch {
        return send(res, 409, { error: 'That email is already registered with a different password. Log in with your existing Hadam password instead.' });
      }
    }
    if (!session) return send(res, 200, { ok: true, note: 'Check your email to confirm your account, then try creating the store again.' });

    const { data: planRow, error: planErr } = await supabaseAnon.from('plans').select('*').eq('name', chosenTier).maybeSingle();
    if (planErr) return send(res, 500, { error: planErr.message });
    if (!planRow) return send(res, 400, { error: `Unknown subscription tier: ${chosenTier}. (Make sure the plans table has been seeded.)` });
    const tierFee = Number(planRow.monthly_price), planId = planRow.id;
    if (tierFee > 0) {
      const cardDigits = (card && card.number || '').replace(/\s/g, '');
      if (cardDigits.length < 12) return send(res, 400, { error: 'A valid card number is required for a paid plan.' });
      if (cardDigits.replace(/0/g, '').length === 0) return send(res, 402, { error: 'Payment declined. Try a different card, or choose the free Starter tier.' });
    }

    const client = supabaseForRequest(session.access_token);
    const { data: tenantRow, error: tenantErr } = await client.from('tenants').insert({ subdomain: sub, name: storeName, plan: chosenPlan, tagline: (tagline || '').slice(0, 200) }).select().single();
    if (tenantErr) return send(res, 400, { error: tenantErr.message });
    const { error: memberErr } = await client.from('tenant_memberships').insert({ user_id: adminUser.id, tenant_id: tenantRow.id, role: 'admin' });
    if (memberErr) return send(res, 400, { error: memberErr.message });
    if (planId) {
      const { error: subErr } = await client.from('subscriptions').insert({ tenant_id: tenantRow.id, plan_id: planId, expiry_date: new Date(Date.now() + THIRTY_DAYS_MS).toISOString().slice(0, 10), payment_status: 'paid' });
      if (subErr) console.error('[subscription insert error]', subErr.message);
    }
    return send(res, 201, {
      tenant: rowToTenant(tenantRow), storeUrl: `https://${sub}.${BASE_DOMAIN}`,
      user: { id: adminUser.id, name: adminName, email: adminEmail, role: 'admin', tenantId: tenantRow.id }, token: session.access_token,
    });
  }

  if (findTenantBySubdomain(sub)) return send(res, 409, { error: 'That subdomain is already taken.' });
  const tier = SUBSCRIPTION_TIERS[chosenTier] ? chosenTier : 'starter';
  const existingStore = db.tenants.find(t => t.status === 'active' && db.users.some(u => u.tenantId === t.id && u.role === 'admin' && u.email.toLowerCase() === adminEmail.toLowerCase()));
  if (existingStore) {
    return send(res, 409, { error: `You already have a store (${existingStore.name}, at ${existingStore.subdomain}.${BASE_DOMAIN}) registered with this email. Log in there to manage it, or use a different email to create another store.` });
  }
  // Starter is free — no payment step needed. A paid tier (Professional/Enterprise) requires a
  // simulated card, same success/decline pattern as checkout (all-zero card = decline), and the
  // store is never created if that payment fails.
  const tierFee = SUBSCRIPTION_TIERS[tier].monthlyFee;
  if (tierFee > 0) {
    const cardDigits = (card && card.number || '').replace(/\s/g, '');
    if (cardDigits.length < 12) return send(res, 400, { error: 'A valid card number is required for a paid plan.' });
    const paymentSucceeded = cardDigits.replace(/0/g, '').length > 0;
    if (!paymentSucceeded) return send(res, 402, { error: 'Payment declined. Try a different card, or choose the free Starter tier.' });
  }
  const tenant = { id: newId('t'), subdomain: sub, name: storeName, status: 'active', plan: chosenPlan, subscriptionTier: tier, tagline: (tagline || '').slice(0, 200), createdAt: Date.now(), subscriptionExpiresAt: Date.now() + THIRTY_DAYS_MS };
  db.tenants.push(tenant);
  // Tenants start with NO categories or products — infrastructure only.
  // The tenant's own admin defines their catalog from their dashboard,
  // constrained to what their chosen plan allows (see category creation).
  const admin = { id: newId('u'), name: adminName, email: adminEmail, passwordHash: hashPassword(adminPassword), role: 'admin', tenantId: tenant.id, createdAt: Date.now() };
  db.users.push(admin);
  await persist();
  send(res, 201, {
    tenant, storeUrl: `https://${sub}.${BASE_DOMAIN}`,
    user: publicUser(admin), token: signToken({ sub: admin.id, role: admin.role, tenantId: admin.tenantId }),
  });
});

route('PATCH', '/api/platform/tenants/:id', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res, params, body) => {
  const tenant = db.tenants.find(t => t.id === params.id);
  if (!tenant) return send(res, 404, { error: 'Tenant not found.' });
  if (body.status && ['active', 'suspended'].includes(body.status)) tenant.status = body.status;
  await persist();
  send(res, 200, { tenant });
});

/* =========================================================
   AUTH ROUTES — tenant-scoped for regular users, platform-scoped
   for the superadmin. hostScope 'any' so one route handles both,
   branching on which host the request came in on.
========================================================= */
route('POST', '/api/auth/register', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  if (rateLimited(req, res, 'register', 30, 5)) return;
  if (tenant.closedBySelf) return send(res, 403, { error: 'This store is temporarily closed and is not accepting new accounts right now.' });
  const { name, email, password } = body;
  if (!name || !email || !password) return send(res, 400, { error: 'Name, email, and password are required.' });
  if (password.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters.' });
  if (AUTH_DRIVER === 'supabase') {
    try {
      const { user: supaUser, session } = await authSupabase.register(email, password, name);
      if (!session) return send(res, 200, { ok: true, note: 'Check your email to confirm your account before logging in.' });
      await authSupabase.joinTenant(session.access_token, tenant.id, 'client');
      return send(res, 201, { user: { id: supaUser.id, name, email, role: 'client', tenantId: tenant.id }, token: session.access_token });
    } catch (e) { return send(res, 409, { error: e.message }); }
  }
  if (findUserByEmail(email, tenant.id)) return send(res, 409, { error: 'An account with that email already exists for this store.' });
  const u = { id: newId('u'), name, email, passwordHash: hashPassword(password), role: 'client', tenantId: tenant.id, createdAt: Date.now() };
  db.users.push(u);
  await persist();
  send(res, 201, { user: publicUser(u), token: signToken({ sub: u.id, role: u.role, tenantId: u.tenantId }) });
});

route('POST', '/api/auth/login', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {
  if (rateLimited(req, res, 'login', 30, 5)) return;
  const { email, password } = body;
  if (AUTH_DRIVER === 'supabase') {
    try {
      const { user: supaUser, session } = await authSupabase.login(email, password);
      const profile = await authSupabase.getProfile(session.access_token);
      if (hostCtx.isPlatform) {
        if (!profile.is_superadmin) return send(res, 401, { error: 'Incorrect email or password.' });
        return send(res, 200, { user: { id: supaUser.id, name: profile.full_name || email, email, role: 'superadmin', tenantId: null }, token: session.access_token });
      }
      const role = await authSupabase.getMembership(session.access_token, tenant.id);
      if (!role) return send(res, 401, { error: 'Incorrect email or password.' }); // authenticated identity, but no account at THIS store
      return send(res, 200, { user: { id: supaUser.id, name: profile.full_name || email, email, role, tenantId: tenant.id }, token: session.access_token });
    } catch { return send(res, 401, { error: 'Incorrect email or password.' }); }
  }
  const found = hostCtx.isPlatform ? (email && findSuperadminByEmail(email)) : (email && tenant && findUserByEmail(email, tenant.id));
  if (!found || !verifyPassword(password || '', found.passwordHash)) return send(res, 401, { error: 'Incorrect email or password.' });
  send(res, 200, { user: publicUser(found), token: signToken({ sub: found.id, role: found.role, tenantId: found.tenantId }) });
});

route('GET', '/api/auth/me', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  send(res, 200, { user: publicUser(user) });
});

/**
 * Self-service account deletion. Requires re-entering the password even
 * though the request is already authenticated — a valid session token
 * shouldn't be enough on its own to permanently destroy the account
 * behind it. Deleting a user leaves their past orders/messages intact
 * (they already snapshot the name/email at the time), it just removes
 * the login itself — the same shape as any "deleted user" you'd see
 * elsewhere.
 */
route('DELETE', '/api/auth/me', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  if (user.role === 'superadmin') return send(res, 403, { error: "Superadmin accounts can't be self-deleted here — contact platform support." });
  if (AUTH_DRIVER === 'supabase') {
    if (user.role === 'admin') {
      // NOTE: checking "only admin at this store" against tenant_memberships is a query
      // this driver doesn't yet implement here — see the follow-up work needed before
      // this path is production-ready (tracked, not silently skipped).
    }
    try { await authSupabase.login(user.email, body.password || ''); } catch { return send(res, 401, { error: 'Incorrect password.' }); }
    await authSupabase.deleteAccount(user.id);
    return send(res, 200, { ok: true });
  }
  if (!body.password || !verifyPassword(body.password, user.passwordHash)) return send(res, 401, { error: 'Incorrect password.' });
  if (user.role === 'admin') {
    const otherAdmins = db.users.filter(u => u.tenantId === user.tenantId && u.role === 'admin' && u.id !== user.id);
    if (otherAdmins.length === 0) return send(res, 400, { error: "You're the only admin for this store — promote another admin first, or contact support to close the store." });
  }
  db.users = db.users.filter(u => u.id !== user.id);
  await persist();
  send(res, 200, { ok: true });
});

route('GET', '/api/tenant/info', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  const tierName = tenant.subscriptionTier || 'starter';
  send(res, 200, {
    name: tenant.name, subdomain: tenant.subdomain, plan: tenant.plan, tagline: tenant.tagline || '', aboutText: tenant.aboutText || '',
    translations: tenant.translations || {}, closedBySelf: !!tenant.closedBySelf,
    subscriptionTier: tierName, tierLimits: SUBSCRIPTION_TIERS[tierName],
    productCount: db.products.filter(p => p.tenantId === tenant.id).length,
    subscriptionExpiresAt: tenant.subscriptionExpiresAt || null, daysUntilExpiry: daysUntilExpiry(tenant), subscriptionAlertLevel: subscriptionAlertLevel(tenant),
  });
});

route('GET', '/api/platform/pricing', { hostScope: 'any' }, async (req, res) => {
  send(res, 200, { tiers: SUBSCRIPTION_TIERS });
});

route('PATCH', '/api/admin/store', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const transErr = mergeTranslations(tenant, body.translations, ['name', 'tagline', 'aboutText']);
  if (transErr) return send(res, 400, { error: transErr });
  if (body.plan !== undefined && !TENANT_PLANS.includes(body.plan)) {
    return send(res, 400, { error: `plan must be one of: ${TENANT_PLANS.join(', ')}.` });
  }
  if (body.subscriptionTier !== undefined && !SUBSCRIPTION_TIERS[body.subscriptionTier]) {
    return send(res, 400, { error: `subscriptionTier must be one of: ${Object.keys(SUBSCRIPTION_TIERS).join(', ')}.` });
  }
  // Downgrading tiers must not silently leave a store over its new product limit.
  if (body.subscriptionTier !== undefined) {
    const newLimit = SUBSCRIPTION_TIERS[body.subscriptionTier].maxProducts;
    const currentCount = db.products.filter(p => p.tenantId === tenant.id).length;
    if (newLimit !== null && currentCount > newLimit) {
      return send(res, 400, { error: `You have ${currentCount} products, which is more than the ${newLimit} allowed on this tier. Remove some products first, or choose a higher tier.` });
    }
  }
  // closedBySelf ("cancel everything") is deliberately distinct from superadmin
  // suspension: it closes the storefront to shoppers, but the owning admin can
  // always still log in and reopen it — a self-imposed "closed" sign, not a ban.
  const allowed = ['name', 'tagline', 'aboutText', 'plan', 'closedBySelf', 'subscriptionTier'];
  allowed.forEach(key => { if (body[key] !== undefined) tenant[key] = body[key]; });
  await persist();
  send(res, 200, { tenant });
});

/**
 * Permanently delete a store. Deliberately distinct from closedBySelf ("cancel"):
 * this is irreversible from the owner's side — the tenant becomes unreachable the
 * same way a suspended one is (see the unknownStore check), including for the
 * admin themselves. Data is soft-deleted (status flag), not physically erased,
 * so a platform operator could still investigate/restore in a real deployment —
 * but there is no self-service undo. Requires re-entering the password, the same
 * safety pattern as personal account deletion.
 */
route('DELETE', '/api/admin/store', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (!verifyPassword(body.password || '', user.passwordHash)) return send(res, 401, { error: 'Password is incorrect.' });
  tenant.status = 'deleted';
  tenant.deletedAt = Date.now();
  tenant.deletedBy = user.name;
  await persist();
  send(res, 200, { ok: true });
});

/**
 * Renew the store's subscription — the client picks which plan variant they're renewing as
 * (Store only / Marketplace only / Both), and the expiry date extends by another 30 days from
 * whichever is later: now, or the current expiry (so renewing early never loses time already
 * paid for). Sends the "renewed" notice — see sendRenewedNotice() above.
 */
route('POST', '/api/admin/store/renew', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (!TENANT_PLANS.includes(body.plan)) return send(res, 400, { error: `plan must be one of: ${TENANT_PLANS.join(', ')}.` });
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { error: tenantErr } = await client.from('tenants').update({ plan: body.plan }).eq('id', tenant.id);
    if (tenantErr) return send(res, 400, { error: tenantErr.message });
    const { data: currentSub } = await client.from('current_subscriptions').select('plan_id, expiry_date').eq('tenant_id', tenant.id).maybeSingle();
    let planId = currentSub ? currentSub.plan_id : null;
    if (!planId) {
      const { data: starterPlan } = await client.from('plans').select('id').eq('name', 'starter').maybeSingle();
      planId = starterPlan ? starterPlan.id : null;
    }
    const currentExpiry = currentSub ? new Date(currentSub.expiry_date).getTime() : Date.now();
    const newExpiry = new Date(Math.max(Date.now(), currentExpiry) + THIRTY_DAYS_MS).toISOString().slice(0, 10);
    if (planId) {
      const { error: subErr } = await client.from('subscriptions').insert({ tenant_id: tenant.id, plan_id: planId, expiry_date: newExpiry, payment_status: 'paid' });
      if (subErr) return send(res, 400, { error: subErr.message });
    }
    const { error: notifErr } = await client.from('notifications').insert({
      tenant_id: tenant.id, type: 'renewed', to_email: user.email,
      subject: `Your Hadam subscription for "${tenant.name}" has been renewed`,
      body: `Hi ${user.name},\n\nYour store "${tenant.name}" has been renewed as: ${body.plan}. Your new expiry date is ${newExpiry}.\n\nThank you for staying with Hadam Marketplace.\n\n— Hadam Marketplace`,
    });
    return send(res, 200, { tenant: { ...tenant, plan: body.plan }, notificationSent: !notifErr });
  }
  tenant.plan = body.plan;
  tenant.subscriptionExpiresAt = Math.max(Date.now(), tenant.subscriptionExpiresAt || Date.now()) + THIRTY_DAYS_MS;
  tenant.lastAlertLevel = null; // reset so the next approaching-expiry cycle sends fresh reminders
  await persist();
  const notice = await sendRenewedNotice(tenant);
  send(res, 200, { tenant, notificationSent: !!notice });
});

route('GET', '/api/admin/notifications', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('notifications').select('*').eq('tenant_id', tenant.id).order('sent_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { notifications: data.map(n => ({ id: n.id, tenantId: n.tenant_id, type: n.type, to: n.to_email, subject: n.subject, body: n.body, sentAt: n.sent_at })) });
  }
  const mine = (db.notifications || []).filter(n => n.tenantId === tenant.id).sort((a, b) => b.sentAt - a.sentAt);
  send(res, 200, { notifications: mine });
});

/**
 * Forgot / reset password. There is no real email provider wired in here
 * (see README) so the reset link is returned directly in the response,
 * clearly marked as a demo shortcut — swap this for an actual email send
 * before real users rely on it.
 */
route('POST', '/api/auth/forgot-password', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {
  if (rateLimited(req, res, 'forgot-password', 20, 5)) return;
  const { email } = body;
  if (AUTH_DRIVER === 'supabase') {
    if (email) { try { await authSupabase.requestPasswordReset(email); } catch { /* never reveal whether it worked — same principle as the custom driver below */ } }
    return send(res, 200, { ok: true, note: 'If that account exists, a reset link has been issued.' });
  }
  const found = hostCtx.isPlatform ? (email && findSuperadminByEmail(email)) : (email && tenant && findUserByEmail(email, tenant.id));
  // Always return 200 whether or not the account exists, so this can't be used to enumerate registered emails.
  if (!found) return send(res, 200, { ok: true, note: 'If that account exists, a reset link has been issued.' });
  const token = newId('reset');
  db.resets.push({ token, userId: found.id, expiresAt: Date.now() + 30 * 60 * 1000, used: false });
  await persist();
  console.log(`[simulated email] Password reset for ${found.email}: token=${token} (valid 30 min)`);
  send(res, 200, { ok: true, note: 'If that account exists, a reset link has been issued.', demoResetToken: token });
});

route('POST', '/api/auth/reset-password', { hostScope: 'any' }, async (req, res, params, body) => {
  if (AUTH_DRIVER === 'supabase') {
    // Supabase's password recovery is a different shape entirely: the email
    // link carries Supabase's own token straight to your frontend, which
    // calls supabase.auth.updateUser({password}) directly with the session
    // that link establishes — it doesn't round-trip through this endpoint
    // at all. Flagged clearly rather than silently returning success for a
    // flow that isn't actually wired up yet under this driver.
    return send(res, 501, { error: 'Not implemented for the Supabase auth driver — the frontend should complete the reset directly via the Supabase client SDK, not this endpoint.' });
  }
  const { token, newPassword } = body;
  const reset = db.resets.find(r => r.token === token);
  if (!reset || reset.used || Date.now() > reset.expiresAt) return send(res, 400, { error: 'This reset link is invalid or has expired.' });
  if (!newPassword || newPassword.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters.' });
  const user = db.users.find(u => u.id === reset.userId);
  if (!user) return send(res, 400, { error: 'This reset link is invalid or has expired.' });
  user.passwordHash = hashPassword(newPassword);
  reset.used = true;
  await persist();
  send(res, 200, { ok: true });
});

route('POST', '/api/auth/change-password', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  const { currentPassword, newPassword } = body;
  if (!newPassword || newPassword.length < 6) return send(res, 400, { error: 'New password must be at least 6 characters.' });
  if (AUTH_DRIVER === 'supabase') {
    try { await authSupabase.login(user.email, currentPassword || ''); } catch { return send(res, 401, { error: 'Current password is incorrect.' }); }
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    await authSupabase.updatePassword(token, newPassword);
    return send(res, 200, { ok: true });
  }
  if (!verifyPassword(currentPassword || '', user.passwordHash)) return send(res, 401, { error: 'Current password is incorrect.' });
  user.passwordHash = hashPassword(newPassword);
  await persist();
  send(res, 200, { ok: true });
});

/* =========================================================
   PUBLIC CATALOG (tenant-scoped, no auth — anyone can browse)
========================================================= */
route('GET', '/api/categories', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAnon.from('categories').select('*').eq('tenant_id', tenant.id);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { categories: data.map(rowToCategory) });
  }
  send(res, 200, { categories: db.categories.filter(c => c.tenantId === tenant.id) });
});

/** Maps between our JS camelCase field names and Postgres's snake_case columns for products. */
function productToRow(p, tenantId) {
  return {
    tenant_id: tenantId, category_id: p.categoryId, name: p.name, translations: p.translations || {},
    description: p.description || '', price: p.price, stock: p.stock ?? null, file_meta: p.fileMeta || null, external_url: p.externalUrl || '',
  };
}
function rowToProduct(row, category) {
  return {
    id: row.id, tenantId: row.tenant_id, categoryId: row.category_id, name: row.name, translations: row.translations || {},
    description: row.description, price: Number(row.price), stock: row.stock, fileMeta: row.file_meta, externalUrl: row.external_url || '',
    images: (row.product_images || []).map(img => ({ id: img.id, url: `/uploads/${img.storage_path}`, filename: img.filename, mimeType: img.mime_type, uploadedAt: img.uploaded_at })),
    createdAt: row.created_at, category: category || rowToCategory(row.categories),
  };
}

route('GET', '/api/products', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    let q = supabaseAnon.from('products').select('*, categories(*), product_images(*)').eq('tenant_id', tenant.id);
    if (query.get('category')) q = q.eq('category_id', query.get('category'));
    const { data, error } = await q;
    if (error) return send(res, 500, { error: error.message });
    let list = data.map(row => rowToProduct(row));
    if (query.get('group')) list = list.filter(p => p.category.group === query.get('group'));
    if (query.get('q')) { const s = query.get('q').toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)); }
    return send(res, 200, { products: list });
  }
  let list = db.products.filter(p => p.tenantId === tenant.id).map(p => ({ ...p, category: findCategory(p.categoryId, tenant.id) }));
  if (query.get('group')) list = list.filter(p => p.category.group === query.get('group'));
  if (query.get('category')) list = list.filter(p => p.categoryId === query.get('category'));
  if (query.get('q')) { const q = query.get('q').toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)); }
  send(res, 200, { products: list });
});

route('GET', '/api/products/:id', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAnon.from('products').select('*, categories(*), product_images(*)').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    if (!data) return send(res, 404, { error: 'Product not found.' });
    return send(res, 200, { product: rowToProduct(data) });
  }
  const p = findProduct(params.id, tenant.id);
  if (!p) return send(res, 404, { error: 'Product not found.' });
  send(res, 200, { product: { ...p, category: findCategory(p.categoryId, tenant.id) } });
});

/* =========================================================
   CLIENT ROUTES — orders, checkout, downloads (tenant-scoped)
========================================================= */
route('POST', '/api/orders', { hostScope: 'tenant', auth: true, roles: ['client', 'admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (tenant.closedBySelf) return send(res, 403, { error: 'This store is temporarily closed and is not accepting orders right now.' });
  const { items, shippingAddress, card, deliveryMethod } = body;
  if (!Array.isArray(items) || items.length === 0) return send(res, 400, { error: 'Cart is empty.' });
  const cardDigits = (card && card.number || '').replace(/\s/g, '');
  if (cardDigits.length < 12) return send(res, 400, { error: 'A valid card number is required.' });
  const paymentSucceeded = cardDigits.replace(/0/g, '').length > 0;

  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const resolved = [];
    for (const line of items) {
      const { data: row, error: rowErr } = await client.from('products').select('*, categories(*)').eq('id', line.productId).eq('tenant_id', tenant.id).maybeSingle();
      if (rowErr) return send(res, 500, { error: rowErr.message });
      if (!row) return send(res, 400, { error: `Unknown product: ${line.productId}` });
      const p = rowToProduct(row), category = rowToCategory(row.categories);
      const qty = line.qty || 1;
      if (category.fulfillment === 'shipping' && typeof p.stock === 'number' && qty > p.stock) {
        return send(res, 400, { error: `Only ${p.stock} unit(s) of "${p.name}" left in stock.` });
      }
      resolved.push({ product: p, category, qty });
    }
    const needsShipping = resolved.some(r => r.category.fulfillment === 'shipping');
    let chosenDelivery = 'shipping';
    if (needsShipping) {
      chosenDelivery = ['shipping', 'pickup'].includes(deliveryMethod) ? deliveryMethod : 'shipping';
      if (chosenDelivery === 'pickup') {
        const notPickupable = resolved.filter(r => r.category.fulfillment === 'shipping' && !r.category.allowPickup);
        if (notPickupable.length > 0) return send(res, 400, { error: `${notPickupable[0].product.name} isn't available for in-store pickup — ship this order instead, or remove that item.` });
      } else if (!shippingAddress || !shippingAddress.trim()) {
        return send(res, 400, { error: 'A shipping address is required for physical items in this order.' });
      }
    }
    const total = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);
    const now = Date.now();
    const { data: orderRow, error: orderErr } = await client.from('orders').insert({
      tenant_id: tenant.id, client_id: user.id, payment_status: paymentSucceeded ? 'success' : 'failed',
      shipping_address: needsShipping && chosenDelivery === 'shipping' ? shippingAddress : null, total,
    }).select().single();
    if (orderErr) return send(res, 400, { error: orderErr.message });

    const itemRows = resolved.map(r => {
      const base = {
        order_id: orderRow.id, tenant_id: tenant.id, product_id: r.product.id, name: r.product.name,
        translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
        category_name: r.category.name, fulfillment: r.category.fulfillment,
      };
      if (!paymentSucceeded) return { ...base, status: 'payment_failed' };
      if (r.category.fulfillment === 'download') {
        const windowHours = r.category.downloadWindowHours || 72, maxDownloads = r.category.maxDownloads || 1;
        return { ...base, status: 'ready', download_token: newId('dl'), download_window_hours: windowHours, download_expires_at: new Date(now + windowHours * 3600 * 1000).toISOString(), max_downloads: maxDownloads, download_used_count: 0 };
      }
      if (r.category.fulfillment === 'shipping') return { ...base, status: 'pending', delivery_method: chosenDelivery, tracking_note: '' };
      if (r.category.fulfillment === 'booking') return { ...base, status: 'requested' };
      return { ...base, status: 'pending' };
    });
    const { error: itemsErr } = await client.from('order_items').insert(itemRows);
    if (itemsErr) return send(res, 400, { error: itemsErr.message });

    if (paymentSucceeded) {
      for (const r of resolved) {
        if (r.category.fulfillment === 'shipping' && typeof r.product.stock === 'number') {
          await client.from('products').update({ stock: r.product.stock - r.qty }).eq('id', r.product.id);
        }
      }
    }
    const { data: fullOrder, error: fetchErr } = await client.from('orders').select('*, order_items(*)').eq('id', orderRow.id).single();
    if (fetchErr) return send(res, 500, { error: fetchErr.message });
    return send(res, paymentSucceeded ? 201 : 402, { order: orderRowForClient(fullOrder) });
  }

  const resolved = [];
  for (const line of items) {
    const p = findProduct(line.productId, tenant.id);
    if (!p) return send(res, 400, { error: `Unknown product: ${line.productId}` });
    const qty = line.qty || 1;
    const category = findCategory(p.categoryId, tenant.id);
    if (category.fulfillment === 'shipping' && typeof p.stock === 'number' && qty > p.stock) {
      return send(res, 400, { error: `Only ${p.stock} unit(s) of "${p.name}" left in stock.` });
    }
    resolved.push({ product: p, category, qty });
  }
  const needsShipping = resolved.some(r => r.category.fulfillment === 'shipping');
  let chosenDelivery = 'shipping';
  if (needsShipping) {
    chosenDelivery = ['shipping', 'pickup'].includes(deliveryMethod) ? deliveryMethod : 'shipping';
    if (chosenDelivery === 'pickup') {
      const notPickupable = resolved.filter(r => r.category.fulfillment === 'shipping' && !r.category.allowPickup);
      if (notPickupable.length > 0) return send(res, 400, { error: `${notPickupable[0].product.name} isn't available for in-store pickup — ship this order instead, or remove that item.` });
    } else if (!shippingAddress || !shippingAddress.trim()) {
      return send(res, 400, { error: 'A shipping address is required for physical items in this order.' });
    }
  }
  const total = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);
  const now = Date.now();
  const orderItems = resolved.map(r => {
    const base = { productId: r.product.id, name: r.product.name, translations: r.product.translations || {}, price: r.product.price, qty: r.qty, categoryId: r.category.id, categoryName: r.category.name, fulfillment: r.category.fulfillment };
    if (!paymentSucceeded) return { ...base, status: 'payment_failed' };
    // Physical stock is only committed once payment has actually succeeded.
    if (r.category.fulfillment === 'shipping' && typeof r.product.stock === 'number') r.product.stock -= r.qty;
    if (r.category.fulfillment === 'download') {
      const windowHours = r.category.downloadWindowHours || 72, maxDownloads = r.category.maxDownloads || 1;
      return { ...base, status: 'ready', downloadToken: newId('dl'), downloadExpiresAt: now + windowHours * 3600 * 1000, downloadWindowHours: windowHours, downloadsUsed: 0, maxDownloads };
    }
    if (r.category.fulfillment === 'shipping') return { ...base, status: 'pending', deliveryMethod: chosenDelivery, trackingNote: '' };
    if (r.category.fulfillment === 'booking') return { ...base, status: 'requested', scheduledAt: null, assignedEmployee: null };
    return { ...base, status: 'pending' };
  });
  const order = { id: newId('ord'), tenantId: tenant.id, clientId: user.id, clientName: user.name, clientEmail: user.email, items: orderItems, total, paymentStatus: paymentSucceeded ? 'success' : 'failed', shippingAddress: needsShipping && chosenDelivery === 'shipping' ? shippingAddress : null, createdAt: now };
  db.orders.push(order);
  await persist();
  send(res, paymentSucceeded ? 201 : 402, { order: orderForClient(order) });
});

route('GET', '/api/orders/mine', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('orders').select('*, order_items(*)').eq('tenant_id', tenant.id).eq('client_id', user.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { orders: data.map(orderRowForClient) });
  }
  const mine = db.orders.filter(o => o.tenantId === tenant.id && o.clientId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  send(res, 200, { orders: mine.map(orderForClient) });
});

/** A client can request a refund but cannot grant it — that stays a staff action (see /api/employee/.../refund). This just flags the item for staff attention. */
route('POST', '/api/orders/:orderId/items/:productId/request-refund', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('client_id').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: 'Order not found.' });
    if (order.client_id !== user.id) return send(res, 403, { error: 'This order does not belong to you.' });
    const { data: item, error: findErr } = await client.from('order_items').select('status').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!item) return send(res, 404, { error: 'Item not found on this order.' });
    if (item.status === 'refunded') return send(res, 409, { error: 'This item has already been refunded.' });
    const { data: updated, error: updateErr } = await client.from('order_items').update({ refund_requested: true }).eq('order_id', params.orderId).eq('product_id', params.productId).select().single();
    if (updateErr) return send(res, 400, { error: updateErr.message });
    return send(res, 200, { item: orderItemRowToItem(updated) });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: 'Order not found.' });
  if (order.clientId !== user.id) return send(res, 403, { error: 'This order does not belong to you.' });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: 'Item not found on this order.' });
  if (item.status === 'refunded') return send(res, 409, { error: 'This item has already been refunded.' });
  item.refundRequested = true;
  item.refundRequestedAt = Date.now();
  item.refundRequestReason = (body.reason || '').slice(0, 500);
  await persist();
  send(res, 200, { item });
});

route('GET', '/api/downloads/:orderId/:productId', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('*').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: 'Order not found.' });
    if (order.client_id !== user.id && user.role === 'client') return send(res, 403, { error: 'This order does not belong to you.' });
    const { data: itemRow, error: itemErr } = await client.from('order_items').select('*').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (itemErr) return send(res, 500, { error: itemErr.message });
    if (!itemRow || itemRow.fulfillment !== 'download') return send(res, 404, { error: 'No downloadable item found on this order.' });
    const item = orderItemRowToItem(itemRow);
    refreshItemStatus(item);
    if (order.payment_status !== 'success') return send(res, 402, { error: 'Payment was not successful for this order.' });
    if (item.status === 'refunded') return send(res, 410, { error: 'This item was refunded and is no longer available for download.' });
    if (item.status === 'expired') return send(res, 410, { error: `This download link expired ${item.downloadWindowHours} hours after purchase.` });
    if (item.downloadsUsed >= item.maxDownloads) return send(res, 410, { error: 'This file has already been downloaded the maximum number of times allowed.' });
    const newCount = item.downloadsUsed + 1;
    const newStatus = newCount >= item.maxDownloads ? 'downloaded' : 'ready';
    const { error: updErr } = await client.from('order_items').update({ download_used_count: newCount, status: newStatus }).eq('order_id', params.orderId).eq('product_id', params.productId);
    if (updErr) return send(res, 500, { error: updErr.message });
    const profile = await authSupabase.getProfile(bearerToken(req));
    const content = `HADAM — DIGITAL DELIVERY\nStore: ${tenant.name}\nProduct: ${item.name}\nLicensed to: ${profile.full_name || user.email} (${user.email})\nOrder: ${order.id}\nDelivered: ${new Date().toISOString()}\nDownload window: ${item.downloadWindowHours} hours from purchase, ${item.maxDownloads} download(s) allowed.\nDownloads used: ${newCount} of ${item.maxDownloads}\n\nThis is a simulated file standing in for "${item.name}".`;
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': `attachment; filename="${item.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.txt"`, 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
    return res.end(content);
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: 'Order not found.' });
  if (order.clientId !== user.id && user.role === 'client') return send(res, 403, { error: 'This order does not belong to you.' });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item || item.fulfillment !== 'download') return send(res, 404, { error: 'No downloadable item found on this order.' });
  refreshItemStatus(item);
  if (order.paymentStatus !== 'success') return send(res, 402, { error: 'Payment was not successful for this order.' });
  if (item.status === 'refunded') return send(res, 410, { error: 'This item was refunded and is no longer available for download.' });
  if (item.status === 'expired') return send(res, 410, { error: `This download link expired ${item.downloadWindowHours} hours after purchase.` });
  if (item.downloadsUsed >= item.maxDownloads) return send(res, 410, { error: 'This file has already been downloaded the maximum number of times allowed.' });
  item.downloadsUsed += 1;
  item.status = item.downloadsUsed >= item.maxDownloads ? 'downloaded' : 'ready';
  await persist();
  const content = `HADAM — DIGITAL DELIVERY\nStore: ${tenant.name}\nProduct: ${item.name}\nLicensed to: ${order.clientName} (${order.clientEmail})\nOrder: ${order.id}\nDelivered: ${new Date().toISOString()}\nDownload window: ${item.downloadWindowHours} hours from purchase, ${item.maxDownloads} download(s) allowed.\nDownloads used: ${item.downloadsUsed} of ${item.maxDownloads}\n\nThis is a simulated file standing in for "${item.name}".`;
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': `attachment; filename="${item.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.txt"`, 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
  res.end(content);
});

/* =========================================================
   SUPPORT / CRM (tenant-scoped) — client <-> store staff messages
========================================================= */
/** Maps a Supabase support_messages row into the camelCase shape the frontend expects. */
function supportMsgRowToMsg(row, clientName, clientEmail) {
  return {
    id: row.id, tenantId: row.tenant_id, clientId: row.client_id, clientName, clientEmail,
    subject: row.subject, message: row.message, reply: row.reply, repliedBy: row.replied_by, repliedAt: row.replied_at,
    status: row.status, createdAt: row.created_at,
  };
}

route('POST', '/api/support/messages', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  const { subject, message } = body;
  if (!subject || !message) return send(res, 400, { error: 'A subject and message are required.' });
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('support_messages').insert({
      tenant_id: tenant.id, client_id: user.id, subject: subject.slice(0, 200), message: message.slice(0, 2000), status: 'open',
    }).select().single();
    if (error) return send(res, 400, { error: error.message });
    return send(res, 201, { message: supportMsgRowToMsg(data, user.name, user.email) });
  }
  const msg = { id: newId('msg'), tenantId: tenant.id, clientId: user.id, clientName: user.name, clientEmail: user.email, subject: subject.slice(0, 200), message: message.slice(0, 2000), reply: null, status: 'open', createdAt: Date.now() };
  db.messages.push(msg);
  await persist();
  send(res, 201, { message: msg });
});

route('GET', '/api/support/messages/mine', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('support_messages').select('*').eq('tenant_id', tenant.id).eq('client_id', user.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { messages: data.map(row => supportMsgRowToMsg(row, user.name, user.email)) });
  }
  send(res, 200, { messages: db.messages.filter(m => m.tenantId === tenant.id && m.clientId === user.id).sort((a, b) => b.createdAt - a.createdAt) });
});

route('GET', '/api/employee/support', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('support_messages').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    const messages = [];
    for (const row of data) {
      let clientName = row.client_id, clientEmail = '';
      try {
        const { data: authUser, error: adminErr } = await supabaseAdmin().auth.admin.getUserById(row.client_id);
        if (adminErr) throw adminErr;
        clientName = authUser.user.user_metadata?.full_name || authUser.user.email;
        clientEmail = authUser.user.email;
      } catch { /* fall back to defaults above if the lookup fails */ }
      messages.push(supportMsgRowToMsg(row, clientName, clientEmail));
    }
    return send(res, 200, { messages });
  }
  send(res, 200, { messages: db.messages.filter(m => m.tenantId === tenant.id).sort((a, b) => b.createdAt - a.createdAt) });
});

route('PATCH', '/api/employee/support/:id', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: existing, error: findErr } = await client.from('support_messages').select('client_id').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: 'Message not found.' });
    const patch = {};
    if (typeof body.reply === 'string') { patch.reply = body.reply.slice(0, 2000); patch.replied_by = user.name; patch.replied_at = new Date().toISOString(); }
    if (body.status && ['open', 'resolved'].includes(body.status)) patch.status = body.status;
    const { data: updated, error: updErr } = await client.from('support_messages').update(patch).eq('id', params.id).select().single();
    if (updErr) return send(res, 400, { error: updErr.message });
    let clientName = updated.client_id, clientEmail = '';
    try {
      const { data: authUser, error: adminErr } = await supabaseAdmin().auth.admin.getUserById(updated.client_id);
      if (adminErr) throw adminErr;
      clientName = authUser.user.user_metadata?.full_name || authUser.user.email;
      clientEmail = authUser.user.email;
    } catch { /* fall back to defaults above if the lookup fails */ }
    return send(res, 200, { message: supportMsgRowToMsg(updated, clientName, clientEmail) });
  }
  const msg = db.messages.find(m => m.id === params.id && m.tenantId === tenant.id);
  if (!msg) return send(res, 404, { error: 'Message not found.' });
  if (typeof body.reply === 'string') { msg.reply = body.reply.slice(0, 2000); msg.repliedBy = user.name; msg.repliedAt = Date.now(); }
  if (body.status && ['open', 'resolved'].includes(body.status)) msg.status = body.status;
  await persist();
  send(res, 200, { message: msg });
});

/* =========================================================
   EMPLOYEE ROUTES (tenant-scoped)
========================================================= */
route('GET', '/api/employee/queue', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('orders').select('*, order_items(*)').eq('tenant_id', tenant.id).eq('payment_status', 'success');
    if (error) return send(res, 500, { error: error.message });
    const queue = [];
    for (const o of data) {
      for (const itemRow of o.order_items || []) {
        if (['shipping', 'booking', 'manual'].includes(itemRow.fulfillment)) {
          let clientName = o.client_id, clientEmail = '';
          try {
            const admin = supabaseAdmin();
            const { data: authUser, error: adminErr } = await admin.auth.admin.getUserById(o.client_id);
            if (adminErr) throw adminErr;
            clientName = authUser.user.user_metadata?.full_name || authUser.user.email;
            clientEmail = authUser.user.email;
          } catch { /* fall back to the defaults set above if the lookup fails */ }
          queue.push({ orderId: o.id, clientName, clientEmail, shippingAddress: o.shipping_address, createdAt: o.created_at, item: orderItemRowToItem(itemRow) });
        }
      }
    }
    queue.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return send(res, 200, { queue });
  }
  const queue = [];
  db.orders.filter(o => o.tenantId === tenant.id && o.paymentStatus === 'success').forEach(o => {
    o.items.forEach(item => { if (['shipping', 'booking', 'manual'].includes(item.fulfillment)) queue.push({ orderId: o.id, clientName: o.clientName, clientEmail: o.clientEmail, shippingAddress: o.shippingAddress, createdAt: o.createdAt, item }); });
  });
  queue.sort((a, b) => b.createdAt - a.createdAt);
  send(res, 200, { queue });
});

route('PATCH', '/api/employee/orders/:orderId/items/:productId', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: item, error: findErr } = await client.from('order_items').select('*').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!item) return send(res, 404, { error: 'Item not found on this order.' });
    const patch = {};
    if (item.fulfillment === 'shipping' && item.delivery_method === 'pickup') {
      if (body.status && ['pending', 'ready_for_pickup', 'picked_up'].includes(body.status)) patch.status = body.status;
      if (typeof body.trackingNote === 'string') patch.tracking_note = body.trackingNote;
    } else if (item.fulfillment === 'shipping') {
      if (body.status && ['pending', 'processing', 'shipped', 'delivered'].includes(body.status)) patch.status = body.status;
      if (typeof body.trackingNote === 'string') patch.tracking_note = body.trackingNote;
    } else if (item.fulfillment === 'booking') {
      if (body.status && ['requested', 'confirmed', 'completed', 'cancelled'].includes(body.status)) patch.status = body.status;
      if (body.scheduledAt) patch.scheduled_at = body.scheduledAt;
    } else if (item.fulfillment === 'manual') {
      if (body.status && ['pending', 'in_progress', 'done'].includes(body.status)) patch.status = body.status;
      if (typeof body.trackingNote === 'string') patch.tracking_note = body.trackingNote;
    }
    const { data: updated, error: updErr } = await client.from('order_items').update(patch).eq('order_id', params.orderId).eq('product_id', params.productId).select().single();
    if (updErr) return send(res, 400, { error: updErr.message });
    return send(res, 200, { item: orderItemRowToItem(updated) });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: 'Order not found.' });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: 'Item not found on this order.' });
  if (item.fulfillment === 'shipping' && item.deliveryMethod === 'pickup') {
    if (body.status && ['pending', 'ready_for_pickup', 'picked_up'].includes(body.status)) item.status = body.status;
    if (typeof body.trackingNote === 'string') item.trackingNote = body.trackingNote;
  } else if (item.fulfillment === 'shipping') {
    if (body.status && ['pending', 'processing', 'shipped', 'delivered'].includes(body.status)) item.status = body.status;
    if (typeof body.trackingNote === 'string') item.trackingNote = body.trackingNote;
  } else if (item.fulfillment === 'booking') {
    if (body.status && ['requested', 'confirmed', 'completed', 'cancelled'].includes(body.status)) item.status = body.status;
    if (body.scheduledAt) item.scheduledAt = body.scheduledAt;
    item.assignedEmployee = user.name;
  } else if (item.fulfillment === 'manual') {
    if (body.status && ['pending', 'in_progress', 'done'].includes(body.status)) item.status = body.status;
    if (typeof body.trackingNote === 'string') item.trackingNote = body.trackingNote;
  }
  await persist();
  send(res, 200, { item });
});

route('GET', '/api/employee/orders', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('orders').select('*, order_items(*)').eq('tenant_id', tenant.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { orders: data.map(orderRowForClient) });
  }
  const orders = db.orders.filter(o => o.tenantId === tenant.id).sort((a, b) => b.createdAt - a.createdAt).map(orderForClient);
  send(res, 200, { orders });
});

route('POST', '/api/employee/orders/:orderId/items/:productId/refund', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('payment_status').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: 'Order not found.' });
    if (order.payment_status !== 'success') return send(res, 400, { error: 'Only successfully paid orders can be refunded.' });
    const { data: item, error: itemErr } = await client.from('order_items').select('*').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (itemErr) return send(res, 500, { error: itemErr.message });
    if (!item) return send(res, 404, { error: 'Item not found on this order.' });
    if (item.status === 'refunded') return send(res, 409, { error: 'This item has already been refunded.' });
    const profile = await authSupabase.getProfile(bearerToken(req));
    const { data: updated, error: updErr } = await client.from('order_items').update({
      status: 'refunded', refunded_at: new Date().toISOString(), refunded_by: profile.full_name || user.email,
      refund_reason: (body.reason || '').slice(0, 500), refund_requested: false,
    }).eq('order_id', params.orderId).eq('product_id', params.productId).select().single();
    if (updErr) return send(res, 400, { error: updErr.message });
    if (item.fulfillment === 'shipping' && item.product_id) {
      const { data: product } = await client.from('products').select('stock').eq('id', item.product_id).maybeSingle();
      if (product && typeof product.stock === 'number') await client.from('products').update({ stock: product.stock + item.qty }).eq('id', item.product_id);
    }
    return send(res, 200, { item: orderItemRowToItem(updated) });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: 'Order not found.' });
  if (order.paymentStatus !== 'success') return send(res, 400, { error: 'Only successfully paid orders can be refunded.' });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: 'Item not found on this order.' });
  if (item.status === 'refunded') return send(res, 409, { error: 'This item has already been refunded.' });

  item.status = 'refunded';
  item.refundedAt = Date.now();
  item.refundedBy = user.name;
  item.refundReason = (body.reason || '').slice(0, 500);
  item.refundRequested = false;

  // Restock a physical item that's refunded before it ships.
  if (item.fulfillment === 'shipping') {
    const product = findProduct(item.productId, tenant.id);
    if (product && typeof product.stock === 'number') product.stock += item.qty;
  }
  await persist();
  send(res, 200, { item });
});

/* =========================================================
   ADMIN ROUTES (tenant-scoped) — categories, products, employees, stats
   This is where a tenant owner defines THEIR OWN catalog.
========================================================= */
/**
 * Self-service data export — this is what lets a STORE OWNER back up their
 * own data anytime, without needing file-system access to the platform's
 * shared database (which they shouldn't have anyway in a real multi-tenant
 * deployment). Downloads everything scoped to their tenant: categories,
 * products, orders, and their own team's account list (no password hashes).
 */
route('GET', '/api/admin/export', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const exportData = {
    exportedAt: new Date().toISOString(),
    store: { name: tenant.name, subdomain: tenant.subdomain, plan: tenant.plan, subscriptionTier: tenant.subscriptionTier },
    categories: db.categories.filter(c => c.tenantId === tenant.id),
    products: db.products.filter(p => p.tenantId === tenant.id),
    orders: db.orders.filter(o => o.tenantId === tenant.id),
    team: db.users.filter(u => u.tenantId === tenant.id).map(publicUser), // publicUser strips passwordHash
  };
  const json = JSON.stringify(exportData, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${tenant.subdomain}-export-${new Date().toISOString().slice(0, 10)}.json"`,
    'Access-Control-Allow-Origin': '*',
    ...SECURITY_HEADERS,
  });
  res.end(json);
});

route('GET', '/api/admin/stats', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const mine = db.orders.filter(o => o.tenantId === tenant.id);
  const successOrders = mine.filter(o => o.paymentStatus === 'success');
  const allSuccessItems = successOrders.flatMap(o => o.items);
  const activeItems = allSuccessItems.filter(i => i.status !== 'refunded');
  const refundedItems = allSuccessItems.filter(i => i.status === 'refunded');

  const revenue = activeItems.reduce((s, i) => s + i.price * i.qty, 0);
  const refundedTotal = refundedItems.reduce((s, i) => s + i.price * i.qty, 0);

  const salesByProduct = {};
  activeItems.forEach(i => {
    if (!salesByProduct[i.productId]) salesByProduct[i.productId] = { productId: i.productId, name: i.name, unitsSold: 0, revenue: 0 };
    salesByProduct[i.productId].unitsSold += i.qty;
    salesByProduct[i.productId].revenue += i.price * i.qty;
  });
  const topProducts = Object.values(salesByProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const physicalProducts = db.products.filter(p => p.tenantId === tenant.id && typeof p.stock === 'number');
  const lowStockThreshold = 5;
  const stockLevels = physicalProducts.map(p => ({ productId: p.id, name: p.name, stock: p.stock })).sort((a, b) => a.stock - b.stock);
  const lowStock = stockLevels.filter(p => p.stock <= lowStockThreshold);

  const tierName = tenant.subscriptionTier || 'starter';
  const tier = SUBSCRIPTION_TIERS[tierName];
  const commissionOwed = revenue * tier.commissionRate;

  send(res, 200, {
    revenue, refundedTotal, netRevenue: revenue,
    orderCount: mine.length,
    successOrderCount: successOrders.length,
    refundedItemCount: refundedItems.length,
    productCount: db.products.filter(p => p.tenantId === tenant.id).length,
    categoryCount: db.categories.filter(c => c.tenantId === tenant.id).length,
    clientCount: db.users.filter(u => u.tenantId === tenant.id && u.role === 'client').length,
    employeeCount: db.users.filter(u => u.tenantId === tenant.id && u.role === 'employee').length,
    topProducts, stockLevels, lowStock, lowStockThreshold,
    subscriptionTier: tierName, commissionRate: tier.commissionRate, commissionOwed, sellerKeeps: revenue - commissionOwed,
  });
});

/**
 * Performance report for any date range — same underlying numbers as /api/admin/stats
 * (net revenue, refunds, commission), but filtered to a period instead of all-time, plus
 * a day-by-day breakdown so an admin can trace performance over time, not just a snapshot.
 */
route('GET', '/api/admin/reports', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const now = Date.now();
  const from = query.get('from') ? Number(query.get('from')) : 0;
  const to = query.get('to') ? Number(query.get('to')) : now;
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) {
    return send(res, 400, { error: 'from/to must be valid timestamps (ms), with from <= to.' });
  }

  const inRange = db.orders.filter(o => o.tenantId === tenant.id && o.createdAt >= from && o.createdAt <= to);
  const successOrders = inRange.filter(o => o.paymentStatus === 'success');
  const failedOrders = inRange.filter(o => o.paymentStatus === 'failed');
  const allSuccessItems = successOrders.flatMap(o => o.items);
  const activeItems = allSuccessItems.filter(i => i.status !== 'refunded');
  const refundedItems = allSuccessItems.filter(i => i.status === 'refunded');

  const revenue = activeItems.reduce((s, i) => s + i.price * i.qty, 0);
  const refundedTotal = refundedItems.reduce((s, i) => s + i.price * i.qty, 0);
  const tierName = tenant.subscriptionTier || 'starter';
  const tier = SUBSCRIPTION_TIERS[tierName];
  const commissionOwed = revenue * tier.commissionRate;

  const salesByProduct = {};
  activeItems.forEach(i => {
    if (!salesByProduct[i.productId]) salesByProduct[i.productId] = { productId: i.productId, name: i.name, unitsSold: 0, revenue: 0 };
    salesByProduct[i.productId].unitsSold += i.qty;
    salesByProduct[i.productId].revenue += i.price * i.qty;
  });
  const topProducts = Object.values(salesByProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Day-by-day series so a trend/chart can be drawn, not just a single total for the whole range.
  const byDay = {};
  successOrders.forEach(o => {
    const day = new Date(o.createdAt).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, revenue: 0, orders: 0 };
    byDay[day].orders += 1;
    o.items.filter(i => i.status !== 'refunded').forEach(i => { byDay[day].revenue += i.price * i.qty; });
  });
  const dailySeries = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

  const newClients = db.users.filter(u => u.tenantId === tenant.id && u.role === 'client' && u.createdAt >= from && u.createdAt <= to).length;

  send(res, 200, {
    from, to, revenue, refundedTotal, netRevenue: revenue,
    orderCount: inRange.length, successOrderCount: successOrders.length, failedOrderCount: failedOrders.length,
    refundedItemCount: refundedItems.length, newClients,
    subscriptionTier: tierName, commissionRate: tier.commissionRate, commissionOwed, sellerKeeps: revenue - commissionOwed,
    topProducts, dailySeries,
  });
});

route('GET', '/api/admin/orders', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('orders').select('*, order_items(*)').eq('tenant_id', tenant.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { orders: data.map(orderRowForClient) });
  }
  send(res, 200, { orders: db.orders.filter(o => o.tenantId === tenant.id).sort((a, b) => b.createdAt - a.createdAt).map(orderForClient) });
});

route('GET', '/api/admin/users', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  send(res, 200, { users: db.users.filter(u => u.tenantId === tenant.id).map(publicUser) });
});

route('DELETE', '/api/admin/users/:id', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const target = db.users.find(u => u.id === params.id && u.tenantId === tenant.id);
  if (!target) return send(res, 404, { error: 'Account not found.' });
  if (target.role === 'admin') {
    const otherAdmins = db.users.filter(u => u.tenantId === tenant.id && u.role === 'admin' && u.id !== target.id);
    if (otherAdmins.length === 0) return send(res, 400, { error: "Can't delete the only admin for this store." });
  }
  db.users = db.users.filter(u => u.id !== target.id);
  await persist();
  send(res, 200, { ok: true });
});

route('POST', '/api/admin/employees', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const { name, email, password, role } = body;
  const chosenRole = ['employee', 'admin'].includes(role) ? role : 'employee';
  if (!name || !email || !password || password.length < 6) return send(res, 400, { error: 'Name, email, and a 6+ character password are required.' });
  if (findUserByEmail(email, tenant.id)) return send(res, 409, { error: 'An account with that email already exists for this store.' });
  const u = { id: newId('u'), name, email, passwordHash: hashPassword(password), role: chosenRole, tenantId: tenant.id, createdAt: Date.now() };
  db.users.push(u);
  await persist();
  send(res, 201, { user: publicUser(u) });
});

route('POST', '/api/admin/categories', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const { name, group, fulfillment, description, downloadWindowHours, maxDownloads, platformCategory, allowPickup, translations, customTypeName } = body;
  if (!name || !['store', 'marketplace', 'other'].includes(group) || !['shipping', 'download', 'booking', 'manual'].includes(fulfillment)) {
    return send(res, 400, { error: 'name, group (store|marketplace|other), and fulfillment (shipping|download|booking|manual) are required.' });
  }
  // Note: a store's plan (store/marketplace/both) controls whether it's LISTED on Hadam's
  // shared Marketplace directory — it does not restrict what kind of product a store can
  // sell. Any store, on any plan, can create any category type.
  const cat = { id: newId('c'), tenantId: tenant.id, name, group, fulfillment, description: description || '', platformCategory: PLATFORM_CATEGORIES.includes(platformCategory) ? platformCategory : 'Other' };
  if (fulfillment === 'download') { cat.downloadWindowHours = downloadWindowHours || 72; cat.maxDownloads = maxDownloads || 1; }
  if (fulfillment === 'shipping') cat.allowPickup = !!allowPickup;
  // "Other" (fulfillment: manual) is the catch-all — the client names their own category
  // type here rather than Hadam predefining what "Other" means.
  if (fulfillment === 'manual' && customTypeName) cat.customTypeName = String(customTypeName).slice(0, 60);
  // A store owner can add this category's name/description in any language they choose —
  // not limited to a fixed list — via translations: { "<lang-code>": { name, description } }.
  const transErr = mergeTranslations(cat, translations, ['name', 'description']);
  if (transErr) return send(res, 400, { error: transErr });
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('categories').insert(categoryToRow(cat, tenant.id)).select().single();
    if (error) return send(res, 400, { error: error.message });
    return send(res, 201, { category: rowToCategory(data) });
  }
  db.categories.push(cat);
  await persist();
  send(res, 201, { category: cat });
});

route('PATCH', '/api/admin/categories/:id', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: existing, error: findErr } = await client.from('categories').select('*').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: 'Category not found.' });
    if ((body.group !== undefined && body.group !== existing.group) || (body.fulfillment !== undefined && body.fulfillment !== existing.fulfillment)) {
      return send(res, 400, { error: "A category's group and fulfillment type can't be changed once created — delete and recreate it instead." });
    }
    if (body.platformCategory !== undefined && !PLATFORM_CATEGORIES.includes(body.platformCategory)) {
      return send(res, 400, { error: `platformCategory must be one of: ${PLATFORM_CATEGORIES.join(', ')}.` });
    }
    const patch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.downloadWindowHours !== undefined) patch.download_window_hours = body.downloadWindowHours;
    if (body.maxDownloads !== undefined) patch.max_downloads = body.maxDownloads;
    if (body.platformCategory !== undefined) patch.platform_category = body.platformCategory;
    if (body.customTypeName !== undefined) patch.custom_type_name = body.customTypeName;
    if (existing.fulfillment === 'shipping' && body.allowPickup !== undefined) patch.allow_pickup = body.allowPickup;
    if (body.translations) {
      const wrapper = { translations: existing.translations || {} };
      const err = mergeTranslations(wrapper, body.translations, ['name', 'description']);
      if (err) return send(res, 400, { error: err });
      patch.translations = wrapper.translations;
    }
    const { data, error } = await client.from('categories').update(patch).eq('id', params.id).select().single();
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { category: rowToCategory(data) });
  }
  const cat = findCategory(params.id, tenant.id);
  if (!cat) return send(res, 404, { error: 'Category not found.' });
  if ((body.group !== undefined && body.group !== cat.group) || (body.fulfillment !== undefined && body.fulfillment !== cat.fulfillment)) {
    return send(res, 400, { error: "A category's group and fulfillment type can't be changed once created — delete and recreate it instead." });
  }
  if (body.platformCategory !== undefined && !PLATFORM_CATEGORIES.includes(body.platformCategory)) {
    return send(res, 400, { error: `platformCategory must be one of: ${PLATFORM_CATEGORIES.join(', ')}.` });
  }
  const transErr = mergeTranslations(cat, body.translations, ['name', 'description']);
  if (transErr) return send(res, 400, { error: transErr });
  const allowed = ['name', 'description', 'downloadWindowHours', 'maxDownloads', 'platformCategory', 'customTypeName'];
  if (cat.fulfillment === 'shipping') allowed.push('allowPickup');
  allowed.forEach(key => { if (body[key] !== undefined) cat[key] = body[key]; });
  await persist();
  send(res, 200, { category: cat });
});

route('DELETE', '/api/admin/categories/:id', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: existing, error: findErr } = await client.from('categories').select('id').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: 'Category not found.' });
    const { count } = await client.from('products').select('id', { count: 'exact', head: true }).eq('category_id', params.id);
    if (count > 0) return send(res, 409, { error: `${count} product(s) still use this category. Move or delete them first.` });
    const { error } = await client.from('categories').delete().eq('id', params.id);
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { ok: true, removed: 1 });
  }
  const cat = findCategory(params.id, tenant.id);
  if (!cat) return send(res, 404, { error: 'Category not found.' });
  const dependentCount = db.products.filter(p => p.tenantId === tenant.id && p.categoryId === cat.id).length;
  if (dependentCount > 0) {
    return send(res, 409, { error: `${dependentCount} product(s) still use this category. Move or delete them first.` });
  }
  db.categories = db.categories.filter(c => !(c.id === cat.id && c.tenantId === tenant.id));
  await persist();
  send(res, 200, { ok: true });
});

route('POST', '/api/admin/products', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const { name, description, price, categoryId, stock, fileMeta, translations, externalUrl } = body;
  if (AUTH_DRIVER === 'supabase') {
    if (!name || typeof price !== 'number' || price < 0) return send(res, 400, { error: 'name and non-negative price are required.' });
    const client = supabaseForRequest(bearerToken(req));
    const { data: cat, error: catErr } = await client.from('categories').select('id').eq('id', categoryId).eq('tenant_id', tenant.id).maybeSingle();
    if (catErr) return send(res, 500, { error: catErr.message });
    if (!cat) return send(res, 400, { error: 'name, non-negative price, and a valid categoryId (belonging to your store) are required.' });
    const { data: sub, error: subErr } = await client.from('current_subscriptions').select('*, plans(*)').eq('tenant_id', tenant.id).maybeSingle();
    if (subErr) return send(res, 500, { error: subErr.message });
    const maxProducts = sub && sub.plans ? sub.plans.max_products : 10; // no active subscription found = treat as the most restrictive (Starter-equivalent) default
    if (maxProducts !== null) {
      const { count } = await client.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
      if (count >= maxProducts) return send(res, 403, { error: `Your plan allows up to ${maxProducts} products. Upgrade your subscription to add more.` });
    }
    const row = productToRow({ name, description, price, categoryId, stock, fileMeta, externalUrl, translations: {} }, tenant.id);
    const transErr = mergeTranslations(row, translations, ['name', 'description']);
    if (transErr) return send(res, 400, { error: transErr });
    const { data, error } = await client.from('products').insert(row).select('*, categories(*)').single();
    if (error) return send(res, 400, { error: error.message });
    return send(res, 201, { product: rowToProduct({ ...data, product_images: [] }) });
  }
  if (!name || typeof price !== 'number' || price < 0 || !findCategory(categoryId, tenant.id)) {
    return send(res, 400, { error: 'name, non-negative price, and a valid categoryId (belonging to your store) are required.' });
  }
  const tier = SUBSCRIPTION_TIERS[tenant.subscriptionTier || 'starter'];
  const currentCount = db.products.filter(p => p.tenantId === tenant.id).length;
  if (tier.maxProducts !== null && currentCount >= tier.maxProducts) {
    return send(res, 403, { error: `Your ${tenant.subscriptionTier || 'starter'} plan allows up to ${tier.maxProducts} products. Upgrade your subscription tier to add more.` });
  }
  const product = { id: newId('p'), tenantId: tenant.id, name, description: description || '', price, categoryId, stock, fileMeta, externalUrl: externalUrl || '', images: [] };
  const transErr = mergeTranslations(product, translations, ['name', 'description']);
  if (transErr) return send(res, 400, { error: transErr });
  db.products.push(product);
  await persist();
  send(res, 201, { product });
});

route('PATCH', '/api/admin/products/:id', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: existing, error: findErr } = await client.from('products').select('*').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: 'Product not found.' });
    if (body.categoryId !== undefined) {
      const { data: cat, error: catErr } = await client.from('categories').select('id').eq('id', body.categoryId).eq('tenant_id', tenant.id).maybeSingle();
      if (catErr) return send(res, 500, { error: catErr.message });
      if (!cat) return send(res, 400, { error: 'categoryId must belong to your store.' });
    }
    const patch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.price !== undefined) patch.price = body.price;
    if (body.categoryId !== undefined) patch.category_id = body.categoryId;
    if (body.stock !== undefined) patch.stock = body.stock;
    if (body.fileMeta !== undefined) patch.file_meta = body.fileMeta;
    if (body.externalUrl !== undefined) patch.external_url = body.externalUrl;
    if (body.translations) {
      const wrapper = { translations: existing.translations || {} };
      const err = mergeTranslations(wrapper, body.translations, ['name', 'description']);
      if (err) return send(res, 400, { error: err });
      patch.translations = wrapper.translations;
    }
    const { data, error } = await client.from('products').update(patch).eq('id', params.id).select('*, categories(*)').single();
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { product: rowToProduct({ ...data, product_images: [] }) });
  }
  const p = findProduct(params.id, tenant.id);
  if (!p) return send(res, 404, { error: 'Product not found.' });
  if (body.categoryId !== undefined && !findCategory(body.categoryId, tenant.id)) {
    return send(res, 400, { error: 'categoryId must belong to your store.' });
  }
  const transErr = mergeTranslations(p, body.translations, ['name', 'description']);
  if (transErr) return send(res, 400, { error: transErr });
  const allowed = ['name', 'description', 'price', 'categoryId', 'stock', 'fileMeta', 'externalUrl'];
  allowed.forEach(key => { if (body[key] !== undefined) p[key] = body[key]; });
  await persist();
  send(res, 200, { product: p });
});

route('DELETE', '/api/admin/products/:id', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { error } = await client.from('products').delete().eq('id', params.id).eq('tenant_id', tenant.id);
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { ok: true, removed: 1 });
  }
  const before = db.products.length;
  db.products = db.products.filter(p => !(p.id === params.id && p.tenantId === tenant.id));
  await persist();
  send(res, 200, { ok: true, removed: before - db.products.length });
});

const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
const ALLOWED_IMAGE_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB decoded — comfortably under the 5MB raw request-body cap

route('POST', '/api/admin/products/:id/images', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const product = findProduct(params.id, tenant.id);
  if (!product) return send(res, 404, { error: 'Product not found.' });
  const { mimeType, dataBase64, filename } = body;
  const ext = ALLOWED_IMAGE_MIME[mimeType];
  if (!ext) return send(res, 400, { error: `Unsupported image type. Use one of: ${Object.keys(ALLOWED_IMAGE_MIME).join(', ')}.` });
  if (!dataBase64) return send(res, 400, { error: 'dataBase64 is required.' });
  // Buffer.from(str, 'base64') is lenient in Node — it silently strips invalid characters
  // rather than throwing, so garbage input would otherwise "succeed" with a garbled result.
  const cleanedBase64 = dataBase64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanedBase64) || cleanedBase64.length === 0) {
    return send(res, 400, { error: 'dataBase64 is not valid base64.' });
  }
  const buffer = Buffer.from(cleanedBase64, 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) return send(res, 413, { error: `Image is too large — max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB per file.` });

  const tenantDir = path.join(UPLOADS_DIR, tenant.id);
  fs.mkdirSync(tenantDir, { recursive: true });
  const imageId = newId('img');
  const diskFilename = `${imageId}.${ext}`;
  fs.writeFileSync(path.join(tenantDir, diskFilename), buffer);

  const image = { id: imageId, url: `/uploads/${tenant.id}/${diskFilename}`, filename: (filename || diskFilename).slice(0, 120), mimeType, uploadedAt: Date.now() };
  product.images = product.images || [];
  product.images.push(image);
  await persist();
  send(res, 201, { image, product });
});

route('DELETE', '/api/admin/products/:id/images/:imageId', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const product = findProduct(params.id, tenant.id);
  if (!product) return send(res, 404, { error: 'Product not found.' });
  const image = (product.images || []).find(i => i.id === params.imageId);
  if (!image) return send(res, 404, { error: 'Image not found on this product.' });
  product.images = product.images.filter(i => i.id !== params.imageId);
  const diskPath = path.join(UPLOADS_DIR, tenant.id, path.basename(image.url));
  try { fs.unlinkSync(diskPath); } catch { /* already gone — fine */ }
  await persist();
  send(res, 200, { ok: true });
});

/* =========================================================
   HTTP SERVER — tenant resolution, auth/role enforcement, static files
========================================================= */
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

function serveStatic(res, dir, pathname) {
  const filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(dir, filePath);
  if (fullPath.startsWith(dir) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    // No caching for static assets: this app iterates quickly, and a stale cached app.js
    // showing "missing" features after an update is a worse failure mode than re-fetching
    // a few KB on every load.
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath)] || 'application/octet-stream', 'Cache-Control': 'no-cache, no-store, must-revalidate', ...SECURITY_HEADERS });
    return fs.createReadStream(fullPath).pipe(res);
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' });
    return res.end();
  }

  const hostCtx = resolveHost(req.headers.host);
  const tenant = hostCtx.isPlatform ? null : await findTenantBySubdomainAsync(hostCtx.subdomain);
  const unknownStore = !hostCtx.isPlatform && (!tenant || tenant.status === 'suspended' || tenant.status === 'deleted');
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
    const rel = url.pathname.slice('/uploads/'.length);
    const fullPath = path.join(UPLOADS_DIR, rel);
    if (!fullPath.startsWith(UPLOADS_DIR) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return send(res, 404, { error: 'Image not found.' });
    }
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    const mime = Object.entries(ALLOWED_IMAGE_MIME).find(([, e]) => e === ext);
    res.writeHead(200, { 'Content-Type': mime ? mime[0] : 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000', ...SECURITY_HEADERS });
    return fs.createReadStream(fullPath).pipe(res);
  }

  const match = matchRoute(req.method, url.pathname);

  if (match) {
    const { route: r, params } = match;
    if (r.opts.hostScope !== 'platform' && !hostCtx.isPlatform && unknownStore) return send(res, 404, { error: 'This store could not be found. Check the subdomain, or visit the main site to create one.' });
    if (r.opts.hostScope === 'tenant' && hostCtx.isPlatform) return send(res, 404, { error: 'This store could not be found. Check the subdomain, or visit the main site to create one.' });
    if (r.opts.hostScope === 'platform' && !hostCtx.isPlatform) return send(res, 404, { error: 'Not available on a store subdomain.' });

    let user = null;
    if (r.opts.auth) {
      user = AUTH_DRIVER === 'supabase' ? await authenticateSupabase(req, tenant, hostCtx) : authenticate(req);
      if (!user) return send(res, 401, { error: 'Log in required.' });
      if (r.opts.hostScope === 'tenant' && user.tenantId !== tenant.id) return send(res, 403, { error: 'This account does not belong to this store.' });
      if (r.opts.hostScope === 'platform' && (user.role !== 'superadmin' || user.tenantId !== null)) return send(res, 403, { error: 'Platform access only.' });
      if (r.opts.roles && !r.opts.roles.includes(user.role)) return send(res, 403, { error: 'Your role does not have access to this action.' });
    }
    try {
      const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      await r.handler(req, res, params, body, url.searchParams, user, tenant, hostCtx);
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'Internal server error.' });
    }
    return;
  }

  if (req.method === 'GET') {
    if (unknownStore) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Store not found. Check the subdomain, or visit the main site to create one.'); }
    const served = serveStatic(res, hostCtx.isPlatform ? PLATFORM_PUBLIC_DIR : TENANT_PUBLIC_DIR, url.pathname);
    if (served !== false) return;
  }
  send(res, 404, { error: 'Not found.' });
});

if (require.main === module) {
  (async () => {
    await initDb();
    server.listen(PORT, () => console.log(`Hadam platform listening on http://localhost:${PORT} (base domain: ${BASE_DOMAIN}, db driver: ${process.env.HADAM_DB_DRIVER || 'file'})`));
    // Real periodic check for a real running server. An hour is frequent enough that a
    // reminder fires within an hour of crossing a threshold, without being wasteful; a real
    // production deployment might prefer an external daily cron hitting the endpoint above instead.
    setInterval(() => { checkSubscriptionAlerts().catch(err => console.error('Subscription check failed:', err)); }, 60 * 60 * 1000);
  })().catch(err => { console.error('Failed to start:', err); process.exit(1); });
}
module.exports = { server, initDb, resolveHost, hashPassword, verifyPassword, signToken, verifyToken, refreshItemStatus, DB_PATH, SEED_PATH };
