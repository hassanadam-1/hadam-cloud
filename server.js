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
// SECURITY: the fallback below is for local development/testing convenience
// only. If this app is genuinely running in production (NODE_ENV=production,
// the standard signal most hosting platforms set automatically) with no
// JWT_SECRET configured, every auth token would be signed with a secret
// that's plainly visible in this source file — anyone could forge a valid
// token for any user. Fail loudly here rather than silently shipping that.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production — refusing to start with the insecure development fallback. Generate a real secret (e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`) and set it as an environment variable.');
}
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
  const wasOk = arr.length < limit;
  // Only record this attempt if it was actually allowed through — an
  // attempt that gets rejected here never reached the real action it was
  // guarding, so it shouldn't count toward (and keep extending) the same
  // lockout window. Without this, simply checking whether you're still
  // rate-limited resets the clock every time, and a locked-out person who
  // retries a few times to see if it's cleared yet can never actually
  // clear it.
  if (wasOk) arr.push(now);
  rateLimitBuckets.set(key, arr);
  return wasOk;
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
    res.end(JSON.stringify({ error: apiT('tooManyAttempts', reqLang(req)) }));
    // Only the auth-related buckets are logged as security lockout events —
    // this function also rate-limits plenty of non-auth endpoints, and
    // logging every one of those would bury the genuinely relevant events.
    if (AUTH_DRIVER === 'supabase' && /login|mfa|password|forgot/i.test(bucket)) {
      logAuthEvent({ eventType: 'account_locked', outcome: 'failure', req, details: { bucket, limit, windowMinutes } });
    }
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
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('notifications').insert({ tenant_id: tenantId, type, to_email: to, subject, body }).select().maybeSingle();
    if (error) { console.error('[sendEmail] insert failed:', error.message); return null; }
    return { id: data.id, tenantId: data.tenant_id, type: data.type, to: data.to_email, subject: data.subject, body: data.body, sentAt: data.created_at };
  }
  const notification = { id: newId('note'), tenantId, type, to, subject, body, sentAt: Date.now() };
  db.notifications = db.notifications || [];
  db.notifications.push(notification);
  await persist();
  return notification;
}
async function findUserToNotify(tenantId) {
  // The store's own admin is who gets subscription notices.
  if (AUTH_DRIVER === 'supabase') {
    const { data: membership } = await supabaseAdmin().from('tenant_memberships').select('user_id').eq('tenant_id', tenantId).eq('role', 'admin').limit(1).maybeSingle();
    if (!membership) return null;
    const { data: authUser } = await supabaseAdmin().auth.admin.getUserById(membership.user_id);
    if (!authUser || !authUser.user) return null;
    return { id: membership.user_id, email: authUser.user.email, name: authUser.user.user_metadata?.full_name || authUser.user.email };
  }
  return db.users.find(u => u.tenantId === tenantId && u.role === 'admin');
}
async function sendRenewalReminder(tenant, alertLevel) {
  const admin = await findUserToNotify(tenant.id);
  if (!admin) return null;
  const lang = await getRecipientLang(admin.email);
  const timeLabelKeys = { '1_month': 'renewalTimeLabel1Month', '2_weeks': 'renewalTimeLabel2Weeks', '1_week': 'renewalTimeLabel1Week' };
  const timeLabel = emailT(EMAIL_I18N, timeLabelKeys[alertLevel], lang);
  return sendEmail({
    to: admin.email, tenantId: tenant.id, type: `renewal_reminder_${alertLevel}`,
    subject: emailT(EMAIL_I18N, 'renewalReminderSubject', lang)(tenant.name, timeLabel),
    body: emailT(EMAIL_I18N, 'renewalReminderBody', lang)(admin.name, tenant.name, tenant.plan, timeLabel, new Date(tenant.subscriptionExpiresAt).toDateString()),
  });
}
async function sendRenewedNotice(tenant) {
  const admin = await findUserToNotify(tenant.id);
  if (!admin) return null;
  const lang = await getRecipientLang(admin.email);
  return sendEmail({
    to: admin.email, tenantId: tenant.id, type: 'renewed',
    subject: emailT(EMAIL_I18N, 'renewedNoticeSubject', lang)(tenant.name),
    body: emailT(EMAIL_I18N, 'renewedNoticeBody', lang)(admin.name, tenant.name, tenant.plan, new Date(tenant.subscriptionExpiresAt).toDateString()),
  });
}
async function sendExpiredNotice(tenant) {
  const admin = await findUserToNotify(tenant.id);
  if (!admin) return null;
  const lang = await getRecipientLang(admin.email);
  return sendEmail({
    to: admin.email, tenantId: tenant.id, type: 'expired',
    subject: emailT(EMAIL_I18N, 'expiredNoticeSubject', lang)(tenant.name),
    body: emailT(EMAIL_I18N, 'expiredNoticeBody', lang)(admin.name, tenant.name, new Date(tenant.subscriptionExpiresAt).toDateString()),
  });
}
/**
 * Runs the alert/expiry checks for every tenant once. In a real deployment this would be
 * called by a scheduled job (cron, etc.); here it's also called on a repeating in-process
 * timer (see setInterval near the bottom of this file) AND exposed as an endpoint so it can
 * be triggered deterministically in tests and via the admin dashboard.
 */
/** Emails every superadmin when a renewal payment has just been confirmed —
 * called only after the card has actually been validated and the
 * subscription/membership has actually been extended, never before. */
/** Low-level: emails every superadmin with the given subject/text. */
/** Low-level: emails every superadmin, resolving subject/text per-recipient using each one's own stored language — different superadmins can have different preferences. buildContent(lang) must return { subject, text }. */
async function notifyAllSuperadmins(buildContent) {
  try {
    if (AUTH_DRIVER === 'supabase') {
      const admin = supabaseAdmin();
      const { data: superadminProfiles } = await admin.from('profiles').select('id').eq('is_superadmin', true);
      for (const p of (superadminProfiles || [])) {
        const { data: authUser } = await admin.auth.admin.getUserById(p.id);
        if (authUser && authUser.user) {
          const lang = await getRecipientLang(authUser.user.email);
          const { subject, text } = buildContent(lang);
          await sendRealEmail({ to: authUser.user.email, subject, text, html: wrapEmailHtml(text, lang) });
        }
      }
    } else {
      const superadmins = db.users.filter(u => u.role === 'superadmin');
      for (const sa of superadmins) {
        const lang = await getRecipientLang(sa.email);
        const { subject, text } = buildContent(lang);
        await sendRealEmail({ to: sa.email, subject, text, html: wrapEmailHtml(text, lang) });
      }
    }
  } catch (e) { console.error('[superadmin-notify] failed:', e.message); }
}
async function notifySuperadminsOfRenewal({ clientName, clientEmail, servicesRenewed, subscriptionStart, subscriptionEnd }) {
  await notifyAllSuperadmins((lang) => ({
    subject: emailT(EMAIL_I18N, 'renewalConfirmedSubject', lang)(servicesRenewed),
    text: emailT(EMAIL_I18N, 'renewalConfirmedBody', lang)(clientName, clientEmail, servicesRenewed, subscriptionStart, subscriptionEnd),
  }));
}
/** Notifies every superadmin the moment a Contact form message is submitted — so it's never only discoverable by manually checking the dashboard. */
async function notifySuperadminsOfContactMessage({ name, email, message }) {
  await notifyAllSuperadmins((lang) => ({
    subject: emailT(EMAIL_I18N, 'newContactMessageSubject', lang)(name),
    text: emailT(EMAIL_I18N, 'newContactMessageBody', lang)(name, email, message),
  }));
}

async function checkSubscriptionAlerts() {
  const sent = [];
  if (AUTH_DRIVER === 'supabase') {
    const admin = supabaseAdmin();
    const { data: subs, error } = await admin.from('subscriptions').select('*, tenants(*)').eq('status', 'active');
    if (error) { console.error('[checkSubscriptionAlerts] fetch failed:', error.message); return sent; }
    for (const sub of subs || []) {
      const tenantRow = sub.tenants;
      if (!tenantRow || tenantRow.status !== 'active' || !sub.expiry_date) continue;
      const tenant = { id: tenantRow.id, name: tenantRow.name, plan: tenantRow.plan, subscriptionExpiresAt: new Date(sub.expiry_date + 'T00:00:00Z').getTime() };
      const level = subscriptionAlertLevel(tenant);
      if (!level) continue;
      const lastAlertLevel = sub.last_alert_level || null;
      if (level === 'expired') {
        if (lastAlertLevel !== 'expired') {
          sent.push(await sendExpiredNotice(tenant));
          await admin.from('subscriptions').update({ last_alert_level: 'expired' }).eq('id', sub.id);
        }
      } else if (lastAlertLevel !== level) {
        sent.push(await sendRenewalReminder(tenant, level));
        await admin.from('subscriptions').update({ last_alert_level: level }).eq('id', sub.id);
      }
    }
    return sent.filter(Boolean);
  }
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
  db.stockMovements = db.stockMovements || [];
  db.payments = db.payments || [];
  db.tenantPaymentMethods = db.tenantPaymentMethods || [];
  db.stripeWebhookEvents = db.stripeWebhookEvents || [];
  db.paypalWebhookEvents = db.paypalWebhookEvents || [];
  db.orderStatusHistory = db.orderStatusHistory || [];
  db.downloadProducts = db.downloadProducts || [];
  db.marketplaceMembers = db.marketplaceMembers || [];
  db.tenants.forEach(t => { if (!t.subscriptionExpiresAt) t.subscriptionExpiresAt = Date.now() + THIRTY_DAYS_MS; });
  db.tenants.forEach(t => { if (!t.plan) t.plan = 'both'; if (t.tagline === undefined) t.tagline = ''; if (!t.subscriptionTier) t.subscriptionTier = 'starter'; });
}
async function persist() { await dataStore.save(db); }

/* =========================================================
   AUTH — password hashing (scrypt) + hand-rolled JWT (HMAC)
========================================================= */
/** Validates a simulated card's MM/YY expiry — must be a real month, and not already in the past.
 * Returns an error message string if invalid, or null if it's fine. */
/**
 * Server-side i18n for API error messages — a genuinely separate system
 * from the frontend's own I18N dictionaries in public/app.js and
 * public-platform/app.js. Those only ever covered UI text the frontend
 * itself renders; every error message returned BY the API was hardcoded
 * English with no localization at all, regardless of the user's selected
 * language — confirmed as a real, current gap (293 hardcoded messages
 * found across this file). This starts closing that gap for the
 * highest-traffic surface (card validation, used by checkout, renewals,
 * refunds, tier changes, and Add-Marketplace all at once) rather than
 * attempting all 293 messages at once.
 */
const API_I18N = {
  en: {
    cardNumberRequired: 'A valid card number is required.',
    cardExpiryFormat: 'Card expiry must be in MM/YY format.',
    cardExpiryMonthRange: 'Card expiry month must be between 01 and 12.',
    cardExpired: 'This card has expired. Please use a card with a future expiry date.',
    cvvRequired: 'Card security code (CVV/CVC) is required.',
    cvvDigitsOnly: 'Card security code (CVV/CVC) must contain only digits.',
    cvvExactly3: 'Card security code (CVV/CVC) must be exactly 3 digits.',
    cardholderNameRequired: 'Cardholder name is required.',
    cardDeclined: 'Card declined.',
    incorrectLogin: 'Incorrect email or password.',
    orderNotFound: 'Order not found.',
    mfaSupabaseOnly: 'MFA is only available with the Supabase auth driver.',
    itemNotFoundOnOrder: 'Item not found on this order.',
    productNotFound: 'Product not found.',
    orderNotYours: 'This order does not belong to you.',
    marketplaceMemberNotFound: 'Marketplace member not found.',
    noDownloadableItem: 'No downloadable item found on this order.',
    noStoreForSubdomain: 'No Hadam Store found with that subdomain.',
    categoryNotFound: 'Category not found.',
    itemRefundedNoDownload: 'This item was refunded and is no longer available for download.',
    itemAlreadyRefunded: 'This item has already been refunded.',
    paymentNotSuccessful: 'Payment was not successful for this order.',
    subdomainEmailPasswordRequired: 'Subdomain, admin email, and password are required.',
    notFound: 'Not found.',
    noMembershipMatch: 'No Marketplace membership found matching that email and business name.',
    messageNotFound: 'Message not found.',
    digitalFileWrongCategory: 'A digital file can only be attached to a product in a download-fulfillment category.',
    tempTokenCodeRequired: 'tempToken and code are required.',
    recoveryTokenPasswordRequired: 'recoveryAccessToken and newPassword are required.',
    recoveryTokenCodeRequired: 'recoveryAccessToken and code are required.',
    productFieldsRequired: 'Name, non-negative price, and a valid category (belonging to your store) are required.',
    filenameRequired: 'filename is required.',
    dataBase64Required: 'File data is required.',
    dataBase64Invalid: 'File data is not valid.',
    categoryMustBelongToStore: 'Category must belong to your store.',
    alreadyConfirmedReceipt1: 'You have already confirmed receipt of this item.',
    alreadyConfirmedReceipt2: 'You already confirmed receipt of this item.',
    storeNotFoundCheckSubdomain: 'This store could not be found. Check the subdomain, or visit the main site to create one.',
    storeAlreadyHasMarketplace: 'This store already has Marketplace access.',
    resetLinkInvalidExpired: 'This reset link is invalid or has expired.',
    refundNotApprovedOrProcessed: 'This refund has not been approved yet, or has already been processed.',
    productNotStockTracked: 'This product is not stock-tracked (it has no inventory count), so stock cannot be added to it.',
    productHasNoImage: 'This product has no image.',
    onlyAppliesToShipped: 'This only applies to shipped items.',
    itemNotMarkedDelivered: 'This item has not been marked as delivered yet.',
    imageMaxDownloads: 'This image has already been downloaded the maximum number of times allowed.',
    fileMaxDownloads: 'This file has already been downloaded the maximum number of times allowed.',
    subdomainTaken: 'That subdomain is already taken.',
    tenantNotFound: 'Store not found.',
    paymentDeclinedTryDifferent: 'Payment declined. Try a different card, or choose the free Starter tier.',
    passwordMin6: 'Password must be at least 6 characters.',
    onlyPaidOrdersRefundable: 'Only successfully paid orders can be refunded.',
    onlyFeaturedRenewable: 'Only Featured-plan memberships have a subscription to renew.',
    noFileAttached: 'No file is attached to this product.',
    incorrectPassword: 'Incorrect password.',
    imageNotFoundOnProduct: 'Image not found on this product.',
    emailBusinessNameRequired: 'Email and business name are required.',
    largeUploadsSupabaseOnly: 'Direct large-file uploads require the Supabase driver.',
    deliveryConfirmShippedOnly: 'Delivery confirmation only applies to shipped items.',
    currentPasswordIncorrect: 'Current password is incorrect.',
    accountExistsForStore: 'An account with that email already exists for this store.',
    accountNotFound: 'Account not found.',
    shippingAddressRequired: 'A shipping address is required for physical items in this order.',
    refundRequestInProgress: 'A refund request is already in progress for this item.',
    refundDecisionAlreadyMade: 'A decision has already been made on this refund.',
    textTargetLangRequired: 'Text and target language are required.',
    tenantIdRequired: 'Store ID is required.',
    tempTokenFactorCodeRequired: 'tempToken, factorId, and code are required.',
    tempTokenRequired: 'tempToken is required.',
    targetLangRequired: 'Target language is required.',
    storagePathFilenameSizeRequired: 'storagePath, filename, and sizeBytes are required.',
    categoryFieldsRequired: 'Name, group, and fulfillment type are required.',
    nameNonNegPriceRequired: 'Name and non-negative price are required.',
    fromToTimestampsInvalid: 'from/to must be valid timestamps, with from before to.',
    factorIdCodeRequired: 'factorId and code are required.',
    emailRequired: 'Email is required.',
    amountPositiveWhole: 'Amount must be a positive whole number.',
    roleNoAccess: 'Your role does not have access to this action.',
    websiteUrlFormat: 'Website URL must start with http:// or https://.',
    verifyFailedNoMetadataDownload: 'Verification failed: no metadata record exists for this product.',
    verifyFailedNoMetadata: 'Verification failed: no metadata record exists for this product.',
    verifyFailedFileMissing: 'Verification failed: metadata exists, but the file itself could not be found.',
    verifyFailedFileMissingStorage: 'Verification failed: metadata exists, but the file itself could not be found in storage.',
    uploadVerifiedRecordFailed: 'Upload verified, but its record could not be saved — please try again.',
    storeClosedNoOrders: 'This store is temporarily closed and is not accepting orders right now.',
    storeClosedNoAccounts: 'This store is temporarily closed and is not accepting new accounts right now.',
    storeNotAcceptingAccounts: 'This store is not currently accepting new customer accounts.',
    checkSupabaseOnly: 'This check is only available with the Supabase auth driver.',
    accountNotThisStore: 'This account does not belong to this store.',
    uploadNotVerifiedStorage: 'The upload could not be verified in storage — it may not have completed successfully.',
    imageNotVerifiedDisk: 'The image could not be verified after upload.',
    fileUploadNotVerified: 'The file upload appeared to succeed, but could not be verified afterward.',
    subdomainReserved: 'That subdomain is reserved. Please choose another.',
    emailRegisteredDifferentPassword: 'That email is already registered with a different password. Log in with your existing Hadam password instead.',
    accountNotMemberStore: 'That account is not a member of this store.',
    textTooLongTranslate: 'Text is too long to auto-translate in one request (max 2000 characters).',
    techManualNotFound: 'Technical manual file not found on this server.',
    subdomainFormat: 'Subdomain must be 2-30 lowercase letters, numbers, or hyphens.',
    storeNotFound: 'Store not found.',
    storeSignupFieldsRequired: 'Store name, your name, email, and a 6+ character password are all required.',
    storeCreationFailed: 'Store creation failed unexpectedly — please try again.',
    refundRequestFailed: 'Refund request failed unexpectedly — please try again.',
    refundProcessingFailed: 'Refund processing failed unexpectedly — please try again.',
    refundDecisionFailed: 'Refund decision failed unexpectedly — please try again.',
    platformAccessOnly: 'Platform access only.',
    passwordIncorrect: 'Password is incorrect.',
    orderCreatedNotRetrieved: 'Order was created but could not be retrieved — please check your order history.',
    orderCreationFailed: 'Order creation failed unexpectedly — please try again.', cashOrderPlacedMsg: 'Order placed — pay with cash when you receive/collect it.', bankTransferOrderPlacedMsg: 'Order placed — complete your bank transfer using the reference below.',
    notImplementedSupabaseReset: 'This isn\'t available with the Supabase auth driver — password reset should be completed through the app directly.',
    notAvailableOnStoreSubdomain: 'Not available on a store subdomain.',
    noAccountForEmail: 'No account found with that email.',
    cannotResetOwnMfa: "You can't reset your own MFA this way — ask another superadmin to reset it for you. This is intentional: it prevents a lost authenticator from becoming a password-only account takeover.",
    newPasswordMin6: 'New password must be at least 6 characters.',
    nameEmailPasswordRequired: 'Name, email, and password are required.',
    nameEmailMessageRequired: 'Name, email, and a message are required.',
    nameEmailPassword6Required: 'Name, email, and a 6+ character password are required.',
    messageCouldNotSend: 'Message could not be sent — please try again.',
    loginRequired: 'Log in required.',
    imageNotFound: 'Image not found.',
    categoryCreationFailed: 'Category creation failed unexpectedly — please try again.',
    cartEmpty: 'Cart is empty.',
    cardDeclinedTryDifferent: 'Card declined. Please try a different card.',
    businessSignupFieldsRequired: 'Business name, owner name, email, and website URL are required.',
    accountExistsGeneral: 'An account with that email already exists.',
    validCardRequiredFeatured: 'A valid card number is required for the Featured plan.',
    subjectMessageRequired: 'A subject and message are required.',
    mfaCheckFromOwnPanel1: "This account has two-factor authentication enabled — please check status from your own store's Admin panel instead.",
    onlyStoreAdminViewSub: "Only that store's own admin can view its subscription status.",
    incorrectStoreAdminLogin: "Incorrect email or password for that store's admin account.",
    mfaRenewFromOwnPanel: "This account has two-factor authentication enabled — please renew from your own store's Admin panel instead.",
    onlyStoreAdminRenew: "Only that store's own admin can renew its subscription.",
    mfaAddMarketFromOwnPanel: "This account has two-factor authentication enabled — please add Marketplace access from your own store's Admin panel instead.",
    onlyStoreAdminAddMarket: "Only that store's own admin can add Marketplace access to it.",
    storeSubExpiredNoOrders: "This store's subscription has expired and cannot accept new orders until it is renewed.",
    superadminNoSelfDelete: "Superadmin accounts can't be self-deleted here — contact platform support.",
    onlyAdminPromoteFirst: "You're the only admin for this store — promote another admin first, or contact support to close the store.",
    scopeInvalid: "Scope must be one of: products, categories, store.",
    decisionInvalid: "Decision must be approve or reject.",
    cantDeleteOnlyAdmin: "Can't delete the only admin for this store.",
    categoryTypeImmutable: "A category's group and fulfillment type can't be changed once created — delete and recreate it instead.",
    tooManyAttempts: 'Too many attempts. Please wait a few minutes and try again.',
    mfaCodeIncorrect: 'Incorrect verification code.',
    mfaCodeExpired: 'This code has expired. Please request a new one.',
    mfaCodeAlreadyUsed: 'This code has already been used. Please request a new one.',
    accountLocked: 'This account is temporarily locked due to too many failed attempts. Please try again later.',
  },
  ar: {
    cardNumberRequired: 'رقم بطاقة صالح مطلوب.',
    cardExpiryFormat: 'يجب أن يكون تاريخ انتهاء البطاقة بصيغة شهر/سنة.',
    cardExpiryMonthRange: 'يجب أن يكون شهر انتهاء البطاقة بين 01 و 12.',
    cardExpired: 'انتهت صلاحية هذه البطاقة. يرجى استخدام بطاقة بتاريخ انتهاء مستقبلي.',
    cvvRequired: 'رمز أمان البطاقة (CVV/CVC) مطلوب.',
    cvvDigitsOnly: 'يجب أن يحتوي رمز أمان البطاقة (CVV/CVC) على أرقام فقط.',
    cvvExactly3: 'يجب أن يتكون رمز أمان البطاقة (CVV/CVC) من 3 أرقام بالضبط.',
    cardholderNameRequired: 'اسم حامل البطاقة مطلوب.',
    cardDeclined: 'تم رفض البطاقة.',
    incorrectLogin: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    orderNotFound: 'الطلب غير موجود.',
    mfaSupabaseOnly: 'التحقق بخطوتين متاح فقط مع محرك مصادقة Supabase.',
    itemNotFoundOnOrder: 'العنصر غير موجود في هذا الطلب.',
    productNotFound: 'المنتج غير موجود.',
    orderNotYours: 'هذا الطلب لا يخصك.',
    marketplaceMemberNotFound: 'عضو السوق غير موجود.',
    noDownloadableItem: 'لا يوجد عنصر قابل للتنزيل في هذا الطلب.',
    noStoreForSubdomain: 'لا يوجد متجر هدام بهذا النطاق الفرعي.',
    categoryNotFound: 'الفئة غير موجودة.',
    itemRefundedNoDownload: 'تم استرداد هذا العنصر ولم يعد متاحًا للتنزيل.',
    itemAlreadyRefunded: 'تم استرداد هذا العنصر بالفعل.',
    paymentNotSuccessful: 'لم يكن الدفع ناجحًا لهذا الطلب.',
    subdomainEmailPasswordRequired: 'النطاق الفرعي وبريد المسؤول وكلمة المرور مطلوبة.',
    notFound: 'غير موجود.',
    noMembershipMatch: 'لا توجد عضوية سوق مطابقة لهذا البريد الإلكتروني واسم العمل.',
    messageNotFound: 'الرسالة غير موجودة.',
    digitalFileWrongCategory: 'لا يمكن إرفاق ملف رقمي إلا بمنتج في فئة تنفيذ بالتنزيل.',
    tempTokenCodeRequired: 'الرمز المؤقت والرمز مطلوبان.',
    recoveryTokenPasswordRequired: 'رمز الاسترداد وكلمة المرور الجديدة مطلوبان.',
    recoveryTokenCodeRequired: 'رمز الاسترداد والرمز مطلوبان.',
    productFieldsRequired: 'الاسم والسعر غير السالب وفئة صالحة (تابعة لمتجرك) مطلوبة.',
    filenameRequired: 'اسم الملف مطلوب.',
    dataBase64Required: 'بيانات الملف مطلوبة.',
    dataBase64Invalid: 'بيانات الملف غير صالحة.',
    categoryMustBelongToStore: 'يجب أن تنتمي الفئة إلى متجرك.',
    alreadyConfirmedReceipt1: 'لقد أكدت بالفعل استلام هذا العنصر.',
    alreadyConfirmedReceipt2: 'لقد أكدت بالفعل استلام هذا العنصر.',
    storeNotFoundCheckSubdomain: 'لم يتم العثور على هذا المتجر. تحقق من النطاق الفرعي، أو قم بزيارة الموقع الرئيسي لإنشاء واحد.',
    storeAlreadyHasMarketplace: 'هذا المتجر لديه بالفعل وصول إلى السوق.',
    resetLinkInvalidExpired: 'رابط إعادة التعيين هذا غير صالح أو منتهي الصلاحية.',
    refundNotApprovedOrProcessed: 'لم تتم الموافقة على هذا الاسترداد بعد، أو تمت معالجته بالفعل.',
    productNotStockTracked: 'هذا المنتج لا يتم تتبع مخزونه (لا يوجد عدد مخزون)، لذا لا يمكن إضافة مخزون إليه.',
    productHasNoImage: 'هذا المنتج ليس له صورة.',
    onlyAppliesToShipped: 'هذا ينطبق فقط على العناصر المشحونة.',
    itemNotMarkedDelivered: 'لم يتم تعليم هذا العنصر كمُسلَّم بعد.',
    imageMaxDownloads: 'تم تنزيل هذه الصورة بالفعل الحد الأقصى المسموح به من المرات.',
    fileMaxDownloads: 'تم تنزيل هذا الملف بالفعل الحد الأقصى المسموح به من المرات.',
    subdomainTaken: 'هذا النطاق الفرعي مُستخدَم بالفعل.',
    tenantNotFound: 'المتجر غير موجود.',
    paymentDeclinedTryDifferent: 'تم رفض الدفع. جرّب بطاقة مختلفة، أو اختر باقة المبتدئ المجانية.',
    passwordMin6: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.',
    onlyPaidOrdersRefundable: 'يمكن استرداد الطلبات المدفوعة بنجاح فقط.',
    onlyFeaturedRenewable: 'فقط عضويات الباقة المميزة لديها اشتراك للتجديد.',
    noFileAttached: 'لا يوجد ملف مرفق بهذا المنتج.',
    incorrectPassword: 'كلمة المرور غير صحيحة.',
    imageNotFoundOnProduct: 'الصورة غير موجودة في هذا المنتج.',
    emailBusinessNameRequired: 'البريد الإلكتروني واسم العمل مطلوبان.',
    largeUploadsSupabaseOnly: 'تتطلب تحميلات الملفات الكبيرة المباشرة محرك Supabase.',
    deliveryConfirmShippedOnly: 'تأكيد التسليم ينطبق فقط على العناصر المشحونة.',
    currentPasswordIncorrect: 'كلمة المرور الحالية غير صحيحة.',
    accountExistsForStore: 'يوجد حساب بهذا البريد الإلكتروني بالفعل لهذا المتجر.',
    accountNotFound: 'الحساب غير موجود.',
    shippingAddressRequired: 'عنوان الشحن مطلوب للعناصر المادية في هذا الطلب.',
    refundRequestInProgress: 'طلب استرداد قيد التنفيذ بالفعل لهذا العنصر.',
    refundDecisionAlreadyMade: 'تم اتخاذ قرار بالفعل بشأن هذا الاسترداد.',
    textTargetLangRequired: 'النص واللغة المستهدفة مطلوبان.',
    tenantIdRequired: 'معرف المتجر مطلوب.',
    tempTokenFactorCodeRequired: 'الرمز المؤقت ومعرف العامل والرمز مطلوبة.',
    tempTokenRequired: 'الرمز المؤقت مطلوب.',
    targetLangRequired: 'اللغة المستهدفة مطلوبة.',
    storagePathFilenameSizeRequired: 'مسار التخزين واسم الملف وحجم الملف مطلوبة.',
    categoryFieldsRequired: 'الاسم والمجموعة ونوع التنفيذ مطلوبة.',
    nameNonNegPriceRequired: 'الاسم وسعر غير سالب مطلوبان.',
    fromToTimestampsInvalid: 'يجب أن يكون من/إلى طوابع زمنية صالحة، مع أن يكون من قبل إلى.',
    factorIdCodeRequired: 'معرف العامل والرمز مطلوبان.',
    emailRequired: 'البريد الإلكتروني مطلوب.',
    amountPositiveWhole: 'يجب أن يكون المبلغ رقمًا صحيحًا موجبًا.',
    roleNoAccess: 'دورك لا يملك صلاحية الوصول إلى هذا الإجراء.',
    websiteUrlFormat: 'يجب أن يبدأ رابط الموقع بـ http:// أو https://.',
    verifyFailedNoMetadataDownload: 'فشل التحقق: لا يوجد سجل بيانات وصفية لهذا المنتج.',
    verifyFailedNoMetadata: 'فشل التحقق: لا يوجد سجل بيانات وصفية لهذا المنتج.',
    verifyFailedFileMissing: 'فشل التحقق: البيانات الوصفية موجودة، لكن تعذر العثور على الملف نفسه.',
    verifyFailedFileMissingStorage: 'فشل التحقق: البيانات الوصفية موجودة، لكن تعذر العثور على الملف نفسه في التخزين.',
    uploadVerifiedRecordFailed: 'تم التحقق من التحميل، لكن تعذر حفظ سجله — يرجى المحاولة مرة أخرى.',
    storeClosedNoOrders: 'هذا المتجر مغلق مؤقتًا ولا يقبل الطلبات حاليًا.',
    storeClosedNoAccounts: 'هذا المتجر مغلق مؤقتًا ولا يقبل حسابات جديدة حاليًا.',
    storeNotAcceptingAccounts: 'هذا المتجر لا يقبل حاليًا حسابات عملاء جديدة.',
    checkSupabaseOnly: 'هذا التحقق متاح فقط مع محرك مصادقة Supabase.',
    accountNotThisStore: 'هذا الحساب لا ينتمي إلى هذا المتجر.',
    uploadNotVerifiedStorage: 'تعذر التحقق من التحميل في التخزين — قد لا يكون قد اكتمل بنجاح.',
    imageNotVerifiedDisk: 'تعذر التحقق من الصورة بعد التحميل.',
    fileUploadNotVerified: 'بدا أن تحميل الملف نجح، لكن تعذر التحقق منه بعد ذلك.',
    subdomainReserved: 'هذا النطاق الفرعي محجوز. يرجى اختيار آخر.',
    emailRegisteredDifferentPassword: 'هذا البريد الإلكتروني مُسجَّل بالفعل بكلمة مرور مختلفة. سجّل الدخول بكلمة مرور هدام الحالية بدلًا من ذلك.',
    accountNotMemberStore: 'هذا الحساب ليس عضوًا في هذا المتجر.',
    textTooLongTranslate: 'النص طويل جدًا للترجمة التلقائية في طلب واحد (الحد الأقصى 2000 حرف).',
    techManualNotFound: 'ملف الدليل الفني غير موجود على هذا الخادم.',
    subdomainFormat: 'يجب أن يتكون النطاق الفرعي من 2 إلى 30 حرفًا إنجليزيًا صغيرًا أو رقمًا أو شرطة.',
    storeNotFound: 'المتجر غير موجود.',
    storeSignupFieldsRequired: 'اسم المتجر واسمك وبريدك الإلكتروني وكلمة مرور من 6 أحرف على الأقل، كلها مطلوبة.',
    storeCreationFailed: 'فشل إنشاء المتجر بشكل غير متوقع — يرجى المحاولة مرة أخرى.',
    refundRequestFailed: 'فشل طلب الاسترداد بشكل غير متوقع — يرجى المحاولة مرة أخرى.',
    refundProcessingFailed: 'فشلت معالجة الاسترداد بشكل غير متوقع — يرجى المحاولة مرة أخرى.',
    refundDecisionFailed: 'فشل قرار الاسترداد بشكل غير متوقع — يرجى المحاولة مرة أخرى.',
    platformAccessOnly: 'الوصول إلى المنصة فقط.',
    passwordIncorrect: 'كلمة المرور غير صحيحة.',
    orderCreatedNotRetrieved: 'تم إنشاء الطلب لكن تعذر استرجاعه — يرجى مراجعة سجل طلباتك.',
    orderCreationFailed: 'فشل إنشاء الطلب بشكل غير متوقع — يرجى المحاولة مرة أخرى.', cashOrderPlacedMsg: 'تم تقديم الطلب — ادفع نقدًا عند الاستلام.', bankTransferOrderPlacedMsg: 'تم تقديم الطلب — أكمل التحويل البنكي باستخدام الرقم المرجعي أدناه.',
    notImplementedSupabaseReset: 'هذا غير متاح مع محرك مصادقة Supabase — يجب إكمال إعادة تعيين كلمة المرور من خلال التطبيق مباشرة.',
    notAvailableOnStoreSubdomain: 'غير متاح على نطاق فرعي لمتجر.',
    noAccountForEmail: 'لا يوجد حساب بهذا البريد الإلكتروني.',
    cannotResetOwnMfa: 'لا يمكنك إعادة تعيين التحقق بخطوتين الخاص بك بهذه الطريقة — اطلب من مسؤول أعلى آخر إعادة تعيينه لك. هذا مقصود: فهو يمنع تحول فقدان جهاز المصادقة إلى استيلاء على الحساب بكلمة المرور فقط.',
    newPasswordMin6: 'يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل.',
    nameEmailPasswordRequired: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة.',
    nameEmailMessageRequired: 'الاسم والبريد الإلكتروني والرسالة مطلوبة.',
    nameEmailPassword6Required: 'الاسم والبريد الإلكتروني وكلمة مرور من 6 أحرف على الأقل مطلوبة.',
    messageCouldNotSend: 'تعذر إرسال الرسالة — يرجى المحاولة مرة أخرى.',
    loginRequired: 'تسجيل الدخول مطلوب.',
    imageNotFound: 'الصورة غير موجودة.',
    categoryCreationFailed: 'فشل إنشاء الفئة بشكل غير متوقع — يرجى المحاولة مرة أخرى.',
    cartEmpty: 'السلة فارغة.',
    cardDeclinedTryDifferent: 'تم رفض البطاقة. يرجى تجربة بطاقة مختلفة.',
    businessSignupFieldsRequired: 'اسم العمل واسم المالك والبريد الإلكتروني ورابط الموقع مطلوبة.',
    accountExistsGeneral: 'يوجد حساب بهذا البريد الإلكتروني بالفعل.',
    validCardRequiredFeatured: 'رقم بطاقة صالح مطلوب للباقة المميزة.',
    subjectMessageRequired: 'الموضوع والرسالة مطلوبان.',
    mfaCheckFromOwnPanel1: 'هذا الحساب يحتوي على تحقق بخطوتين مفعّل — يرجى التحقق من الحالة من لوحة إدارة متجرك الخاص بدلًا من ذلك.',
    onlyStoreAdminViewSub: 'فقط مسؤول ذلك المتجر يمكنه عرض حالة اشتراكه.',
    incorrectStoreAdminLogin: 'البريد الإلكتروني أو كلمة المرور غير صحيحة لحساب مسؤول ذلك المتجر.',
    mfaRenewFromOwnPanel: 'هذا الحساب يحتوي على تحقق بخطوتين مفعّل — يرجى التجديد من لوحة إدارة متجرك الخاص بدلًا من ذلك.',
    onlyStoreAdminRenew: 'فقط مسؤول ذلك المتجر يمكنه تجديد اشتراكه.',
    mfaAddMarketFromOwnPanel: 'هذا الحساب يحتوي على تحقق بخطوتين مفعّل — يرجى إضافة وصول السوق من لوحة إدارة متجرك الخاص بدلًا من ذلك.',
    onlyStoreAdminAddMarket: 'فقط مسؤول ذلك المتجر يمكنه إضافة وصول السوق إليه.',
    storeSubExpiredNoOrders: 'انتهت صلاحية اشتراك هذا المتجر ولا يمكنه قبول طلبات جديدة حتى يتم تجديده.',
    superadminNoSelfDelete: 'لا يمكن حذف حسابات المسؤول العام ذاتيًا من هنا — اتصل بدعم المنصة.',
    onlyAdminPromoteFirst: 'أنت المسؤول الوحيد لهذا المتجر — رقِّ مسؤولًا آخر أولًا، أو اتصل بالدعم لإغلاق المتجر.',
    scopeInvalid: 'يجب أن يكون النطاق أحد: المنتجات، الفئات، المتجر.',
    decisionInvalid: 'يجب أن يكون القرار موافقة أو رفض.',
    cantDeleteOnlyAdmin: 'لا يمكن حذف المسؤول الوحيد لهذا المتجر.',
    categoryTypeImmutable: 'لا يمكن تغيير مجموعة الفئة ونوع تنفيذها بعد إنشائها — احذفها وأعد إنشاءها بدلًا من ذلك.',
    tooManyAttempts: 'محاولات كثيرة جدًا. يرجى الانتظار بضع دقائق والمحاولة مرة أخرى.',
    mfaCodeIncorrect: 'رمز التحقق غير صحيح.',
    mfaCodeExpired: 'انتهت صلاحية هذا الرمز. يرجى طلب رمز جديد.',
    mfaCodeAlreadyUsed: 'تم استخدام هذا الرمز بالفعل. يرجى طلب رمز جديد.',
    accountLocked: 'هذا الحساب مُقفَل مؤقتًا بسبب محاولات فاشلة متعددة. يرجى المحاولة لاحقًا.',
  },
  fr: {
    cardNumberRequired: 'Un numéro de carte valide est requis.',
    cardExpiryFormat: "La date d'expiration de la carte doit être au format MM/AA.",
    cardExpiryMonthRange: "Le mois d'expiration de la carte doit être compris entre 01 et 12.",
    cardExpired: "Cette carte a expiré. Veuillez utiliser une carte avec une date d'expiration future.",
    cvvRequired: 'Le code de sécurité de la carte (CVV/CVC) est requis.',
    cvvDigitsOnly: 'Le code de sécurité de la carte (CVV/CVC) ne doit contenir que des chiffres.',
    cvvExactly3: 'Le code de sécurité de la carte (CVV/CVC) doit comporter exactement 3 chiffres.',
    cardholderNameRequired: 'Le nom du titulaire de la carte est requis.',
    cardDeclined: 'Carte refusée.',
    incorrectLogin: "E-mail ou mot de passe incorrect.",
    orderNotFound: 'Commande introuvable.',
    mfaSupabaseOnly: "Le MFA n'est disponible qu'avec le pilote d'authentification Supabase.",
    itemNotFoundOnOrder: 'Article introuvable sur cette commande.',
    productNotFound: 'Produit introuvable.',
    orderNotYours: 'Cette commande ne vous appartient pas.',
    marketplaceMemberNotFound: 'Membre du Marketplace introuvable.',
    noDownloadableItem: 'Aucun article téléchargeable trouvé sur cette commande.',
    noStoreForSubdomain: 'Aucune boutique Hadam trouvée avec ce sous-domaine.',
    categoryNotFound: 'Catégorie introuvable.',
    itemRefundedNoDownload: "Cet article a été remboursé et n'est plus disponible au téléchargement.",
    itemAlreadyRefunded: 'Cet article a déjà été remboursé.',
    paymentNotSuccessful: "Le paiement de cette commande n'a pas abouti.",
    subdomainEmailPasswordRequired: "Le sous-domaine, l'e-mail administrateur et le mot de passe sont requis.",
    notFound: 'Introuvable.',
    noMembershipMatch: "Aucune adhésion Marketplace trouvée correspondant à cet e-mail et ce nom d'entreprise.",
    messageNotFound: 'Message introuvable.',
    digitalFileWrongCategory: "Un fichier numérique ne peut être associé qu'à un produit dans une catégorie de traitement par téléchargement.",
    tempTokenCodeRequired: 'tempToken et code sont requis.',
    recoveryTokenPasswordRequired: 'recoveryAccessToken et newPassword sont requis.',
    recoveryTokenCodeRequired: 'recoveryAccessToken et code sont requis.',
    productFieldsRequired: 'Le nom, un prix non négatif et une catégorie valide (appartenant à votre boutique) sont requis.',
    filenameRequired: 'Le nom de fichier est requis.',
    dataBase64Required: 'Les données du fichier sont requises.',
    dataBase64Invalid: 'Les données du fichier ne sont pas valides.',
    categoryMustBelongToStore: 'La catégorie doit appartenir à votre boutique.',
    alreadyConfirmedReceipt1: 'Vous avez déjà confirmé la réception de cet article.',
    alreadyConfirmedReceipt2: 'Vous avez déjà confirmé la réception de cet article.',
    storeNotFoundCheckSubdomain: 'Cette boutique est introuvable. Vérifiez le sous-domaine, ou visitez le site principal pour en créer une.',
    storeAlreadyHasMarketplace: 'Cette boutique a déjà accès au Marketplace.',
    resetLinkInvalidExpired: 'Ce lien de réinitialisation est invalide ou a expiré.',
    refundNotApprovedOrProcessed: "Ce remboursement n'a pas encore été approuvé, ou a déjà été traité.",
    productNotStockTracked: "Ce produit n'a pas de suivi de stock (aucun décompte d'inventaire), le stock ne peut donc pas y être ajouté.",
    productHasNoImage: "Ce produit n'a pas d'image.",
    onlyAppliesToShipped: "Ceci ne s'applique qu'aux articles expédiés.",
    itemNotMarkedDelivered: "Cet article n'a pas encore été marqué comme livré.",
    imageMaxDownloads: 'Cette image a déjà été téléchargée le nombre maximum de fois autorisé.',
    fileMaxDownloads: 'Ce fichier a déjà été téléchargé le nombre maximum de fois autorisé.',
    subdomainTaken: 'Ce sous-domaine est déjà pris.',
    tenantNotFound: 'Boutique introuvable.',
    paymentDeclinedTryDifferent: "Paiement refusé. Essayez une autre carte, ou choisissez l'offre Débutant gratuite.",
    passwordMin6: 'Le mot de passe doit comporter au moins 6 caractères.',
    onlyPaidOrdersRefundable: 'Seules les commandes payées avec succès peuvent être remboursées.',
    onlyFeaturedRenewable: "Seules les adhésions de l'offre Featured ont un abonnement à renouveler.",
    noFileAttached: "Aucun fichier n'est associé à ce produit.",
    incorrectPassword: 'Mot de passe incorrect.',
    imageNotFoundOnProduct: 'Image introuvable sur ce produit.',
    emailBusinessNameRequired: "L'e-mail et le nom d'entreprise sont requis.",
    largeUploadsSupabaseOnly: 'Les téléversements directs de fichiers volumineux nécessitent le pilote Supabase.',
    deliveryConfirmShippedOnly: "La confirmation de livraison ne s'applique qu'aux articles expédiés.",
    currentPasswordIncorrect: 'Le mot de passe actuel est incorrect.',
    accountExistsForStore: 'Un compte avec cet e-mail existe déjà pour cette boutique.',
    accountNotFound: 'Compte introuvable.',
    shippingAddressRequired: 'Une adresse de livraison est requise pour les articles physiques de cette commande.',
    refundRequestInProgress: 'Une demande de remboursement est déjà en cours pour cet article.',
    refundDecisionAlreadyMade: 'Une décision a déjà été prise concernant ce remboursement.',
    textTargetLangRequired: 'Le texte et la langue cible sont requis.',
    tenantIdRequired: "L'identifiant de la boutique est requis.",
    tempTokenFactorCodeRequired: 'tempToken, factorId et code sont requis.',
    tempTokenRequired: 'tempToken est requis.',
    targetLangRequired: 'La langue cible est requise.',
    storagePathFilenameSizeRequired: 'storagePath, filename et sizeBytes sont requis.',
    categoryFieldsRequired: 'Le nom, le groupe et le type de traitement sont requis.',
    nameNonNegPriceRequired: 'Le nom et un prix non négatif sont requis.',
    fromToTimestampsInvalid: 'from/to doivent être des horodatages valides, avec from avant to.',
    factorIdCodeRequired: 'factorId et code sont requis.',
    emailRequired: "L'e-mail est requis.",
    amountPositiveWhole: 'Le montant doit être un nombre entier positif.',
    roleNoAccess: "Votre rôle n'a pas accès à cette action.",
    websiteUrlFormat: "L'URL du site web doit commencer par http:// ou https://.",
    verifyFailedNoMetadataDownload: "Échec de la vérification : aucun enregistrement de métadonnées n'existe pour ce produit.",
    verifyFailedNoMetadata: "Échec de la vérification : aucun enregistrement de métadonnées n'existe pour ce produit.",
    verifyFailedFileMissing: 'Échec de la vérification : les métadonnées existent, mais le fichier lui-même est introuvable.',
    verifyFailedFileMissingStorage: 'Échec de la vérification : les métadonnées existent, mais le fichier lui-même est introuvable dans le stockage.',
    uploadVerifiedRecordFailed: "Téléversement vérifié, mais son enregistrement n'a pas pu être sauvegardé — veuillez réessayer.",
    storeClosedNoOrders: "Cette boutique est temporairement fermée et n'accepte pas de commandes pour le moment.",
    storeClosedNoAccounts: "Cette boutique est temporairement fermée et n'accepte pas de nouveaux comptes pour le moment.",
    storeNotAcceptingAccounts: "Cette boutique n'accepte pas actuellement de nouveaux comptes clients.",
    checkSupabaseOnly: "Cette vérification n'est disponible qu'avec le pilote d'authentification Supabase.",
    accountNotThisStore: "Ce compte n'appartient pas à cette boutique.",
    uploadNotVerifiedStorage: "Le téléversement n'a pas pu être vérifié dans le stockage — il se peut qu'il ne se soit pas terminé avec succès.",
    imageNotVerifiedDisk: "L'image n'a pas pu être vérifiée après le téléversement.",
    fileUploadNotVerified: "Le téléversement du fichier semblait réussi, mais n'a pas pu être vérifié par la suite.",
    subdomainReserved: 'Ce sous-domaine est réservé. Veuillez en choisir un autre.',
    emailRegisteredDifferentPassword: 'Cet e-mail est déjà enregistré avec un mot de passe différent. Connectez-vous plutôt avec votre mot de passe Hadam existant.',
    accountNotMemberStore: "Ce compte n'est pas membre de cette boutique.",
    textTooLongTranslate: 'Le texte est trop long pour une traduction automatique en une seule requête (max 2000 caractères).',
    techManualNotFound: 'Le fichier du manuel technique est introuvable sur ce serveur.',
    subdomainFormat: 'Le sous-domaine doit comporter 2 à 30 lettres minuscules, chiffres ou tirets.',
    storeNotFound: 'Boutique introuvable.',
    storeSignupFieldsRequired: "Le nom de la boutique, votre nom, votre e-mail et un mot de passe d'au moins 6 caractères sont tous requis.",
    storeCreationFailed: 'La création de la boutique a échoué de manière inattendue — veuillez réessayer.',
    refundRequestFailed: 'La demande de remboursement a échoué de manière inattendue — veuillez réessayer.',
    refundProcessingFailed: 'Le traitement du remboursement a échoué de manière inattendue — veuillez réessayer.',
    refundDecisionFailed: 'La décision de remboursement a échoué de manière inattendue — veuillez réessayer.',
    platformAccessOnly: 'Accès à la plateforme uniquement.',
    passwordIncorrect: 'Le mot de passe est incorrect.',
    orderCreatedNotRetrieved: "La commande a été créée mais n'a pas pu être récupérée — veuillez consulter votre historique de commandes.",
    orderCreationFailed: 'La création de la commande a échoué de manière inattendue — veuillez réessayer.', cashOrderPlacedMsg: 'Commande passée — payez en espèces à la réception.', bankTransferOrderPlacedMsg: 'Commande passée — effectuez votre virement bancaire en utilisant la référence ci-dessous.',
    notImplementedSupabaseReset: "Ceci n'est pas disponible avec le pilote d'authentification Supabase — la réinitialisation du mot de passe doit être effectuée directement via l'application.",
    notAvailableOnStoreSubdomain: 'Non disponible sur un sous-domaine de boutique.',
    noAccountForEmail: 'Aucun compte trouvé avec cet e-mail.',
    cannotResetOwnMfa: "Vous ne pouvez pas réinitialiser votre propre MFA de cette façon — demandez à un autre superadmin de le faire pour vous. C'est intentionnel : cela évite qu'un authentificateur perdu ne devienne une prise de contrôle du compte par simple mot de passe.",
    newPasswordMin6: 'Le nouveau mot de passe doit comporter au moins 6 caractères.',
    nameEmailPasswordRequired: "Le nom, l'e-mail et le mot de passe sont requis.",
    nameEmailMessageRequired: "Le nom, l'e-mail et un message sont requis.",
    nameEmailPassword6Required: "Le nom, l'e-mail et un mot de passe d'au moins 6 caractères sont requis.",
    messageCouldNotSend: "Le message n'a pas pu être envoyé — veuillez réessayer.",
    loginRequired: 'Connexion requise.',
    imageNotFound: 'Image introuvable.',
    categoryCreationFailed: 'La création de la catégorie a échoué de manière inattendue — veuillez réessayer.',
    cartEmpty: 'Le panier est vide.',
    cardDeclinedTryDifferent: 'Carte refusée. Veuillez essayer une autre carte.',
    businessSignupFieldsRequired: "Le nom de l'entreprise, le nom du propriétaire, l'e-mail et l'URL du site web sont requis.",
    accountExistsGeneral: 'Un compte avec cet e-mail existe déjà.',
    validCardRequiredFeatured: "Un numéro de carte valide est requis pour l'offre Featured.",
    subjectMessageRequired: 'Un objet et un message sont requis.',
    tooManyAttempts: 'Trop de tentatives. Veuillez patienter quelques minutes et réessayer.',
    mfaCodeIncorrect: 'Code de vérification incorrect.',
    mfaCodeExpired: 'Ce code a expiré. Veuillez en demander un nouveau.',
    mfaCodeAlreadyUsed: "Ce code a déjà été utilisé. Veuillez en demander un nouveau.",
    accountLocked: "Ce compte est temporairement bloqué en raison de trop nombreuses tentatives échouées. Veuillez réessayer plus tard.",
  },
};
/** Reads the language the frontend sent (X-Lang header, set on every api() call), falling back to English for any request that predates this or omits it (e.g. direct API/test callers). */
function reqLang(req) {
  const raw = (req && req.headers && req.headers['x-lang'] || 'en').toLowerCase();
  return API_I18N[raw] ? raw : 'en';
}
function apiT(key, lang) {
  return (API_I18N[lang] && API_I18N[lang][key]) || API_I18N.en[key] || key;
}
/**
 * Recipient-language architecture for emails.
 *
 * THE GAP THIS CLOSES: every email in this app used to be hardcoded
 * English regardless of the recipient's chosen UI language. The reason
 * wasn't just "nobody translated the strings" — there was NO PLACE this
 * information could even come from. reqLang(req) only knows the CURRENT
 * request's language, which is fine for a customer's own order-confirmation
 * email (they ARE the requester), but wrong for e.g. a refund-decision
 * email: the requester there is the STAFF member deciding, and the email
 * goes to the CUSTOMER, whose language the staff request has no idea
 * about. Nothing stored a customer's language anywhere at all.
 *
 * THE FIX: a lightweight, passively-learned mapping from email address ->
 * last-known language, captured opportunistically on every authenticated
 * request (see the hook in the router below) rather than requiring a
 * schema migration to every user-creation call site. Once a person has
 * made even one authenticated request in a given language, every future
 * email to them uses it — including ones triggered by someone else's
 * action, with no active session of their own at that moment. Unknown
 * recipients (never seen an authenticated request) fall back to English,
 * a clearly-defined default per the requirement.
 */
async function captureRecipientLang(email, lang) {
  if (!email || !lang || lang === 'en') return; // no need to persist the default
  const normalizedEmail = email.toLowerCase();
  try {
    if (AUTH_DRIVER === 'supabase') {
      // Fire-and-forget: never let this slow down or fail the actual
      // request it's piggybacking on. If the table doesn't exist yet
      // (migration not applied), this silently no-ops rather than
      // throwing — the same graceful-degradation pattern used
      // throughout this project for incrementally-added schema.
      supabaseAdmin().from('user_lang_prefs').upsert({ email: normalizedEmail, lang, updated_at: new Date().toISOString() }, { onConflict: 'email' }).then(() => {}, () => {});
    } else {
      db.userLangPrefs = db.userLangPrefs || {};
      db.userLangPrefs[normalizedEmail] = lang;
    }
  } catch { /* best-effort — must never break the request it's attached to */ }
}
async function getRecipientLang(email) {
  if (!email) return 'en';
  const normalizedEmail = email.toLowerCase();
  try {
    if (AUTH_DRIVER === 'supabase') {
      const { data } = await supabaseAdmin().from('user_lang_prefs').select('lang').eq('email', normalizedEmail).maybeSingle();
      return (data && API_I18N[data.lang]) ? data.lang : 'en';
    }
    db.userLangPrefs = db.userLangPrefs || {};
    const stored = db.userLangPrefs[normalizedEmail];
    return API_I18N[stored] ? stored : 'en';
  } catch {
    return 'en'; // clearly-defined default when lookup itself fails for any reason
  }
}

function validateCardExpiry(expiry, lang = 'en') {
  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec((expiry || '').trim());
  if (!match) return apiT('cardExpiryFormat', lang);
  const month = Number(match[1]), yearTwoDigit = Number(match[2]);
  if (month < 1 || month > 12) return apiT('cardExpiryMonthRange', lang);
  const fullYear = 2000 + yearTwoDigit;
  const now = new Date();
  const cardExpiresAt = new Date(fullYear, month, 1); // first day of the month AFTER the printed one — a card is valid through the end of its printed month
  if (cardExpiresAt <= now) return apiT('cardExpired', lang);
  return null;
}
function validateCardCvv(cvv, lang = 'en') {
  const trimmed = (cvv || '').trim();
  if (!trimmed) return apiT('cvvRequired', lang);
  if (!/^\d+$/.test(trimmed)) return apiT('cvvDigitsOnly', lang);
  if (trimmed.length !== 3) return apiT('cvvExactly3', lang);
  return null;
}
/** Card FORMAT validation for a renewal/payment: number length, expiry, CVV, and cardholder name. Does NOT check for the declined-card sentinel — that maps to a different HTTP status (402) and stays a separate, explicit check in each caller. Returns an error string, or null if the format is fine. */
function validateFullCard(card, lang = 'en') {
  const cardDigits = ((card && card.number) || '').replace(/\s/g, '');
  if (cardDigits.length < 12) return apiT('cardNumberRequired', lang);
  const expiryError = validateCardExpiry(card && card.expiry, lang);
  if (expiryError) return expiryError;
  const cvvError = validateCardCvv(card && card.cvv, lang);
  if (cvvError) return cvvError;
  if (!((card && card.holderName) || '').trim()) return apiT('cardholderNameRequired', lang);
  return null;
}

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
    productId: row.product_id, name: row.name, sku: row.sku || null, translations: row.translations || {}, price: Number(row.price), qty: row.qty,
    categoryName: row.category_name, fulfillment: row.fulfillment, status: row.status,
    deliveryMethod: row.delivery_method, trackingNote: row.tracking_note, scheduledAt: row.scheduled_at,
    downloadToken: row.download_token, downloadWindowHours: row.download_window_hours,
    downloadExpiresAt: row.download_expires_at ? new Date(row.download_expires_at).getTime() : null,
    maxDownloads: row.max_downloads, downloadsUsed: row.download_used_count, firstDownloadedAt: row.first_downloaded_at,
    refundRequested: row.refund_requested, refundedAt: row.refunded_at, refundedBy: row.refunded_by, refundReason: row.refund_reason,
    refundStatus: row.refund_status || 'none', refundRequestReason: row.refund_request_reason || null, refundRequestedAt: row.refund_requested_at || null,
    refundDecisionBy: row.refund_decision_by || null, refundDecisionAt: row.refund_decision_at || null, refundDecisionReason: row.refund_decision_reason || null,
    refundPaymentLast4: row.refund_payment_last4 || null,
    customerConfirmedAt: row.customer_confirmed_at || null,
    customerReportedProblem: row.customer_reported_problem || false,
    customerProblemNote: row.customer_problem_note || null,
    customerProblemReportedAt: row.customer_problem_reported_at || null,
    // Sourced from the live product row (not snapshotted at purchase time) —
    // if the provider updates the meeting link later (e.g. a new Zoom link
    // for a recurring course), the customer always sees the current one.
    meetingLink: row.products ? row.products.meeting_link || null : null,
  };
}
/** Maps a Supabase order row (with its order_items already fetched) into the client-facing shape. */
function orderRowForClient(row) {
  const order = {
    id: row.id, tenantId: row.tenant_id, clientId: row.client_id, total: Number(row.total),
    paymentStatus: row.payment_status, status: row.status, shippingAddress: row.shipping_address, createdAt: row.created_at,
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
    let tooLarge = false;
    // 30MB comfortably covers a base64-encoded file up to ~22MB raw — anything
    // genuinely larger than that goes through the large-file (TUS) path instead,
    // which never routes bytes through this JSON body parser at all. Exceeding
    // this returns a clean, catchable error instead of severing the connection,
    // which is what previously surfaced to the browser as an opaque "Failed to
    // fetch" with no useful message.
    req.on('data', chunk => {
      if (tooLarge) return;
      data += chunk;
      if (data.length > 30_000_000) { tooLarge = true; reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 })); }
    });
    req.on('end', () => { if (tooLarge) return; if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}
/** Reads the request body as raw text, WITHOUT JSON-parsing it. Required for
 * Stripe webhook signature verification (stripe.webhooks.constructEvent),
 * which needs the exact, byte-for-byte body Stripe signed — parsing and
 * re-serializing it (as readBody() does) breaks the signature. Only routes
 * that explicitly opt in via { rawBody: true } use this instead of the
 * normal JSON body parser; every other route is completely unaffected. */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      data += chunk;
      if (data.length > 30_000_000) { tooLarge = true; reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 })); }
    });
    req.on('end', () => { if (tooLarge) return; resolve(data); });
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
const { sendEmail: sendRealEmail, wrapEmailHtml, EMAIL_I18N, emailT } = require('./lib/email');
const AUTH_DRIVER = process.env.HADAM_AUTH_DRIVER || 'custom';
const authSupabase = AUTH_DRIVER === 'supabase' ? require('./lib/auth') : null;
const { logAuthEvent } = require('./lib/auditLog');
const { createPayment: createPaymentRecord, rowToPayment } = require('./lib/payments');
const stripeConnectLib = require('./lib/stripeConnect');
/** Lazily constructs the real Stripe client only if STRIPE_SECRET_KEY is
 * actually configured — mirrors the existing pattern for RESEND_API_KEY:
 * an unconfigured environment gets a clear error at the point of use,
 * not a crash at startup, so the rest of the app keeps working. */
let _stripeClient = null;
function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set.');
  if (!_stripeClient) _stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return _stripeClient;
}
const paypalConnectLib = require('./lib/paypalConnect');
/** OAuth token cache — client-credentials tokens are valid for a fixed
 * lifetime (typically ~9h); refetching for every call would be wasteful
 * and, more importantly, could hit rate limits during a burst of real
 * traffic. Refreshed automatically once expired. */
let _paypalTokenCache = null;
async function paypalApiCall(method, urlPath, body) {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw new Error('PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET are not set.');
  const base = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
  if (!_paypalTokenCache || _paypalTokenCache.expiresAt < Date.now()) {
    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')}` },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`PayPal OAuth failed: ${tokenData.error_description || tokenRes.status}`);
    _paypalTokenCache = { token: tokenData.access_token, expiresAt: Date.now() + (tokenData.expires_in - 60) * 1000 };
  }
  const res = await fetch(`${base}${urlPath}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_paypalTokenCache.token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `PayPal API error: ${res.status}`);
  return data;
}
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
    registrationEnabled: row.registration_enabled !== false, requireMfaForStaff: !!row.require_mfa_for_staff,
    enabledTiers: row.enabled_tiers || ['starter', 'professional', 'enterprise'],
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
  if (AUTH_DRIVER === 'supabase') {
    const admin = supabaseAdmin();
    const [{ data: tenantRows, error: tErr }, { data: productRows }, { data: orderRows }, { data: itemRows }, { data: memberRows }] = await Promise.all([
      admin.from('tenants').select('*'),
      admin.from('products').select('id, tenant_id'),
      admin.from('orders').select('id, tenant_id, payment_status'),
      admin.from('order_items').select('order_id, price, qty, status'),
      admin.from('tenant_memberships').select('tenant_id'),
    ]);
    if (tErr) return send(res, 500, { error: tErr.message });
    const successfulOrderIds = new Set((orderRows || []).filter(o => o.payment_status === 'success').map(o => o.id));
    const tenants = (tenantRows || []).map(row => {
      const t = rowToTenant(row);
      const tenantOrderIds = new Set((orderRows || []).filter(o => o.tenant_id === row.id).map(o => o.id));
      const revenue = (itemRows || [])
        .filter(i => tenantOrderIds.has(i.order_id) && successfulOrderIds.has(i.order_id) && i.status !== 'refunded')
        .reduce((s, i) => s + i.price * i.qty, 0);
      return {
        ...t,
        productCount: (productRows || []).filter(p => p.tenant_id === row.id).length,
        orderCount: tenantOrderIds.size,
        userCount: (memberRows || []).filter(m => m.tenant_id === row.id).length,
        revenue,
      };
    });
    return send(res, 200, { tenants, baseDomain: BASE_DOMAIN });
  }
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
/** Nudges customers who haven't confirmed (or disputed) a delivered item after a few days — one reminder per item, never repeated. */
async function checkDeliveryConfirmationReminders(reminderAfterDays = 3) {
  const cutoff = new Date(Date.now() - reminderAfterDays * 24 * 60 * 60 * 1000);
  let sent = 0;
  if (AUTH_DRIVER === 'supabase') {
    const admin = supabaseAdmin();
    const { data: pendingItems, error } = await admin.from('order_items').select('id, order_id, tenant_id, name, delivered_at')
      .eq('status', 'delivered').eq('fulfillment', 'shipping')
      .is('customer_confirmed_at', null).eq('customer_reported_problem', false).is('delivery_reminder_sent_at', null)
      .lt('delivered_at', cutoff.toISOString());
    if (error) { console.error('[delivery-reminder] lookup failed:', error.message); return 0; }
    for (const item of (pendingItems || [])) {
      try {
        const { data: order } = await admin.from('orders').select('client_id').eq('id', item.order_id).maybeSingle();
        const { data: tenant } = await admin.from('tenants').select('name, subdomain').eq('id', item.tenant_id).maybeSingle();
        if (!order || !tenant) continue;
        const { data: clientUser } = await admin.auth.admin.getUserById(order.client_id);
        if (!clientUser || !clientUser.user) continue;
        const orderUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}/orders`;
        const remindLang = await getRecipientLang(clientUser.user.email);
        const subject = emailT(EMAIL_I18N, 'deliveryReminderSubject', remindLang)(tenant.name);
        const text = emailT(EMAIL_I18N, 'deliveryReminderBody', remindLang)(item.name, orderUrl, tenant.name);
        await admin.from('notifications').insert({ tenant_id: item.tenant_id, type: 'delivery_confirmation_reminder', to_email: clientUser.user.email, subject, body: text });
        await sendRealEmail({ to: clientUser.user.email, subject, text, html: wrapEmailHtml(text, remindLang) });
        await admin.from('order_items').update({ delivery_reminder_sent_at: new Date().toISOString() }).eq('id', item.id);
        sent++;
      } catch (e) { console.error('[delivery-reminder] failed for item', item.id, ':', e.message); }
    }
    return sent;
  }
  for (const order of db.orders) {
    for (const item of order.items) {
      if (item.fulfillment !== 'shipping' || item.status !== 'delivered') continue;
      if (item.customerConfirmedAt || item.customerReportedProblem || item.deliveryReminderSentAt) continue;
      if (!item.deliveredAt || item.deliveredAt > cutoff.getTime()) continue;
      const tenant = db.tenants.find(t => t.id === order.tenantId);
      if (!tenant) continue;
      const orderUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}/orders`;
      const remindLang = await getRecipientLang(order.clientEmail);
      const subject = emailT(EMAIL_I18N, 'deliveryReminderSubject', remindLang)(tenant.name);
      const text = emailT(EMAIL_I18N, 'deliveryReminderBody', remindLang)(item.name, orderUrl, tenant.name);
      db.notifications.push({ id: newId('notif'), tenantId: order.tenantId, type: 'delivery_confirmation_reminder', to: order.clientEmail, subject, body: text, sentAt: Date.now() });
      try { await sendRealEmail({ to: order.clientEmail, subject, text, html: wrapEmailHtml(text, remindLang) }); } catch { /* best-effort */ }
      item.deliveryReminderSentAt = Date.now();
      sent++;
    }
  }
  await persist();
  return sent;
}

route('POST', '/api/platform/run-subscription-checks', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res) => {
  const sent = await checkSubscriptionAlerts();
  const expiredMembers = await expireLapsedMarketplaceMembers();
  const deliveryRemindersSent = await checkDeliveryConfirmationReminders();
  let checked;
  if (AUTH_DRIVER === 'supabase') {
    const { count } = await supabaseAdmin().from('tenants').select('*', { count: 'exact', head: true });
    checked = count || 0;
  } else {
    checked = db.tenants.length;
  }
  send(res, 200, { checked, notificationsSent: sent.length, marketplaceMembersExpired: expiredMembers, deliveryRemindersSent });
});


/**
 * Test-only backdoor: lets the automated test suite set a tenant's subscription expiry
 * directly, so alert-threshold behavior (1 month / 2 weeks / 1 week / expired) can be tested
 * deterministically instead of waiting for real days to pass. Gated behind an explicit env
 * flag that the test runner sets — returns 404 (as if the route doesn't exist) otherwise, so
 * this is never reachable in a real deployment even if the URL were guessed.
 */
route('PATCH', '/api/test-only/tenants/:id/expiry', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (process.env.HADAM_TEST_MODE !== '1') return send(res, 404, { error: apiT('notFound', reqLang(req)) });
  const tenant = db.tenants.find(t => t.id === params.id);
  if (!tenant) return send(res, 404, { error: apiT('tenantNotFound', reqLang(req)) });
  tenant.subscriptionExpiresAt = Number(body.subscriptionExpiresAt);
  if (body.resetAlertLevel) tenant.lastAlertLevel = null;
  await persist();
  send(res, 200, { tenant });
});
route('PATCH', '/api/test-only/marketplace-members/:id/expiry', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (process.env.HADAM_TEST_MODE !== '1') return send(res, 404, { error: apiT('notFound', reqLang(req)) });
  const member = db.marketplaceMembers.find(m => m.id === params.id);
  if (!member) return send(res, 404, { error: apiT('marketplaceMemberNotFound', reqLang(req)) });
  member.subscriptionExpiresAt = Number(body.subscriptionExpiresAt);
  await persist();
  send(res, 200, { member });
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
    const { data: subs } = await supabaseAdmin().from('current_subscriptions').select('tenant_id, expiry_date').in('tenant_id', tenants.map(t => t.id));
    const expiryByTenant = Object.fromEntries((subs || []).map(s => [s.tenant_id, s.expiry_date]));
    const stores = [];
    for (const t of tenants) {
      // A lapsed subscription removes a store from the shared directory,
      // regardless of its plan — this was previously never checked here at
      // all, so an expired store stayed listed indefinitely.
      const expiry = expiryByTenant[t.id];
      if (expiry && new Date(expiry).getTime() < Date.now()) continue;
      const { count } = await supabaseAnon.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
      stores.push({ memberType: 'store', subdomain: t.subdomain, name: t.name, tagline: t.tagline || '', translations: t.translations || {}, plan: t.plan, productCount: count || 0 });
    }
    const { data: members, error: memErr } = await supabaseAnon.from('marketplace_members').select('*').eq('status', 'active');
    if (memErr) return send(res, 500, { error: memErr.message });
    const externalMembers = (members || []).map(m => ({
      memberType: 'external', id: m.id, businessName: m.business_name, description: m.description || '', logoUrl: m.logo_url || '',
      websiteUrl: m.website_url, category: m.category || '', country: m.country || '', city: m.city || '', plan: m.plan || 'free',
    }));
    return send(res, 200, { stores, externalMembers, baseDomain: BASE_DOMAIN });
  }
  const stores = db.tenants.filter(t => t.status === 'active' && ['marketplace', 'both'].includes(t.plan) && !(t.subscriptionExpiresAt && t.subscriptionExpiresAt < Date.now())).map(t => ({
    memberType: 'store', subdomain: t.subdomain, name: t.name, tagline: t.tagline || '', translations: t.translations || {}, plan: t.plan,
    productCount: db.products.filter(p => p.tenantId === t.id).length,
  }));
  const externalMembers = db.marketplaceMembers.filter(m => m.status === 'active').map(m => ({
    memberType: 'external', id: m.id, businessName: m.businessName, description: m.description || '', logoUrl: m.logoUrl || '',
    websiteUrl: m.websiteUrl, category: m.category || '', country: m.country || '', city: m.city || '', plan: m.plan || 'free',
  }));
  send(res, 200, { stores, externalMembers, baseDomain: BASE_DOMAIN });
});

// Called after a Basic member successfully creates a full tenant (via the
// normal POST /api/platform/tenants flow) to link the two records — the
// membership and its business info are retained, not replaced, per the
// agreed upgrade path.
route('POST', '/api/platform/marketplace-members/:id/link-upgrade', { hostScope: 'platform' }, async (req, res, params, body) => {
  const { tenantId } = body;
  if (!tenantId) return send(res, 400, { error: apiT('tenantIdRequired', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('marketplace_members').update({ upgraded_to_tenant_id: tenantId }).eq('id', params.id).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    if (!data) return send(res, 404, { error: apiT('marketplaceMemberNotFound', reqLang(req)) });
    return send(res, 200, { ok: true });
  }
  const member = db.marketplaceMembers.find(m => m.id === params.id);
  if (!member) return send(res, 404, { error: apiT('marketplaceMemberNotFound', reqLang(req)) });
  member.upgradedToTenantId = tenantId;
  await persist();
  send(res, 200, { ok: true });
});
// subdomain, or tenant is created here; this is deliberately a lighter,
// separate record from the full store-creation flow below.
// Best-effort — never blocks or fails the membership signup/review if email
// delivery itself has a problem, same principle used for every other email
// in this app.
async function sendMarketplaceApplicationReceivedEmail(toEmail, businessName, ownerName, lang = 'en') {
  const safeLang = API_I18N[lang] ? lang : 'en';
  const subject = emailT(EMAIL_I18N, 'marketplaceReceivedSubject', safeLang)(businessName);
  const body = emailT(EMAIL_I18N, 'marketplaceReceivedBody', safeLang)(ownerName, businessName);
  try { await sendRealEmail({ to: toEmail, subject, text: body, html: wrapEmailHtml(body, safeLang) }); } catch { /* best-effort */ }
}
async function sendMarketplaceReviewEmail(toEmail, businessName, ownerName, action, note, lang = 'en') {
  const safeLang = API_I18N[lang] ? lang : 'en';
  const subject = emailT(EMAIL_I18N, 'marketplaceReviewSubject', safeLang)(action, businessName);
  const body = emailT(EMAIL_I18N, 'marketplaceReviewBody', safeLang)(action, businessName, ownerName, note);
  try { await sendRealEmail({ to: toEmail, subject, text: body, html: wrapEmailHtml(body, safeLang) }); } catch { /* best-effort */ }
}

route('POST', '/api/platform/marketplace-members', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'join-marketplace', 20, 5)) return;
  const { businessName, ownerName, email, phone, country, city, address, websiteUrl, category, description, logoUrl, socialLinks, registrationNumber, vatNumber, plan, card } = body;
  if (!businessName || !ownerName || !email || !websiteUrl) {
    return send(res, 400, { error: apiT('businessSignupFieldsRequired', reqLang(req)) });
  }
  if (!/^https?:\/\//i.test(websiteUrl)) return send(res, 400, { error: apiT('websiteUrlFormat', reqLang(req)) });
  // Prevent duplicate/conflicting Marketplace memberships: a rejected
  // application can be resubmitted, but anything else (pending, active,
  // more_info_requested, suspended, expired) means this email already has
  // a membership in progress or in force — direct them to renew/manage it
  // instead of creating a second, conflicting one.
  if (AUTH_DRIVER === 'supabase') {
    const { data: existing, error: dupErr } = await supabaseAdmin().from('marketplace_members').select('id, status, business_name').ilike('email', email).neq('status', 'rejected').maybeSingle();
    if (dupErr) return send(res, 500, { error: dupErr.message });
    if (existing) {
      return send(res, 409, { error: `This email already has a Marketplace membership (${existing.business_name}, status: ${existing.status}). Use the Renew tab to manage it instead of applying again.` });
    }
  } else {
    const existing = db.marketplaceMembers.find(m => m.email.toLowerCase() === email.toLowerCase() && m.status !== 'rejected');
    if (existing) {
      return send(res, 409, { error: `This email already has a Marketplace membership (${existing.businessName}, status: ${existing.status}). Use the Renew tab to manage it instead of applying again.` });
    }
  }
  const chosenPlan = ['free', 'featured'].includes(plan) ? plan : 'free';
  // Payment is still validated up front at application time — this avoids
  // reviewing free-text applications that would fail payment anyway — but
  // the member does not go live until a superadmin separately approves the
  // application. Being charged does not bypass review.
  if (chosenPlan === 'featured') {
    const cardDigits = (card && card.number || '').replace(/\s/g, '');
    if (cardDigits.length < 12) return send(res, 400, { error: apiT('validCardRequiredFeatured', reqLang(req)) });
    if (cardDigits === '0000000000000000') return send(res, 402, { error: apiT('cardDeclined', reqLang(req)) });
  }
  const cleanSocial = socialLinks && typeof socialLinks === 'object' ? socialLinks : {};
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('marketplace_members').insert({
      business_name: businessName, owner_name: ownerName, email, phone: phone || null, country: country || null, city: city || null, address: address || null,
      website_url: websiteUrl, category: category || null, description: (description || '').slice(0, 1000), logo_url: logoUrl || null,
      social_links: cleanSocial, registration_number: registrationNumber || null, vat_number: vatNumber || null, plan: chosenPlan, lang: reqLang(req),
    }).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    await sendMarketplaceApplicationReceivedEmail(data.email, data.business_name, data.owner_name, data.lang);
    return send(res, 201, { member: { id: data.id, businessName: data.business_name, plan: data.plan, status: data.status } });
  }
  const member = {
    id: newId('mm'), businessName, ownerName, email, phone: phone || null, country: country || null, city: city || null, address: address || null,
    websiteUrl, category: category || null, description: (description || '').slice(0, 1000), logoUrl: logoUrl || null,
    socialLinks: cleanSocial, registrationNumber: registrationNumber || null, vatNumber: vatNumber || null, plan: chosenPlan,
    status: 'pending', adminNote: null, createdAt: Date.now(), lang: reqLang(req),
  };
  db.marketplaceMembers.push(member);
  await persist();
  await sendMarketplaceApplicationReceivedEmail(member.email, member.businessName, member.ownerName, member.lang);
  send(res, 201, { member: { id: member.id, businessName: member.businessName, plan: member.plan, status: member.status } });
});

// Superadmin-only: list every marketplace membership application (any status)
// for review, and act on one (approve / reject / request more info / suspend
// / reactivate). Only 'active' members are ever visible in the public
// directory, regardless of what happens here.
// Security audit log viewer — superadmin only, across every store. Filters
// are all optional and combine with AND; results are always paginated,
// newest first, since this table can grow large and unbounded fast.
route('GET', '/api/platform/technical-manual', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res) => {
  const filePath = path.join(__dirname, 'docs', 'Hadam-Technical-Manual.docx');
  if (!fs.existsSync(filePath)) return send(res, 404, { error: apiT('techManualNotFound', reqLang(req)) });
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': 'attachment; filename="Hadam-Technical-Manual.docx"',
    ...SECURITY_HEADERS,
  });
  fs.createReadStream(filePath).pipe(res);
});

route('GET', '/api/platform/audit-log', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res, params, body, query) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 200, { entries: [], total: 0 });
  const admin = supabaseAdmin();
  const limit = Math.min(parseInt(query.get('limit')) || 50, 200);
  const offset = parseInt(query.get('offset')) || 0;
  let q = admin.from('auth_audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (query.get('eventType')) q = q.eq('event_type', query.get('eventType'));
  if (query.get('outcome')) q = q.eq('outcome', query.get('outcome'));
  if (query.get('email')) q = q.ilike('email', `%${query.get('email')}%`);
  if (query.get('tenantId')) q = q.eq('tenant_id', query.get('tenantId'));
  if (query.get('from')) q = q.gte('created_at', query.get('from'));
  if (query.get('to')) q = q.lte('created_at', query.get('to'));
  const { data, error, count } = await q;
  if (error) return send(res, 500, { error: error.message });
  const entries = data.map(row => ({
    id: row.id, tenantId: row.tenant_id, userId: row.user_id, email: row.email,
    eventType: row.event_type, outcome: row.outcome, ipAddress: row.ip_address,
    userAgent: row.user_agent, details: row.details, createdAt: row.created_at,
  }));
  send(res, 200, { entries, total: count || 0 });
});

route('GET', '/api/platform/marketplace-members', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('marketplace_members').select('*').order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { members: data.map(rowToMarketplaceMember) });
  }
  send(res, 200, { members: [...db.marketplaceMembers].sort((a, b) => b.createdAt - a.createdAt) });
});

const MARKETPLACE_MEMBER_ACTIONS = {
  approve: 'active', reject: 'rejected', request_more_info: 'more_info_requested', suspend: 'suspended', reactivate: 'active',
};
route('POST', '/api/platform/marketplace-members/:id/review', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res, params, body) => {
  const { action, note } = body;
  if (!MARKETPLACE_MEMBER_ACTIONS[action]) return send(res, 400, { error: `action must be one of: ${Object.keys(MARKETPLACE_MEMBER_ACTIONS).join(', ')}.` });
  const newStatus = MARKETPLACE_MEMBER_ACTIONS[action];
  if (AUTH_DRIVER === 'supabase') {
    const patch = { status: newStatus, admin_note: note || null };
    if (action === 'approve' || action === 'reactivate') {
      const { data: existing } = await supabaseAdmin().from('marketplace_members').select('plan, subscription_started_at').eq('id', params.id).maybeSingle();
      if (existing && existing.plan === 'featured') {
        // Approving starts a fresh 30-day term; reactivating a previously-suspended
        // Featured member extends from now rather than losing the remaining term.
        patch.subscription_started_at = existing.subscription_started_at || new Date().toISOString();
        patch.subscription_expires_at = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
      }
    }
    const { data, error } = await supabaseAdmin().from('marketplace_members').update(patch).eq('id', params.id).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    if (!data) return send(res, 404, { error: apiT('marketplaceMemberNotFound', reqLang(req)) });
    await sendMarketplaceReviewEmail(data.email, data.business_name, data.owner_name, action, note, data.lang);
    return send(res, 200, { member: rowToMarketplaceMember(data) });
  }
  const member = db.marketplaceMembers.find(m => m.id === params.id);
  if (!member) return send(res, 404, { error: apiT('marketplaceMemberNotFound', reqLang(req)) });
  member.status = newStatus;
  member.adminNote = note || null;
  if ((action === 'approve' || action === 'reactivate') && member.plan === 'featured') {
    member.subscriptionStartedAt = member.subscriptionStartedAt || Date.now();
    member.subscriptionExpiresAt = Date.now() + THIRTY_DAYS_MS;
  }
  await persist();
  await sendMarketplaceReviewEmail(member.email, member.businessName, member.ownerName, action, note, member.lang);
  send(res, 200, { member });
});

// Renews a Featured Marketplace membership — requires a valid card, same as
// every other paid-tier renewal in this app. Free-plan members have nothing
// to renew (no expiry at all), so this only ever applies to Featured.
// Lets an existing Hadam Store owner add Marketplace access to their own
// store directly from this page — a real, selectable path rather than just
// an instruction to go elsewhere. Verifies the admin's own credentials
// against the specific tenant they name (never creates a new store or
// subdomain), and requires payment before the plan actually changes.
// Renews an existing Hadam Store's subscription tier directly from the
// platform site — verifies the caller's own admin credentials against the
// named store (never creates or touches any other store), and requires
// payment before anything actually extends.
// Preview-only: shows current subscription status/plan/expiry before any
// payment happens, matching the spec's required review step. Verifies real
// credentials (so this can't be used to snoop on another store) but changes
// nothing and charges nothing.
route('POST', '/api/platform/store-subscription-status', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'store-subscription-status', 20, 5)) return;
  const { subdomain, adminEmail, adminPassword } = body;
  if (!subdomain || !adminEmail || !adminPassword) return send(res, 400, { error: apiT('subdomainEmailPasswordRequired', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    const { data: tenantRow, error: tenantErr } = await supabaseAdmin().from('tenants').select('*').eq('subdomain', subdomain.toLowerCase().trim()).maybeSingle();
    if (tenantErr) return send(res, 500, { error: tenantErr.message });
    if (!tenantRow) return send(res, 404, { error: apiT('noStoreForSubdomain', reqLang(req)) });
    let loginResult;
    try { loginResult = await authSupabase.login(adminEmail, adminPassword); } catch (e) { return send(res, 401, { error: e.message }); }
    if (loginResult.mfaRequired) return send(res, 401, { error: apiT('mfaCheckFromOwnPanel1', reqLang(req)) });
    const role = await authSupabase.getMembership(loginResult.session.access_token, tenantRow.id);
    if (role !== 'admin') return send(res, 403, { error: apiT('onlyStoreAdminViewSub', reqLang(req)) });
    const { data: sub } = await supabaseAdmin().from('current_subscriptions').select('*, plans(*)').eq('tenant_id', tenantRow.id).maybeSingle();
    const expiresAt = sub ? sub.expiry_date : null;
    const daysLeft = expiresAt ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
    return send(res, 200, {
      plan: tenantRow.plan, subscriptionTier: sub && sub.plans ? sub.plans.name : 'starter',
      subscriptionExpiresAt: expiresAt, status: expiresAt && new Date(expiresAt).getTime() < Date.now() ? 'expired' : 'active',
      daysUntilExpiry: daysLeft,
    });
  }
  const tenant = db.tenants.find(t => t.subdomain === subdomain.toLowerCase().trim());
  if (!tenant) return send(res, 404, { error: apiT('noStoreForSubdomain', reqLang(req)) });
  const user = findUserByEmail(adminEmail, tenant.id);
  if (!user || user.role !== 'admin' || !verifyPassword(adminPassword, user.passwordHash)) return send(res, 401, { error: apiT('incorrectStoreAdminLogin', reqLang(req)) });
  send(res, 200, {
    plan: tenant.plan, subscriptionTier: tenant.subscriptionTier || 'starter', subscriptionExpiresAt: tenant.subscriptionExpiresAt,
    status: tenant.subscriptionExpiresAt && tenant.subscriptionExpiresAt < Date.now() ? 'expired' : 'active',
    daysUntilExpiry: tenant.subscriptionExpiresAt ? Math.ceil((tenant.subscriptionExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)) : null,
  });
});

// Same preview principle for Marketplace members — looked up by email + business name, same as the actual renewal.
route('POST', '/api/platform/marketplace-members/status-by-email', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'marketplace-status-by-email', 20, 5)) return;
  const { email, businessName } = body;
  if (!email || !businessName) return send(res, 400, { error: apiT('emailBusinessNameRequired', reqLang(req)) });
  let member;
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('marketplace_members').select('*').ilike('email', email).ilike('business_name', businessName).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    member = data ? rowToMarketplaceMember(data) : null;
  } else {
    member = db.marketplaceMembers.find(m => m.email.toLowerCase() === email.toLowerCase() && m.businessName.toLowerCase() === businessName.toLowerCase()) || null;
  }
  if (!member) return send(res, 404, { error: apiT('noMembershipMatch', reqLang(req)) });
  const daysLeft = member.subscriptionExpiresAt ? Math.ceil((new Date(member.subscriptionExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  send(res, 200, { plan: member.plan, status: member.status, subscriptionExpiresAt: member.subscriptionExpiresAt, daysUntilExpiry: daysLeft });
});

route('POST', '/api/platform/renew-store-subscription', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'renew-store-subscription', 15, 5)) return;
  const { subdomain, adminEmail, adminPassword, tier, card, includeMarketplace } = body;
  if (!subdomain || !adminEmail || !adminPassword) return send(res, 400, { error: apiT('subdomainEmailPasswordRequired', reqLang(req)) });
  if (!SUBSCRIPTION_TIERS[tier]) return send(res, 400, { error: `tier must be one of: ${Object.keys(SUBSCRIPTION_TIERS).join(', ')}.` });
  const cardFormatError = validateFullCard(card, reqLang(req));
  if (cardFormatError) return send(res, 400, { error: cardFormatError });
  const cardDigits = (card && card.number || '').replace(/\s/g, '');
  if (cardDigits === '0000000000000000') return send(res, 402, { error: apiT('cardDeclined', reqLang(req)) });

  if (AUTH_DRIVER === 'supabase') {
    const { data: tenantRow, error: tenantErr } = await supabaseAdmin().from('tenants').select('*').eq('subdomain', subdomain.toLowerCase().trim()).maybeSingle();
    if (tenantErr) return send(res, 500, { error: tenantErr.message });
    if (!tenantRow) return send(res, 404, { error: apiT('noStoreForSubdomain', reqLang(req)) });
    let loginResult;
    try { loginResult = await authSupabase.login(adminEmail, adminPassword); } catch (e) { return send(res, 401, { error: e.message }); }
    if (loginResult.mfaRequired) return send(res, 401, { error: apiT('mfaRenewFromOwnPanel', reqLang(req)) });
    const role = await authSupabase.getMembership(loginResult.session.access_token, tenantRow.id);
    if (role !== 'admin') return send(res, 403, { error: apiT('onlyStoreAdminRenew', reqLang(req)) });
    const { data: currentSub } = await supabaseAdmin().from('current_subscriptions').select('expiry_date').eq('tenant_id', tenantRow.id).maybeSingle();
    const { data: plan } = await supabaseAdmin().from('plans').select('id').eq('name', tier).maybeSingle();
    const currentExpiry = currentSub ? new Date(currentSub.expiry_date).getTime() : Date.now();
    const newExpiry = new Date(Math.max(Date.now(), currentExpiry) + THIRTY_DAYS_MS).toISOString().slice(0, 10);
    if (plan) await supabaseAdmin().from('subscriptions').insert({ tenant_id: tenantRow.id, plan_id: plan.id, expiry_date: newExpiry, payment_status: 'paid' });
    if (includeMarketplace && tenantRow.plan !== 'both' && tenantRow.plan !== 'marketplace') {
      await supabaseAdmin().from('tenants').update({ plan: 'both' }).eq('id', tenantRow.id);
    }
    notifySuperadminsOfRenewal({
      clientName: tenantRow.name, clientEmail: adminEmail,
      servicesRenewed: includeMarketplace ? `${tenantRow.name} — Store (${tier}) + Marketplace` : `${tenantRow.name} — Store (${tier})`,
      subscriptionStart: new Date().toISOString().slice(0, 10), subscriptionEnd: newExpiry,
    }); // fire-and-forget — the renewal itself has already succeeded regardless of whether this email goes out
    return send(res, 200, { tenant: { subdomain: tenantRow.subdomain, name: tenantRow.name, subscriptionTier: tier, subscriptionExpiresAt: newExpiry } });
  }
  const tenant = db.tenants.find(t => t.subdomain === subdomain.toLowerCase().trim());
  if (!tenant) return send(res, 404, { error: apiT('noStoreForSubdomain', reqLang(req)) });
  const user = findUserByEmail(adminEmail, tenant.id);
  if (!user || user.role !== 'admin' || !verifyPassword(adminPassword, user.passwordHash)) return send(res, 401, { error: apiT('incorrectStoreAdminLogin', reqLang(req)) });
  tenant.subscriptionTier = tier;
  tenant.subscriptionExpiresAt = Math.max(Date.now(), tenant.subscriptionExpiresAt || Date.now()) + THIRTY_DAYS_MS;
  tenant.lastAlertLevel = null;
  if (includeMarketplace && tenant.plan !== 'both' && tenant.plan !== 'marketplace') tenant.plan = 'both';
  await persist();
  notifySuperadminsOfRenewal({
    clientName: tenant.name, clientEmail: adminEmail,
    servicesRenewed: includeMarketplace ? `${tenant.name} — Store (${tier}) + Marketplace` : `${tenant.name} — Store (${tier})`,
    subscriptionStart: new Date().toISOString().slice(0, 10), subscriptionEnd: new Date(tenant.subscriptionExpiresAt).toISOString().slice(0, 10),
  });
  send(res, 200, { tenant });
});

route('POST', '/api/platform/add-marketplace-to-store', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'add-marketplace-to-store', 15, 5)) return;
  const { subdomain, adminEmail, adminPassword, card } = body;
  if (!subdomain || !adminEmail || !adminPassword) return send(res, 400, { error: apiT('subdomainEmailPasswordRequired', reqLang(req)) });
  const cardFormatError = validateFullCard(card, reqLang(req));
  if (cardFormatError) return send(res, 400, { error: cardFormatError });
  const cardDigits = (card && card.number || '').replace(/\s/g, '');
  if (cardDigits === '0000000000000000') return send(res, 402, { error: apiT('cardDeclined', reqLang(req)) });

  if (AUTH_DRIVER === 'supabase') {
    const { data: tenant, error: tenantErr } = await supabaseAdmin().from('tenants').select('*').eq('subdomain', subdomain.toLowerCase().trim()).maybeSingle();
    if (tenantErr) return send(res, 500, { error: tenantErr.message });
    if (!tenant) return send(res, 404, { error: apiT('noStoreForSubdomain', reqLang(req)) });
    let loginResult;
    try { loginResult = await authSupabase.login(adminEmail, adminPassword); } catch (e) { return send(res, 401, { error: e.message }); }
    if (loginResult.mfaRequired) return send(res, 401, { error: apiT('mfaAddMarketFromOwnPanel', reqLang(req)) });
    const role = await authSupabase.getMembership(loginResult.session.access_token, tenant.id);
    if (role !== 'admin') return send(res, 403, { error: apiT('onlyStoreAdminAddMarket', reqLang(req)) });
    if (tenant.plan === 'marketplace' || tenant.plan === 'both') return send(res, 400, { error: apiT('storeAlreadyHasMarketplace', reqLang(req)) });
    const { data: updated, error: updateErr } = await supabaseAdmin().from('tenants').update({ plan: 'both' }).eq('id', tenant.id).select().maybeSingle();
    if (updateErr) return send(res, 400, { error: updateErr.message });
    return send(res, 200, { tenant: rowToTenant(updated) });
  }
  const tenant = db.tenants.find(t => t.subdomain === subdomain.toLowerCase().trim());
  if (!tenant) return send(res, 404, { error: apiT('noStoreForSubdomain', reqLang(req)) });
  const user = findUserByEmail(adminEmail, tenant.id);
  if (!user || user.role !== 'admin' || !verifyPassword(adminPassword, user.passwordHash)) return send(res, 401, { error: apiT('incorrectStoreAdminLogin', reqLang(req)) });
  if (tenant.plan === 'marketplace' || tenant.plan === 'both') return send(res, 400, { error: apiT('storeAlreadyHasMarketplace', reqLang(req)) });
  tenant.plan = 'both';
  await persist();
  send(res, 200, { tenant });
});

// Marketplace members have no login of their own, so they can't reference
// their own ID directly — renewal here is looked up by email + business name
// together (a simple shared-secret pair only the actual applicant would know),
// then delegates to the same real payment-gated renewal logic as the ID-based
// endpoint above.
route('POST', '/api/platform/marketplace-members/renew-by-email', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'renew-by-email', 10, 5)) return;
  const { email, businessName, card } = body;
  if (!email || !businessName) return send(res, 400, { error: apiT('emailBusinessNameRequired', reqLang(req)) });
  let memberId;
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('marketplace_members').select('id').ilike('email', email).ilike('business_name', businessName).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    if (!data) return send(res, 404, { error: apiT('noMembershipMatch', reqLang(req)) });
    memberId = data.id;
  } else {
    const member = db.marketplaceMembers.find(m => m.email.toLowerCase() === email.toLowerCase() && m.businessName.toLowerCase() === businessName.toLowerCase());
    if (!member) return send(res, 404, { error: apiT('noMembershipMatch', reqLang(req)) });
    memberId = member.id;
  }
  return renewMarketplaceMember(req, res, { id: memberId }, body);
});
async function renewMarketplaceMember(req, res, params, body) {
  const cardFormatError = validateFullCard(body.card, reqLang(req));
  if (cardFormatError) return send(res, 400, { error: cardFormatError });
  const cardDigits = (body.card && body.card.number || '').replace(/\s/g, '');
  if (cardDigits === '0000000000000000') return send(res, 402, { error: apiT('cardDeclined', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    const { data: existing, error: findErr } = await supabaseAdmin().from('marketplace_members').select('plan, status, subscription_expires_at').eq('id', params.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: apiT('marketplaceMemberNotFound', reqLang(req)) });
    if (existing.plan !== 'featured') return send(res, 400, { error: apiT('onlyFeaturedRenewable', reqLang(req)) });
    const currentExpiry = existing.subscription_expires_at ? new Date(existing.subscription_expires_at).getTime() : Date.now();
    const newExpiry = new Date(Math.max(Date.now(), currentExpiry) + THIRTY_DAYS_MS).toISOString();
    // A renewal also un-expires a lapsed membership, same as the tenant renewal flow.
    const patch = { subscription_expires_at: newExpiry, status: existing.status === 'expired' ? 'active' : existing.status };
    const { data, error } = await supabaseAdmin().from('marketplace_members').update(patch).eq('id', params.id).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    notifySuperadminsOfRenewal({
      clientName: data.business_name, clientEmail: data.email,
      servicesRenewed: `${data.business_name} — Marketplace (Featured)`,
      subscriptionStart: new Date().toISOString().slice(0, 10), subscriptionEnd: newExpiry.slice(0, 10),
    });
    return send(res, 200, { member: rowToMarketplaceMember(data) });
  }
  const member = db.marketplaceMembers.find(m => m.id === params.id);
  if (!member) return send(res, 404, { error: apiT('marketplaceMemberNotFound', reqLang(req)) });
  if (member.plan !== 'featured') return send(res, 400, { error: apiT('onlyFeaturedRenewable', reqLang(req)) });
  member.subscriptionExpiresAt = Math.max(Date.now(), member.subscriptionExpiresAt || Date.now()) + THIRTY_DAYS_MS;
  if (member.status === 'expired') member.status = 'active';
  await persist();
  notifySuperadminsOfRenewal({
    clientName: member.businessName, clientEmail: member.email,
    servicesRenewed: `${member.businessName} — Marketplace (Featured)`,
    subscriptionStart: new Date().toISOString().slice(0, 10), subscriptionEnd: new Date(member.subscriptionExpiresAt).toISOString().slice(0, 10),
  });
  send(res, 200, { member });
}
route('POST', '/api/platform/marketplace-members/:id/renew', { hostScope: 'platform' }, renewMarketplaceMember);

// Automatically expires any Featured membership whose subscription has
// lapsed without renewal — mirrors checkSubscriptionAlerts for tenants, but
// this one actually flips status (not just sends alert emails), since
// Marketplace members have no admin login of their own to notice a warning.
async function expireLapsedMarketplaceMembers() {
  const now = Date.now();
  if (AUTH_DRIVER === 'supabase') {
    const { data: lapsed } = await supabaseAdmin().from('marketplace_members').select('id').eq('plan', 'featured').eq('status', 'active').lt('subscription_expires_at', new Date(now).toISOString());
    for (const m of (lapsed || [])) {
      await supabaseAdmin().from('marketplace_members').update({ status: 'expired' }).eq('id', m.id);
    }
    return (lapsed || []).length;
  }
  let count = 0;
  for (const m of db.marketplaceMembers) {
    if (m.plan === 'featured' && m.status === 'active' && m.subscriptionExpiresAt && m.subscriptionExpiresAt < now) {
      m.status = 'expired';
      count++;
    }
  }
  if (count) await persist();
  return count;
}
function rowToMarketplaceMember(m) {
  return {
    id: m.id, businessName: m.business_name, ownerName: m.owner_name, email: m.email, phone: m.phone, country: m.country, city: m.city, address: m.address,
    websiteUrl: m.website_url, category: m.category, description: m.description, logoUrl: m.logo_url, socialLinks: m.social_links || {},
    registrationNumber: m.registration_number, vatNumber: m.vat_number, plan: m.plan, status: m.status, adminNote: m.admin_note,
    subscriptionStartedAt: m.subscription_started_at, subscriptionExpiresAt: m.subscription_expires_at, createdAt: m.created_at,
  };
}

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
  if (!name || !email || !message) return send(res, 400, { error: apiT('nameEmailMessageRequired', reqLang(req)) });
  const trimmedMessage = message.slice(0, 2000);
  if (AUTH_DRIVER === 'supabase') {
    const { error } = await supabaseAnon.from('platform_messages').insert({ name, email, message: trimmedMessage });
    if (error) return send(res, 400, { error: error.message });
    notifySuperadminsOfContactMessage({ name, email, message: trimmedMessage });
    return send(res, 201, { ok: true });
  }
  db.platformMessages.push({ id: newId('pm'), name, email, message: trimmedMessage, createdAt: Date.now(), status: 'open' });
  await persist();
  notifySuperadminsOfContactMessage({ name, email, message: trimmedMessage });
  send(res, 201, { ok: true });
});

route('GET', '/api/platform/contact', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data: rows, error } = await supabaseAdmin().from('platform_messages').select('*').order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { messages: (rows || []).map(r => ({ id: r.id, name: r.name, email: r.email, message: r.message, createdAt: r.created_at, status: r.status || 'open' })) });
  }
  send(res, 200, { messages: [...db.platformMessages].sort((a, b) => b.createdAt - a.createdAt) });
});

route('POST', '/api/platform/tenants', { hostScope: 'platform' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'create-tenant', 30, 5)) return;
  const { subdomain, storeName, adminName, adminEmail, adminPassword, plan, tagline, subscriptionTier, card } = body;
  const sub = (subdomain || '').toLowerCase().trim();
  if (!/^[a-z0-9-]{2,30}$/.test(sub)) return send(res, 400, { error: apiT('subdomainFormat', reqLang(req)) });
  if (RESERVED_SUBDOMAINS.has(sub)) return send(res, 400, { error: apiT('subdomainReserved', reqLang(req)) });
  if (!storeName || !adminName || !adminEmail || !adminPassword || adminPassword.length < 6) {
    return send(res, 400, { error: apiT('storeSignupFieldsRequired', reqLang(req)) });
  }
  const chosenPlan = TENANT_PLANS.includes(plan) ? plan : null;
  if (!chosenPlan) return send(res, 400, { error: `plan must be one of: ${TENANT_PLANS.join(', ')}.` });
  const chosenTier = subscriptionTier || 'starter';

  if (AUTH_DRIVER === 'supabase') {
    const { data: existingTenant } = await supabaseAnon.from('tenants').select('id').eq('subdomain', sub).maybeSingle();
    if (existingTenant) return send(res, 409, { error: apiT('subdomainTaken', reqLang(req)) });

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
        return send(res, 409, { error: apiT('emailRegisteredDifferentPassword', reqLang(req)) });
      }
    }
    if (!session) return send(res, 200, { ok: true, note: 'Check your email to confirm your account, then try creating the store again.' });

    const { data: planRow, error: planErr } = await supabaseAnon.from('plans').select('*').eq('name', chosenTier).maybeSingle();
    if (planErr) return send(res, 500, { error: planErr.message });
    if (!planRow) return send(res, 400, { error: `Unknown subscription tier: ${chosenTier}. (Make sure the plans table has been seeded.)` });
    const tierFee = Number(planRow.monthly_price), planId = planRow.id;
    if (tierFee > 0) {
      const cardFormatError = validateFullCard(card, reqLang(req));
      if (cardFormatError) return send(res, 400, { error: cardFormatError });
      const cardDigits = (card && card.number || '').replace(/\s/g, '');
      if (cardDigits.replace(/0/g, '').length === 0) return send(res, 402, { error: apiT('paymentDeclinedTryDifferent', reqLang(req)) });
    }

    const client = supabaseForRequest(session.access_token);
    const { data: tenantRow, error: tenantErr } = await client.from('tenants').insert({ subdomain: sub, name: storeName, plan: chosenPlan, tagline: (tagline || '').slice(0, 200) }).select().maybeSingle();
    if (tenantErr) return send(res, 400, { error: tenantErr.message });
    if (!tenantRow) return send(res, 500, { error: apiT('storeCreationFailed', reqLang(req)) });
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

  if (findTenantBySubdomain(sub)) return send(res, 409, { error: apiT('subdomainTaken', reqLang(req)) });
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
    const cardFormatError = validateFullCard(card, reqLang(req));
    if (cardFormatError) return send(res, 400, { error: cardFormatError });
    const cardDigits = (card && card.number || '').replace(/\s/g, '');
    const paymentSucceeded = cardDigits.replace(/0/g, '').length > 0;
    if (!paymentSucceeded) return send(res, 402, { error: apiT('paymentDeclinedTryDifferent', reqLang(req)) });
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
  if (AUTH_DRIVER === 'supabase') {
    if (!body.status || !['active', 'suspended'].includes(body.status)) {
      const { data: row } = await supabaseAdmin().from('tenants').select('*').eq('id', params.id).maybeSingle();
      if (!row) return send(res, 404, { error: apiT('tenantNotFound', reqLang(req)) });
      return send(res, 200, { tenant: rowToTenant(row) });
    }
    const { data: row, error } = await supabaseAdmin().from('tenants').update({ status: body.status }).eq('id', params.id).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    if (!row) return send(res, 404, { error: apiT('tenantNotFound', reqLang(req)) });
    return send(res, 200, { tenant: rowToTenant(row) });
  }
  const tenant = db.tenants.find(t => t.id === params.id);
  if (!tenant) return send(res, 404, { error: apiT('tenantNotFound', reqLang(req)) });
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
  if (tenant.closedBySelf) return send(res, 403, { error: apiT('storeClosedNoAccounts', reqLang(req)) });
  if (tenant.registrationEnabled === false) return send(res, 403, { error: apiT('storeNotAcceptingAccounts', reqLang(req)) });
  const { name, email, password } = body;
  if (!name || !email || !password) return send(res, 400, { error: apiT('nameEmailPasswordRequired', reqLang(req)) });
  if (password.length < 6) return send(res, 400, { error: apiT('passwordMin6', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    try {
      const { user: supaUser, session } = await authSupabase.register(email, password, name);
      if (!session) return send(res, 200, { ok: true, note: 'Check your email to confirm your account before logging in.' });
      await authSupabase.joinTenant(session.access_token, tenant.id, 'client');
      return send(res, 201, { user: { id: supaUser.id, name, email, role: 'client', tenantId: tenant.id }, token: session.access_token });
    } catch (e) { return send(res, 409, { error: e.message }); }
  }
  if (findUserByEmail(email, tenant.id)) return send(res, 409, { error: apiT('accountExistsForStore', reqLang(req)) });
  const u = { id: newId('u'), name, email, passwordHash: hashPassword(password), role: 'client', tenantId: tenant.id, createdAt: Date.now() };
  db.users.push(u);
  await persist();
  send(res, 201, { user: publicUser(u), token: signToken({ sub: u.id, role: u.role, tenantId: u.tenantId }) });
});

async function buildSupabaseLoginResponse(supaUser, session, hostCtx, tenant) {
  if (!session || !session.access_token) throw new Error('Verification could not be completed — please try again.');
  const profile = await authSupabase.getProfile(session.access_token);
  const email = supaUser.email;
  if (hostCtx.isPlatform) {
    if (!profile.is_superadmin) return null;
    return { user: { id: supaUser.id, name: profile.full_name || email, email, role: 'superadmin', tenantId: null }, token: session.access_token };
  }
  const role = await authSupabase.getMembership(session.access_token, tenant.id);
  if (!role) return null; // authenticated identity, but no account at THIS store
  let mfaSetupRequired = false;
  if (tenant.requireMfaForStaff && (role === 'admin' || role === 'employee')) {
    // Flagged, not hard-blocked — an outright block here risks locking every
    // admin out of their own store if this policy gets turned on before
    // anyone has enrolled. The frontend uses this to route them straight to
    // MFA setup instead of the normal dashboard until they've done so.
    const factors = await authSupabase.listMfaFactors(session.access_token);
    mfaSetupRequired = !factors.some(f => f.status === 'verified');
  }
  return { user: { id: supaUser.id, name: profile.full_name || email, email, role, tenantId: tenant.id }, token: session.access_token, mfaSetupRequired };
}

route('POST', '/api/auth/login', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {
  if (rateLimited(req, res, 'login', 30, 5)) return;
  const { email, password } = body;
  if (AUTH_DRIVER === 'supabase') {
    try {
      const result = await authSupabase.login(email, password);
      if (result.mfaRequired) {
        // Deliberately does not include a usable token or reveal role/store
        // membership yet — none of that is confirmed until the MFA code is
        // verified. The tempToken is only ever accepted by the MFA
        // challenge/verify endpoints below, nothing else.
        return send(res, 200, { mfaRequired: true, factorId: result.factorId, tempToken: result.tempToken, methods: result.methods });
      }
      const built = await buildSupabaseLoginResponse(result.user, result.session, hostCtx, tenant);
      if (!built) {
        logAuthEvent({ email, tenantId: tenant ? tenant.id : null, eventType: 'login_failure', outcome: 'failure', req });
        return send(res, 401, { error: apiT('incorrectLogin', reqLang(req)) });
      }
      logAuthEvent({ userId: result.user.id, email, tenantId: tenant ? tenant.id : null, eventType: 'login_success', req });
      return send(res, 200, { ...built, mfaRequired: false });
    } catch {
      logAuthEvent({ email, tenantId: tenant ? tenant.id : null, eventType: 'login_failure', outcome: 'failure', req });
      return send(res, 401, { error: apiT('incorrectLogin', reqLang(req)) });
    }
  }
  const found = hostCtx.isPlatform ? (email && findSuperadminByEmail(email)) : (email && tenant && findUserByEmail(email, tenant.id));
  if (!found || !verifyPassword(password || '', found.passwordHash)) return send(res, 401, { error: apiT('incorrectLogin', reqLang(req)) });
  send(res, 200, { user: publicUser(found), token: signToken({ sub: found.id, role: found.role, tenantId: found.tenantId }), mfaRequired: false });
});

route('POST', '/api/auth/mfa/login-verify', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {
  if (rateLimited(req, res, 'mfa-login-verify', 10, 5)) return;
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const { tempToken, factorId, code } = body;
  if (!tempToken || !factorId || !code) return send(res, 400, { error: apiT('tempTokenFactorCodeRequired', reqLang(req)) });
  try {
    // The challenge is created here, immediately before verifying — not
    // earlier when the login prompt first opened. A TOTP code only lives for
    // 30 seconds, and Supabase's own challenge has a short window too; the
    // old two-step flow created the challenge as soon as the prompt showed,
    // giving the time the user spent finding and typing their code a real
    // chance to make it stale. Doing both in the same instant removes that
    // problem entirely rather than just extending a timeout.
    const challengeId = await authSupabase.createMfaLoginChallenge(tempToken, factorId);
    const { user: supaUser, session } = await authSupabase.verifyMfaLoginChallenge(tempToken, factorId, challengeId, code);
    const built = await buildSupabaseLoginResponse(supaUser, session, hostCtx, tenant);
    if (!built) {
      logAuthEvent({ userId: supaUser.id, email: supaUser.email, eventType: 'login_failure', outcome: 'failure', req });
      return send(res, 401, { error: apiT('incorrectLogin', reqLang(req)) });
    }
    logAuthEvent({ userId: supaUser.id, email: supaUser.email, eventType: 'mfa_totp_verify_success', req });
    send(res, 200, built);
  } catch (e) {
    logAuthEvent({ eventType: 'mfa_totp_verify_failure', outcome: 'failure', req, details: { error: e.message } });
    send(res, 400, { error: e.message });
  }
});

route('POST', '/api/auth/mfa/enroll', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  try {
    const result = await authSupabase.enrollMfaFactor(bearerToken(req));
    send(res, 200, result);
  } catch (e) { send(res, 400, { error: e.message }); }
});

route('POST', '/api/auth/mfa/verify-enrollment', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const { factorId, code } = body;
  if (!factorId || !code) return send(res, 400, { error: apiT('factorIdCodeRequired', reqLang(req)) });
  try {
    await authSupabase.verifyMfaEnrollment(bearerToken(req), factorId, code);
    logAuthEvent({ userId: user.id, email: user.email, eventType: 'mfa_totp_enrolled', req });
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
});

// Email OTP — an alternative MFA method for users without an authenticator
// app. Toggle on/off requires a real (already-logged-in) session; request
// and verify use the tempToken from the login flow, the same as TOTP.
route('POST', '/api/auth/mfa/email-otp/toggle', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  try {
    await authSupabase.toggleEmailOtpMfa(bearerToken(req), !!body.enabled);
    logAuthEvent({ userId: user.id, email: user.email, eventType: body.enabled ? 'mfa_email_otp_enabled' : 'mfa_email_otp_disabled', req });
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
});
route('GET', '/api/auth/mfa/email-otp/status', { hostScope: 'any', auth: true }, async (req, res) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 200, { enabled: false });
  try {
    const enabled = await authSupabase.getEmailOtpMfaStatus(bearerToken(req));
    send(res, 200, { enabled });
  } catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', '/api/auth/mfa/email-otp/request', { hostScope: 'any' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'email-otp-request', 8, 5)) return;
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  if (!body.tempToken) return send(res, 400, { error: apiT('tempTokenRequired', reqLang(req)) });
  try {
    await authSupabase.requestEmailOtp(body.tempToken, reqLang(req));
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', '/api/auth/mfa/email-otp/verify', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {
  if (rateLimited(req, res, 'email-otp-verify', 10, 5)) return;
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const { tempToken, code } = body;
  if (!tempToken || !code) return send(res, 400, { error: apiT('tempTokenCodeRequired', reqLang(req)) });
  try {
    const { user: supaUser, session } = await authSupabase.verifyEmailOtp(tempToken, code);
    const built = await buildSupabaseLoginResponse(supaUser, session, hostCtx, tenant);
    if (!built) {
      logAuthEvent({ userId: supaUser.id, email: supaUser.email, eventType: 'login_failure', outcome: 'failure', req });
      return send(res, 401, { error: apiT('incorrectLogin', reqLang(req)) });
    }
    logAuthEvent({ userId: supaUser.id, email: supaUser.email, eventType: 'mfa_email_otp_verify_success', req });
    send(res, 200, built);
  } catch (e) {
    logAuthEvent({ eventType: 'mfa_email_otp_verify_failure', outcome: 'failure', req, details: { error: e.message } });
    send(res, 400, { error: e.message });
  }
});

// Backup/recovery codes — a fallback when neither the authenticator app nor
// email access is available. Generated 10 at a time; regenerating always
// invalidates the previous set entirely.
route('POST', '/api/auth/mfa/backup-codes/generate', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  try {
    const codes = await authSupabase.generateBackupCodes(bearerToken(req));
    logAuthEvent({ userId: user.id, email: user.email, eventType: 'mfa_backup_codes_generated', req });
    send(res, 200, { codes });
  } catch (e) { send(res, 400, { error: e.message }); }
});
route('GET', '/api/auth/mfa/backup-codes/status', { hostScope: 'any', auth: true }, async (req, res) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 200, { remaining: 0 });
  try {
    const remaining = await authSupabase.getBackupCodeStatus(bearerToken(req));
    send(res, 200, { remaining });
  } catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', '/api/auth/mfa/backup-codes/verify', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {
  if (rateLimited(req, res, 'backup-code-verify', 10, 5)) return;
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const { tempToken, code } = body;
  if (!tempToken || !code) return send(res, 400, { error: apiT('tempTokenCodeRequired', reqLang(req)) });
  try {
    const { user: supaUser, session } = await authSupabase.verifyBackupCodeLogin(tempToken, code);
    const built = await buildSupabaseLoginResponse(supaUser, session, hostCtx, tenant);
    if (!built) {
      logAuthEvent({ userId: supaUser.id, email: supaUser.email, eventType: 'login_failure', outcome: 'failure', req });
      return send(res, 401, { error: apiT('incorrectLogin', reqLang(req)) });
    }
    logAuthEvent({ userId: supaUser.id, email: supaUser.email, eventType: 'mfa_backup_code_used', req, details: { context: 'login' } });
    send(res, 200, built);
  } catch (e) {
    logAuthEvent({ eventType: 'mfa_backup_code_verify_failure', outcome: 'failure', req, details: { error: e.message } });
    send(res, 400, { error: e.message });
  }
});
// Checked before the MFA code step even runs — lets the recovery flow
// reject a same-as-current password immediately, without making the
// person go through a code step first just to find out their choice was
// invalid. Tightly rate-limited: this is effectively a password-guessing
// oracle (each check is a real sign-in attempt), so it needs the same
// caution as a login endpoint, not the looser limits used elsewhere in
// this recovery flow.
route('POST', '/api/auth/check-password-different', { hostScope: 'any' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'check-password-different', 8, 5)) return;
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('checkSupabaseOnly', reqLang(req)) });
  const { recoveryAccessToken, newPassword } = body;
  if (!recoveryAccessToken || !newPassword) return send(res, 400, { error: apiT('recoveryTokenPasswordRequired', reqLang(req)) });
  try {
    const isSame = await authSupabase.isPasswordSameAsCurrent(recoveryAccessToken, newPassword);
    send(res, 200, { isSame });
  } catch (e) { send(res, 400, { error: e.message }); }
});


route('POST', '/api/auth/mfa/backup-codes/verify-for-recovery', { hostScope: 'any' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'backup-code-reset-password', 10, 5)) return;
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const { recoveryAccessToken, code } = body;
  if (!recoveryAccessToken || !code) return send(res, 400, { error: apiT('recoveryTokenCodeRequired', reqLang(req)) });
  try {
    await authSupabase.verifyBackupCodeForRecovery(recoveryAccessToken, code);
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', '/api/auth/mfa/email-otp/verify-for-recovery', { hostScope: 'any' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'email-otp-reset-password', 10, 5)) return;
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const { recoveryAccessToken, code } = body;
  if (!recoveryAccessToken || !code) return send(res, 400, { error: apiT('recoveryTokenCodeRequired', reqLang(req)) });
  try {
    await authSupabase.verifyEmailOtpForRecovery(recoveryAccessToken, code);
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', '/api/auth/mfa/set-password-after-recovery', { hostScope: 'any' }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'set-password-after-recovery', 10, 5)) return;
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const { recoveryAccessToken, newPassword } = body;
  if (!recoveryAccessToken || !newPassword) return send(res, 400, { error: apiT('recoveryTokenPasswordRequired', reqLang(req)) });
  try {
    const resetUser = await authSupabase.setPasswordAfterVerifiedRecovery(recoveryAccessToken, newPassword);
    logAuthEvent({ userId: resetUser.id, email: resetUser.email, eventType: 'password_reset_completed', req });
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
});

route('GET', '/api/auth/mfa/factors', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 200, { factors: [] });
  try {
    const factors = await authSupabase.listMfaFactors(bearerToken(req));
    send(res, 200, { factors: factors.map(f => ({ id: f.id, status: f.status, createdAt: f.created_at })) });
  } catch (e) { send(res, 400, { error: e.message }); }
});

route('DELETE', '/api/auth/mfa/factors/:factorId', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  try {
    await authSupabase.unenrollMfaFactor(bearerToken(req), params.factorId);
    logAuthEvent({ userId: user.id, email: user.email, eventType: 'mfa_totp_disabled', req });
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
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
  if (user.role === 'superadmin') return send(res, 403, { error: apiT('superadminNoSelfDelete', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    if (user.role === 'admin') {
      // NOTE: checking "only admin at this store" against tenant_memberships is a query
      // this driver doesn't yet implement here — see the follow-up work needed before
      // this path is production-ready (tracked, not silently skipped).
    }
    try { await authSupabase.login(user.email, body.password || ''); } catch { return send(res, 401, { error: apiT('incorrectPassword', reqLang(req)) }); }
    await authSupabase.deleteAccount(user.id);
    return send(res, 200, { ok: true });
  }
  if (!body.password || !verifyPassword(body.password, user.passwordHash)) return send(res, 401, { error: apiT('incorrectPassword', reqLang(req)) });
  if (user.role === 'admin') {
    const otherAdmins = db.users.filter(u => u.tenantId === user.tenantId && u.role === 'admin' && u.id !== user.id);
    if (otherAdmins.length === 0) return send(res, 400, { error: apiT('onlyAdminPromoteFirst', reqLang(req)) });
  }
  db.users = db.users.filter(u => u.id !== user.id);
  await persist();
  send(res, 200, { ok: true });
});

route('GET', '/api/tenant/info', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseAdmin(); // this page is publicly viewable (store info), so uses admin to read subscription data regardless of who's asking
    const [{ data: sub }, { count: productCount }] = await Promise.all([
      client.from('current_subscriptions').select('*, plans(*)').eq('tenant_id', tenant.id).maybeSingle(),
      client.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
    ]);
    const tierName = sub && sub.plans ? sub.plans.name : 'starter';
    const expiresAt = sub ? new Date(sub.expiry_date).getTime() : null;
    const fakeTenantForExpiry = { subscriptionExpiresAt: expiresAt };
    return send(res, 200, {
      name: tenant.name, subdomain: tenant.subdomain, plan: tenant.plan, tagline: tenant.tagline || '', aboutText: tenant.aboutText || '',
      translations: tenant.translations || {}, closedBySelf: !!tenant.closedBySelf,
      registrationEnabled: tenant.registrationEnabled !== false, requireMfaForStaff: !!tenant.requireMfaForStaff,
      enabledTiers: tenant.enabledTiers || ['starter', 'professional', 'enterprise'],
      subscriptionTier: tierName, tierLimits: sub && sub.plans ? { maxProducts: sub.plans.max_products, commissionRate: Number(sub.plans.commission_rate), monthlyFee: Number(sub.plans.monthly_price) } : SUBSCRIPTION_TIERS.starter,
      productCount: productCount || 0,
      subscriptionExpiresAt: expiresAt, daysUntilExpiry: daysUntilExpiry(fakeTenantForExpiry), subscriptionAlertLevel: subscriptionAlertLevel(fakeTenantForExpiry),
    });
  }
  const tierName = tenant.subscriptionTier || 'starter';
  send(res, 200, {
    name: tenant.name, subdomain: tenant.subdomain, plan: tenant.plan, tagline: tenant.tagline || '', aboutText: tenant.aboutText || '',
    translations: tenant.translations || {}, closedBySelf: !!tenant.closedBySelf,
    registrationEnabled: tenant.registrationEnabled !== false, requireMfaForStaff: !!tenant.requireMfaForStaff,
    enabledTiers: tenant.enabledTiers || ['starter', 'professional', 'enterprise'],
    subscriptionTier: tierName, tierLimits: SUBSCRIPTION_TIERS[tierName],
    productCount: db.products.filter(p => p.tenantId === tenant.id).length,
    subscriptionExpiresAt: tenant.subscriptionExpiresAt || null, daysUntilExpiry: daysUntilExpiry(tenant), subscriptionAlertLevel: subscriptionAlertLevel(tenant),
  });
});

route('GET', '/api/platform/pricing', { hostScope: 'any' }, async (req, res) => {
  send(res, 200, { tiers: SUBSCRIPTION_TIERS });
});

route('PATCH', '/api/admin/store', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (body.plan !== undefined && !TENANT_PLANS.includes(body.plan)) {
    return send(res, 400, { error: `plan must be one of: ${TENANT_PLANS.join(', ')}.` });
  }
  if (body.enabledTiers !== undefined) {
    if (!Array.isArray(body.enabledTiers) || body.enabledTiers.some(t => !SUBSCRIPTION_TIERS[t])) {
      return send(res, 400, { error: `enabledTiers must be an array containing only: ${Object.keys(SUBSCRIPTION_TIERS).join(', ')}.` });
    }
    // The store's CURRENT tier can never be disabled by this same admin —
    // that would immediately lock them out of their own active plan with
    // no way back in through this self-service page.
    const currentTier = AUTH_DRIVER === 'supabase'
      ? (await supabaseAdmin().from('current_subscriptions').select('*, plans(name)').eq('tenant_id', tenant.id).maybeSingle()).data?.plans?.name || 'starter'
      : (tenant.subscriptionTier || 'starter');
    if (!body.enabledTiers.includes(currentTier)) {
      return send(res, 400, { error: `Your current plan (${currentTier}) can't be disabled while you're on it.` });
    }
  }
  if (AUTH_DRIVER === 'supabase') {
    // This endpoint previously had no Supabase branch at all — every field
    // below was silently discarded for any real Supabase-backed store,
    // since mutating the in-memory `tenant` object the local driver relies
    // on never touches the actual database when Supabase is the driver.
    const client = supabaseForRequest(bearerToken(req));
    const { data: existing, error: findErr } = await client.from('tenants').select('*').eq('id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: apiT('storeNotFound', reqLang(req)) });
    const patch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.tagline !== undefined) patch.tagline = body.tagline;
    if (body.aboutText !== undefined) patch.about_text = body.aboutText;
    if (body.plan !== undefined) patch.plan = body.plan;
    if (body.closedBySelf !== undefined) patch.closed_by_self = body.closedBySelf;
    if (body.registrationEnabled !== undefined) patch.registration_enabled = body.registrationEnabled;
    if (body.requireMfaForStaff !== undefined) patch.require_mfa_for_staff = body.requireMfaForStaff;
    if (body.enabledTiers !== undefined) patch.enabled_tiers = body.enabledTiers;
    if (body.translations) {
      const wrapper = { translations: existing.translations || {} };
      const err = mergeTranslations(wrapper, body.translations, ['name', 'tagline', 'aboutText']);
      if (err) return send(res, 400, { error: err });
      patch.translations = wrapper.translations;
    }
    // subscriptionTier is deliberately not handled here — it's tracked via a
    // separate current_subscriptions table for real Supabase stores, not a
    // plain column on tenants, and changing it needs its own dedicated,
    // carefully-scoped endpoint rather than being folded into this one.
    const { data, error } = await client.from('tenants').update(patch).eq('id', tenant.id).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { tenant: rowToTenant(data) });
  }
  const transErr = mergeTranslations(tenant, body.translations, ['name', 'tagline', 'aboutText']);
  if (transErr) return send(res, 400, { error: transErr });
  // subscriptionTier is deliberately not accepted here — changing to a paid
  // tier must go through POST /api/admin/store/renew, which actually
  // validates payment. Allowing it here let any admin grant themselves a
  // paid tier's benefits by simply saving settings, with no payment step.
  const allowed = ['name', 'tagline', 'aboutText', 'plan', 'closedBySelf', 'registrationEnabled', 'requireMfaForStaff', 'enabledTiers'];
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
  if (!verifyPassword(body.password || '', user.passwordHash)) return send(res, 401, { error: apiT('passwordIncorrect', reqLang(req)) });
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
  const targetTier = body.subscriptionTier;
  if (targetTier !== undefined && !SUBSCRIPTION_TIERS[targetTier]) {
    return send(res, 400, { error: `subscriptionTier must be one of: ${Object.keys(SUBSCRIPTION_TIERS).join(', ')}.` });
  }
  // Downgrading tiers must not silently leave a store over its new product limit.
  if (targetTier) {
    const newLimit = SUBSCRIPTION_TIERS[targetTier].maxProducts;
    const currentCount = AUTH_DRIVER === 'supabase'
      ? (await supabaseForRequest(bearerToken(req)).from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id)).count || 0
      : db.products.filter(p => p.tenantId === tenant.id).length;
    if (newLimit !== null && currentCount > newLimit) {
      return send(res, 400, { error: `You have ${currentCount} products, which is more than the ${newLimit} allowed on this tier. Remove some products first, or choose a higher tier.` });
    }
  }
  // Determine the CURRENT tier before deciding whether payment is required —
  // this is the fix for a real bug: a plain "renew for another 30 days"
  // call (no explicit subscriptionTier in the request, just `plan`) used to
  // skip payment validation entirely, even when renewing an existing PAID
  // subscription. Extending a paid plan is still a paid action; only a
  // store that is currently on, and staying on, the free starter tier is
  // exempt.
  let currentTierName = 'starter';
  let currentExpiryForEligibility = null;
  if (AUTH_DRIVER === 'supabase') {
    const { data: currentSubForCheck } = await supabaseAdmin().from('current_subscriptions').select('*, plans(name)').eq('tenant_id', tenant.id).maybeSingle();
    console.error('[DEBUG renew-eligibility] tenant.id:', tenant.id, '| currentSubForCheck:', JSON.stringify(currentSubForCheck));
    if (currentSubForCheck && currentSubForCheck.plans) currentTierName = currentSubForCheck.plans.name;
    if (currentSubForCheck) currentExpiryForEligibility = new Date(currentSubForCheck.expiry_date).getTime();
  } else {
    currentTierName = tenant.subscriptionTier || 'starter';
    currentExpiryForEligibility = tenant.subscriptionExpiresAt || null;
  }
  // Eligibility gate (real pre-launch bug fix): a plain renewal of the SAME
  // tier is blocked with more than 7 days remaining -- the Help Centre and
  // the admin UI's own tooltip have always documented this rule, but no
  // server-side code actually enforced it until now. An explicit tier
  // CHANGE is always allowed regardless of days remaining, matching the
  // documented "that's always treated as an explicit change, never
  // blocked" behavior. This must live here, server-side, not just as a
  // disabled button in the UI, since the API can otherwise be called
  // directly to bypass a UI-only restriction.
  const isTierChange = targetTier !== undefined && targetTier !== currentTierName;
  if (!isTierChange && currentExpiryForEligibility !== null) {
    const daysLeft = Math.ceil((currentExpiryForEligibility - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysLeft > 7) {
      return send(res, 400, { error: `Renewal is not available yet. You can renew when 7 days or fewer remain (${daysLeft} days left). To switch tiers instead, choose a different tier on the Sale on Hadam page.` });
    }
  }
  const paymentRequired = (targetTier && targetTier !== 'starter') || (!targetTier && currentTierName !== 'starter');
  if (paymentRequired) {
    const cardFormatError = validateFullCard(body.card, reqLang(req));
    if (cardFormatError) return send(res, 400, { error: cardFormatError });
    const cardDigits = (body.card && body.card.number || '').replace(/\s/g, '');
    if (cardDigits === '0000000000000000') return send(res, 402, { error: apiT('cardDeclined', reqLang(req)) });
  }
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { error: tenantErr } = await client.from('tenants').update({ plan: body.plan }).eq('id', tenant.id);
    if (tenantErr) return send(res, 400, { error: tenantErr.message });
    const { data: currentSub } = await client.from('current_subscriptions').select('plan_id, expiry_date').eq('tenant_id', tenant.id).maybeSingle();
    let planId = currentSub ? currentSub.plan_id : null;
    if (targetTier) {
      const { data: targetPlan } = await client.from('plans').select('id').eq('name', targetTier).maybeSingle();
      if (targetPlan) planId = targetPlan.id;
    } else if (!planId) {
      const { data: starterPlan } = await client.from('plans').select('id').eq('name', 'starter').maybeSingle();
      planId = starterPlan ? starterPlan.id : null;
    }
    const currentExpiry = currentSub ? new Date(currentSub.expiry_date).getTime() : Date.now();
    const newExpiry = new Date(Math.max(Date.now(), currentExpiry) + THIRTY_DAYS_MS).toISOString().slice(0, 10);
    if (planId) {
      const { error: subErr } = await client.from('subscriptions').insert({ tenant_id: tenant.id, plan_id: planId, expiry_date: newExpiry, payment_status: 'paid' });
      if (subErr) return send(res, 400, { error: subErr.message });
    }
    const { error: notifErr } = await supabaseAdmin().from('notifications').insert({
      tenant_id: tenant.id, type: 'renewed', to_email: user.email,
      subject: `Your Hadam subscription for "${tenant.name}" has been renewed`,
      body: `Hi ${user.name},\n\nYour store "${tenant.name}" has been renewed as: ${body.plan}. Your new expiry date is ${newExpiry}.\n\nThank you for staying with Hadam Marketplace.\n\n— Hadam Marketplace`,
    });
    return send(res, 200, { tenant: { ...tenant, plan: body.plan }, notificationSent: !notifErr });
  }
  tenant.plan = body.plan;
  if (targetTier) tenant.subscriptionTier = targetTier;
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
    // Without an explicit redirectTo, Supabase falls back to the project's
    // single, global "Site URL" setting — which is why the link was always
    // landing on the platform's own homepage instead of back on whichever
    // store the person was actually trying to log into. Building this from
    // the real incoming request host fixes that for every store, not just
    // one hardcoded domain.
    const redirectTo = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/`;
    console.error('[DEBUG forgot-password] host header:', req.headers.host, '| x-forwarded-proto:', req.headers['x-forwarded-proto'], '| computed redirectTo:', redirectTo);
    if (email) {
      logAuthEvent({ email, tenantId: tenant ? tenant.id : null, eventType: 'password_reset_requested', req });
      try { await authSupabase.requestPasswordReset(email, redirectTo); } catch { /* never reveal whether it worked — same principle as the custom driver below */ }
    }
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
    return send(res, 501, { error: apiT('notImplementedSupabaseReset', reqLang(req)) });
  }
  const { token, newPassword } = body;
  const reset = db.resets.find(r => r.token === token);
  if (!reset || reset.used || Date.now() > reset.expiresAt) return send(res, 400, { error: apiT('resetLinkInvalidExpired', reqLang(req)) });
  if (!newPassword || newPassword.length < 6) return send(res, 400, { error: apiT('passwordMin6', reqLang(req)) });
  const user = db.users.find(u => u.id === reset.userId);
  if (!user) return send(res, 400, { error: apiT('resetLinkInvalidExpired', reqLang(req)) });
  user.passwordHash = hashPassword(newPassword);
  reset.used = true;
  await persist();
  send(res, 200, { ok: true });
});

route('POST', '/api/auth/change-password', { hostScope: 'any', auth: true }, async (req, res, params, body, query, user) => {
  const { currentPassword, newPassword } = body;
  if (!newPassword || newPassword.length < 6) return send(res, 400, { error: apiT('newPasswordMin6', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    try { await authSupabase.login(user.email, currentPassword || ''); } catch { return send(res, 401, { error: apiT('currentPasswordIncorrect', reqLang(req)) }); }
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    await authSupabase.updatePassword(token, newPassword);
    return send(res, 200, { ok: true });
  }
  if (!verifyPassword(currentPassword || '', user.passwordHash)) return send(res, 401, { error: apiT('currentPasswordIncorrect', reqLang(req)) });
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
    description: p.description || '', price: p.price, stock: p.stock ?? null, external_url: p.externalUrl || '', meeting_link: p.meetingLink || '',
  };
}
function rowToProduct(row, category) {
  const dp = Array.isArray(row.download_products) ? row.download_products[0] : row.download_products;
  return {
    id: row.id, tenantId: row.tenant_id, categoryId: row.category_id, name: row.name, sku: row.sku || null, translations: row.translations || {},
    description: row.description, price: Number(row.price), stock: row.stock, externalUrl: row.external_url || '', meetingLink: row.meeting_link || '',
    digitalFile: dp ? { filename: dp.original_filename, extension: dp.extension, mimeType: dp.mime_type, size: dp.size_bytes, isCompressed: dp.is_compressed, uploadStatus: dp.upload_status, uploadedAt: dp.uploaded_at, uploadedBy: dp.uploaded_by } : null,
    images: (row.product_images || []).map(img => ({ id: img.id, url: `${process.env.SUPABASE_URL}/storage/v1/object/public/product-images/${img.storage_path}`, filename: img.filename, mimeType: img.mime_type, size: img.size_bytes, uploadedBy: img.uploaded_by, uploadedAt: img.uploaded_at })),
    createdAt: row.created_at, category: category || rowToCategory(row.categories),
  };
}

// The anon key is specifically designed to be public/client-side-safe (it's
// enforced entirely by Row Level Security, not secrecy) — this just lets the
// frontend complete flows that must run through Supabase's own client SDK,
// like finishing a password-reset link, rather than through custom backend code.
route('GET', '/api/config', { hostScope: 'any' }, async (req, res) => {
  send(res, 200, {
    authDriver: AUTH_DRIVER,
    supabaseUrl: AUTH_DRIVER === 'supabase' ? process.env.SUPABASE_URL : null,
    supabaseAnonKey: AUTH_DRIVER === 'supabase' ? process.env.SUPABASE_ANON_KEY : null,
  });
});

// ===========================================================================
// PHASE 2 — STRIPE CONNECT. Local-driver implementation for now (this is
// where the automated test suite runs); the Supabase-driver equivalent
// follows the same shape against the `tenant_payment_methods` /
// `stripe_webhook_events` tables built in db/schema.sql, using
// supabaseAdmin() in place of the local `db` object throughout.
// ===========================================================================

function getTenantPaymentMethod(tenantId, method) {
  return db.tenantPaymentMethods.find(m => m.tenantId === tenantId && m.method === method);
}

async function getTenantPaymentMethodSupabase(tenantId, method) {
  const { data, error } = await supabaseAdmin().from('tenant_payment_methods').select('*').eq('tenant_id', tenantId).eq('method', method).maybeSingle();
  if (error) { console.error('[getTenantPaymentMethodSupabase] lookup failed:', error.message); return null; }
  if (!data) return null;
  return {
    id: data.id, tenantId: data.tenant_id, method: data.method, enabled: data.enabled, config: data.config || {},
    stripeAccountId: data.stripe_account_id, stripeOnboardingStatus: data.stripe_onboarding_status,
    paypalMerchantId: data.paypal_merchant_id, paypalOnboardingStatus: data.paypal_onboarding_status,
  };
}

/** Creates or updates a tenant's payment-method row directly in Supabase (upsert-by-tenant+method). `patch` uses snake_case Supabase column names, matching the shape read by getTenantPaymentMethodSupabase. Used by every admin connect/status/enable route and by the Stripe/PayPal webhook handlers, so that onboarding state lives in the same place the checkout routes actually read it from. */
async function upsertTenantPaymentMethodSupabase(tenantId, method, patch) {
  const { data: existing, error: selErr } = await supabaseAdmin().from('tenant_payment_methods').select('*').eq('tenant_id', tenantId).eq('method', method).maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) {
    const { data, error } = await supabaseAdmin().from('tenant_payment_methods').update(patch).eq('id', existing.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabaseAdmin().from('tenant_payment_methods').insert({ tenant_id: tenantId, method, ...patch }).select().maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Starts (or resumes) Stripe onboarding for this store: creates a connected account if one doesn't exist yet, then returns a fresh onboarding link. Admin-only — enabling a payment method is a business decision, matching the RLS policy already built for this table. */
route('POST', '/api/admin/stripe/connect', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  try {
    if (AUTH_DRIVER === 'supabase') {
      let record = await getTenantPaymentMethodSupabase(tenant.id, 'stripe');
      if (!record) {
        record = await upsertTenantPaymentMethodSupabase(tenant.id, 'stripe', { enabled: false, stripe_account_id: null, stripe_onboarding_status: 'not_connected' });
        record = { id: record.id, tenantId: record.tenant_id, method: record.method, enabled: record.enabled, stripeAccountId: record.stripe_account_id, stripeOnboardingStatus: record.stripe_onboarding_status };
      }
      if (!record.stripeAccountId) {
        record.stripeAccountId = await stripeConnectLib.createConnectedAccount({ stripe: stripeClient(), tenantId: tenant.id });
        record.stripeOnboardingStatus = 'pending';
        await upsertTenantPaymentMethodSupabase(tenant.id, 'stripe', { stripe_account_id: record.stripeAccountId, stripe_onboarding_status: 'pending' });
      }
      const baseUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}`;
      const url = await stripeConnectLib.createOnboardingLink({
        stripe: stripeClient(), stripeAccountId: record.stripeAccountId,
        returnUrl: `${baseUrl}/?stripeOnboarding=return`, refreshUrl: `${baseUrl}/?stripeOnboarding=refresh`,
      });
      return send(res, 200, { onboardingUrl: url, stripeAccountId: record.stripeAccountId });
    }
    let record = getTenantPaymentMethod(tenant.id, 'stripe');
    if (!record) {
      record = { id: newId('tpm'), tenantId: tenant.id, method: 'stripe', enabled: false, stripeAccountId: null, stripeOnboardingStatus: 'not_connected' };
      db.tenantPaymentMethods.push(record);
    }
    if (!record.stripeAccountId) {
      record.stripeAccountId = await stripeConnectLib.createConnectedAccount({ stripe: stripeClient(), tenantId: tenant.id });
      record.stripeOnboardingStatus = 'pending';
      await persist();
    }
    const baseUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}`;
    const url = await stripeConnectLib.createOnboardingLink({
      stripe: stripeClient(), stripeAccountId: record.stripeAccountId,
      returnUrl: `${baseUrl}/?stripeOnboarding=return`, refreshUrl: `${baseUrl}/?stripeOnboarding=refresh`,
    });
  send(res, 200, { onboardingUrl: url, stripeAccountId: record.stripeAccountId });
  } catch (e) {
    console.error('[stripe connect] failed:', e.message);
    send(res, 500, { error: e.message });
  }
});

/** Returns this store's current Stripe Connect status, straight from what's stored — the actual truth is only ever updated by the account.updated webhook below, never by this GET request itself. */
route('GET', '/api/admin/stripe/status', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const record = AUTH_DRIVER === 'supabase' ? await getTenantPaymentMethodSupabase(tenant.id, 'stripe') : getTenantPaymentMethod(tenant.id, 'stripe');
  send(res, 200, {
    enabled: record ? record.enabled : false,
    stripeAccountId: record ? record.stripeAccountId : null,
    onboardingStatus: record ? record.stripeOnboardingStatus : 'not_connected',
  });
});

/** Public, customer-facing: is Stripe an available checkout option for this store? Deliberately exposes nothing beyond a single boolean — no account ID, no onboarding status — matching how the product catalog itself is already public. */
route('GET', '/api/payment-methods', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const stripeRecord = await getTenantPaymentMethodSupabase(tenant.id, 'stripe');
    const paypalRecord = await getTenantPaymentMethodSupabase(tenant.id, 'paypal');
    const cashRecord = await getTenantPaymentMethodSupabase(tenant.id, 'cash');
    const bankRecord = await getTenantPaymentMethodSupabase(tenant.id, 'bank_transfer');
    return send(res, 200, {
      stripeEnabled: !!(stripeRecord && stripeRecord.enabled && stripeRecord.stripeOnboardingStatus === 'connected'), publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      paypalEnabled: !!(paypalRecord && paypalRecord.enabled && paypalRecord.paypalOnboardingStatus === 'connected'), paypalClientId: process.env.PAYPAL_CLIENT_ID || null,
      cashEnabled: !!(cashRecord && cashRecord.enabled),
      bankTransferEnabled: !!(bankRecord && bankRecord.enabled),
    });
  }
  const stripeRecord = getTenantPaymentMethod(tenant.id, 'stripe');
  const paypalRecord = getTenantPaymentMethod(tenant.id, 'paypal');
  const cashRecord = getTenantPaymentMethod(tenant.id, 'cash');
  const bankRecord = getTenantPaymentMethod(tenant.id, 'bank_transfer');
  send(res, 200, {
    stripeEnabled: !!(stripeRecord && stripeRecord.enabled && stripeRecord.stripeOnboardingStatus === 'connected'), publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    paypalEnabled: !!(paypalRecord && paypalRecord.enabled && paypalRecord.paypalOnboardingStatus === 'connected'), paypalClientId: process.env.PAYPAL_CLIENT_ID || null,
    cashEnabled: !!(cashRecord && cashRecord.enabled),
    bankTransferEnabled: !!(bankRecord && bankRecord.enabled),
  });
});
/** Starts PayPal Partner Referrals onboarding for this store — mirrors POST /api/admin/stripe/connect exactly. Admin-only. */
route('POST', '/api/admin/paypal/connect', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  try {
    if (AUTH_DRIVER === 'supabase') {
      let record = await getTenantPaymentMethodSupabase(tenant.id, 'paypal');
      if (!record) {
        await upsertTenantPaymentMethodSupabase(tenant.id, 'paypal', { enabled: false, paypal_merchant_id: null, paypal_onboarding_status: 'not_connected' });
      }
      const baseUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}`;
      const actionUrl = await paypalConnectLib.createPartnerReferral({ paypalApiCall, tenantId: tenant.id, trackingId: tenant.id, returnUrl: `${baseUrl}/?paypalOnboarding=return` });
      await upsertTenantPaymentMethodSupabase(tenant.id, 'paypal', { paypal_onboarding_status: 'pending' });
      return send(res, 200, { onboardingUrl: actionUrl });
    }
    let record = getTenantPaymentMethod(tenant.id, 'paypal');
    if (!record) {
      record = { id: newId('tpm'), tenantId: tenant.id, method: 'paypal', enabled: false, paypalMerchantId: null, paypalOnboardingStatus: 'not_connected' };
      db.tenantPaymentMethods.push(record);
    }
    const baseUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}`;
    const actionUrl = await paypalConnectLib.createPartnerReferral({ paypalApiCall, tenantId: tenant.id, trackingId: tenant.id, returnUrl: `${baseUrl}/?paypalOnboarding=return` });
    record.paypalOnboardingStatus = 'pending';
    await persist();
    send(res, 200, { onboardingUrl: actionUrl });
  } catch (e) {
    console.error('[paypal connect] failed:', e.message);
    send(res, 500, { error: e.message });
  }
});

/** Returns this store's current PayPal Connect status — mirrors GET /api/admin/stripe/status exactly. */
route('GET', '/api/admin/paypal/status', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const record = AUTH_DRIVER === 'supabase' ? await getTenantPaymentMethodSupabase(tenant.id, 'paypal') : getTenantPaymentMethod(tenant.id, 'paypal');
  send(res, 200, {
    enabled: record ? record.enabled : false,
    paypalMerchantId: record ? record.paypalMerchantId : null,
    onboardingStatus: record ? record.paypalOnboardingStatus : 'not_connected',
  });
});

/** Lets a store admin turn PayPal on/off — only once onboarding has genuinely completed. Mirrors PATCH /api/admin/stripe/enable exactly. */
route('PATCH', '/api/admin/paypal/enable', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const record = await getTenantPaymentMethodSupabase(tenant.id, 'paypal');
    if (!record || record.paypalOnboardingStatus !== 'connected') return send(res, 400, { error: 'PayPal onboarding must be completed before it can be enabled.' });
    const updated = await upsertTenantPaymentMethodSupabase(tenant.id, 'paypal', { enabled: !!body.enabled });
    return send(res, 200, { enabled: updated.enabled });
  }
  const record = getTenantPaymentMethod(tenant.id, 'paypal');
  if (!record || record.paypalOnboardingStatus !== 'connected') return send(res, 400, { error: 'PayPal onboarding must be completed before it can be enabled.' });
  record.enabled = !!body.enabled;
  await persist();
  send(res, 200, { enabled: record.enabled });
});

/** Lets a store admin turn Stripe on/off as an accepted payment method — only once onboarding has actually completed (status: 'connected'), never before, regardless of what the client claims. */
route('PATCH', '/api/admin/stripe/enable', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const record = await getTenantPaymentMethodSupabase(tenant.id, 'stripe');
    if (!record || record.stripeOnboardingStatus !== 'connected') return send(res, 400, { error: 'Stripe onboarding must be completed before it can be enabled.' });
    const updated = await upsertTenantPaymentMethodSupabase(tenant.id, 'stripe', { enabled: !!body.enabled });
    return send(res, 200, { enabled: updated.enabled });
  }
  const record = getTenantPaymentMethod(tenant.id, 'stripe');
  if (!record || record.stripeOnboardingStatus !== 'connected') return send(res, 400, { error: 'Stripe onboarding must be completed before it can be enabled.' });
  record.enabled = !!body.enabled;
  await persist();
  send(res, 200, { enabled: record.enabled });
});

/** Lets a store admin turn cash-on-delivery on/off. Unlike Stripe/PayPal there's no external onboarding step — no connected account, no onboarding status to check — so this simply creates the row (first time) or flips its enabled flag. Previously this route didn't exist at all under either driver, meaning cash could never actually be turned on for a store despite /api/orders/cash already checking for it. */
route('PATCH', '/api/admin/cash/enable', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const updated = await upsertTenantPaymentMethodSupabase(tenant.id, 'cash', { enabled: !!body.enabled });
    return send(res, 200, { enabled: updated.enabled });
  }
  let record = getTenantPaymentMethod(tenant.id, 'cash');
  if (!record) {
    record = { id: newId('tpm'), tenantId: tenant.id, method: 'cash', enabled: false };
    db.tenantPaymentMethods.push(record);
  }
  record.enabled = !!body.enabled;
  await persist();
  send(res, 200, { enabled: record.enabled });
});

/** Returns this store's current cash-on-delivery enabled state. Mirrors GET /api/admin/stripe/status in spirit, minus the onboarding-status fields that don't apply here. */
route('GET', '/api/admin/cash/status', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const record = AUTH_DRIVER === 'supabase' ? await getTenantPaymentMethodSupabase(tenant.id, 'cash') : getTenantPaymentMethod(tenant.id, 'cash');
  send(res, 200, { enabled: record ? record.enabled : false });
});

/** Lets a store admin turn bank transfer on/off. Same reasoning as cash above — no onboarding, previously no route existed to ever enable it. */
route('PATCH', '/api/admin/bank-transfer/enable', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const updated = await upsertTenantPaymentMethodSupabase(tenant.id, 'bank_transfer', { enabled: !!body.enabled });
    return send(res, 200, { enabled: updated.enabled });
  }
  let record = getTenantPaymentMethod(tenant.id, 'bank_transfer');
  if (!record) {
    record = { id: newId('tpm'), tenantId: tenant.id, method: 'bank_transfer', enabled: false };
    db.tenantPaymentMethods.push(record);
  }
  record.enabled = !!body.enabled;
  await persist();
  send(res, 200, { enabled: record.enabled });
});

/** Returns this store's current bank-transfer enabled state. */
route('GET', '/api/admin/bank-transfer/status', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const record = AUTH_DRIVER === 'supabase' ? await getTenantPaymentMethodSupabase(tenant.id, 'bank_transfer') : getTenantPaymentMethod(tenant.id, 'bank_transfer');
  send(res, 200, { enabled: record ? record.enabled : false });
});

/**
 * Step 3 — real Stripe test-mode checkout. Local-driver implementation
 * (where the automated test suite runs); the Supabase-driver equivalent
 * would follow the same shape. Deliberately scoped to shipping/manual
 * fulfillment items for this first pass — download and booking
 * fulfillment through Stripe are a known, explicitly stated gap, not
 * silently unhandled.
 *
 * The critical rule this route embodies: the order and its payment are
 * created as 'pending' and STAY pending — nothing here, and nothing the
 * browser can claim afterward, ever marks them paid. Only the verified
 * webhook (payment_intent.succeeded, handled below) does that. Stock is
 * likewise NOT decremented here — it's deferred to the same webhook, so
 * an order that never actually gets paid never touches inventory either.
 */
route('POST', '/api/orders/stripe', { hostScope: 'tenant', auth: true, roles: ['client', 'admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (tenant.closedBySelf) return send(res, 403, { error: apiT('storeClosedNoOrders', reqLang(req)) });
  if (tenant.subscriptionExpiresAt && tenant.subscriptionExpiresAt < Date.now()) return send(res, 403, { error: apiT('storeSubExpiredNoOrders', reqLang(req)) });
   if (AUTH_DRIVER === 'supabase') {

    const record = await getTenantPaymentMethodSupabase(tenant.id, 'stripe');
  if (!record || !record.enabled || record.stripeOnboardingStatus !== 'connected') {
    return send(res, 400, { error: 'Stripe is not available for this store.' });
  }

  const { items, shippingAddress } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });
  }

  const client = supabaseForRequest(bearerToken(req));

  const productIds = [...new Set(items.map(l => l.productId))];
  const { data: productRows, error: productsErr } = await client.from('products').select('*, categories(*)').eq('tenant_id', tenant.id).in('id', productIds);
  if (productsErr) return send(res, 500, { error: productsErr.message });

  const resolved = [];
  for (const line of items) {
    const row = (productRows || []).find(r => r.id === line.productId);
    if (!row) {
      return send(res, 400, { error: `Unknown product: ${line.productId}` });
    }
    const product = rowToProduct(row);
    const category = product.category;
    const qty = line.qty || 1;
    if (!['shipping', 'manual'].includes(category.fulfillment)) {
      return send(res, 400, { error: `"${product.name}" cannot currently be purchased with Stripe (download/booking items are not yet supported through Stripe checkout).` });
    }
    if (category.fulfillment === 'shipping' && typeof product.stock === 'number' && qty > product.stock) {
      return send(res, 400, { error: `Only ${product.stock} unit(s) of "${product.name}" left in stock.` });
    }
    resolved.push({ product, category, qty });
  }
  const needsShipping = resolved.some(r => r.category.fulfillment === 'shipping');
  if (needsShipping && (!shippingAddress || !shippingAddress.trim())) {
    return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
  }
  const total = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);

  const { data: orderRow, error: orderErr } = await client.from('orders').insert({
    tenant_id: tenant.id, client_id: user.id, payment_status: 'pending', status: 'pending',
    payment_method: 'stripe', shipping_address: needsShipping ? shippingAddress : null, total,
  }).select().maybeSingle();
  if (orderErr) return send(res, 400, { error: orderErr.message });
  if (!orderRow) return send(res, 500, { error: apiT('orderCreationFailed', reqLang(req)) });

  const itemRows = resolved.map(r => ({
    order_id: orderRow.id, tenant_id: tenant.id, product_id: r.product.id, name: r.product.name, sku: r.product.sku || null,
    translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
    category_name: r.category.name, fulfillment: r.category.fulfillment, status: 'awaiting_payment',
  }));
  const { error: itemsErr } = await client.from('order_items').insert(itemRows);
  if (itemsErr) {
    await client.from('orders').delete().eq('id', orderRow.id);
    return send(res, 400, { error: itemsErr.message });
  }
  await client.from('order_status_history').insert({ tenant_id: tenant.id, order_id: orderRow.id, status: 'pending', changed_by: 'System' });

  let intent;
  try {
    intent = await stripeConnectLib.createPaymentIntent({ stripe: stripeClient(), stripeAccountId: record.stripeAccountId, amount: total, currency: 'usd' });
  } catch (e) {
    console.error('[stripe checkout] failed to create PaymentIntent:', e.message);
    await client.from('order_items').delete().eq('order_id', orderRow.id);
    await client.from('orders').delete().eq('id', orderRow.id);
    return send(res, 500, { error: 'Could not start Stripe payment. Please try again.' });
  }

  let anchorPersisted = false;
  let anchorErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const anchorResult = await supabaseAdmin().from('orders').update({ pending_provider_reference: intent.id }).eq('id', orderRow.id).select().maybeSingle();
    if (!anchorResult.error && anchorResult.data) { anchorPersisted = true; break; }
    anchorErr = anchorResult.error;
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt === 1 ? 200 : 500));
  }

  if (!anchorPersisted) {
    try { await stripeClient().paymentIntents.cancel(intent.id); }
    catch (e) { console.error(`[stripe checkout] FATAL: could not persist recovery anchor AND could not cancel PaymentIntent ${intent.id} as containment. This PaymentIntent is now genuinely orphaned and needs manual attention.`, e.message); }
    await client.from('order_items').delete().eq('order_id', orderRow.id);
    await client.from('orders').delete().eq('id', orderRow.id);
    console.error(`[stripe checkout] ALERT: recovery anchor could not be persisted for order ${orderRow.id}; PaymentIntent ${intent.id} was cancelled as containment.`, anchorErr && anchorErr.message);
    return send(res, 500, { error: 'Could not start Stripe payment. Please try again.' });
  }

  let payment = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      payment = await createPaymentRecord({ supabaseAdminClient: supabaseAdmin(), tenantId: tenant.id, orderId: orderRow.id, clientId: user.id, method: 'stripe', status: 'pending', amount: total, currency: 'usd', providerReference: intent.id });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt === 1 ? 200 : 500));
    }
  }

  if (payment && payment.providerReference === intent.id) {
    await supabaseAdmin().from('orders').update({ pending_provider_reference: null }).eq('id', orderRow.id);
  } else {
    console.error(`[stripe checkout] ALERT: payments row could not be created after 3 attempts for order ${orderRow.id}, Stripe PaymentIntent ${intent.id}. Recovery anchor is in place; webhook reconciliation must recover this.`, lastErr && lastErr.message);
  }

  try {
    await stripeClient().paymentIntents.update(intent.id, { metadata: { paymentId: payment ? payment.id : '', orderId: orderRow.id } });
  } catch (e) {
    console.error('[stripe checkout] failed to attach metadata to PaymentIntent (non-fatal):', e.message);
  }

    return send(res, 201, { orderId: orderRow.id, clientSecret: intent.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null });
  }

  const record2 = getTenantPaymentMethod(tenant.id, 'stripe');
  if (!record2 || !record2.enabled || record2.stripeOnboardingStatus !== 'connected') {
    return send(res, 400, { error: 'Stripe is not available for this store.' });
  }
  const { items: localItems, shippingAddress: localShippingAddress } = body;
  if (!Array.isArray(localItems) || localItems.length === 0) return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });
  const localResolved = [];
  for (const line of localItems) {
    const p = findProduct(line.productId, tenant.id);
    if (!p) return send(res, 400, { error: `Unknown product: ${line.productId}` });
    const qty = line.qty || 1;
    const category = findCategory(p.categoryId, tenant.id);
    if (!['shipping', 'manual'].includes(category.fulfillment)) {
      return send(res, 400, { error: `"${p.name}" cannot currently be purchased with Stripe (download/booking items are not yet supported through Stripe checkout).` });
    }
    if (category.fulfillment === 'shipping' && typeof p.stock === 'number' && qty > p.stock) {
      return send(res, 400, { error: `Only ${p.stock} unit(s) of "${p.name}" left in stock.` });
    }
    localResolved.push({ product: p, category, qty });
  }
  const localNeedsShipping = localResolved.some(r => r.category.fulfillment === 'shipping');
  if (localNeedsShipping && (!localShippingAddress || !localShippingAddress.trim())) {
    return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
  }
  const localTotal = localResolved.reduce((s, r) => s + r.product.price * r.qty, 0);
  const localNow = Date.now();
  const localOrderId = newId('ord');
  const localOrderItems = localResolved.map(r => ({
    productId: r.product.id, name: r.product.name, sku: r.product.sku || null, translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
    categoryId: r.category.id, categoryName: r.category.name, fulfillment: r.category.fulfillment,
    status: 'awaiting_payment',
    refundRequested: false, refundStatus: 'none', refundRequestReason: null, refundRequestedAt: null, refundDecisionBy: null, refundDecisionAt: null, refundDecisionReason: null, refundPaymentLast4: null,
  }));
  const localOrder = { id: localOrderId, tenantId: tenant.id, clientId: user.id, clientName: user.name, clientEmail: user.email, items: localOrderItems, total: localTotal, paymentStatus: 'pending', status: 'pending', shippingAddress: localNeedsShipping ? localShippingAddress : null, createdAt: localNow };
  db.orders.push(localOrder);
  db.orderStatusHistory.push({ id: newId('osh'), tenantId: tenant.id, orderId: localOrderId, status: 'pending', changedBy: 'System', changedAt: localNow });
  try {
    const localPayment = await createPaymentRecord({ db, supabaseAdminClient: null, tenantId: tenant.id, orderId: localOrderId, clientId: user.id, method: 'stripe', status: 'pending', amount: localTotal, currency: 'usd' });
    const localIntent = await stripeConnectLib.createPaymentIntent({ stripe: stripeClient(), stripeAccountId: record2.stripeAccountId, amount: localTotal, currency: 'usd' });
    await stripeClient().paymentIntents.update(localIntent.id, { metadata: { paymentId: localPayment.id } });
    localPayment.providerReference = localIntent.id;
    await persist();
    send(res, 201, { orderId: localOrderId, clientSecret: localIntent.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null });
  } catch (e) {
    console.error('[stripe checkout] failed to create PaymentIntent:', e.message);
    send(res, 500, { error: 'Could not start Stripe payment. Please try again.' });
  }
});
/**
 * PayPal checkout — Create step. Mirrors the Stripe checkout route's
 * validation and order/payment creation exactly (same fulfillment-type
 * restriction, same shipping-address check, same 'pending' order created
 * up front with stock/fulfillment deferred). Returns PayPal's own Order
 * ID for the browser's PayPal JS SDK to use for the Approve step — no
 * secret of any kind is ever included in this response.
 */
route('POST', '/api/orders/paypal', { hostScope: 'tenant', auth: true, roles: ['client', 'admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (tenant.closedBySelf) return send(res, 403, { error: apiT('storeClosedNoOrders', reqLang(req)) });
  if (tenant.subscriptionExpiresAt && tenant.subscriptionExpiresAt < Date.now()) return send(res, 403, { error: apiT('storeSubExpiredNoOrders', reqLang(req)) });

  if (AUTH_DRIVER === 'supabase') {
    const record = await getTenantPaymentMethodSupabase(tenant.id, 'paypal');
    if (!record || !record.enabled || record.paypalOnboardingStatus !== 'connected') {
      return send(res, 400, { error: 'PayPal is not available for this store.' });
    }

    const { items, shippingAddress } = body;
    if (!Array.isArray(items) || items.length === 0) return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });

    const client = supabaseForRequest(bearerToken(req));
    const productIds = [...new Set(items.map(l => l.productId))];
    const { data: productRows, error: productsErr } = await client.from('products').select('*, categories(*)').eq('tenant_id', tenant.id).in('id', productIds);
    if (productsErr) return send(res, 500, { error: productsErr.message });

    const resolved = [];
    for (const line of items) {
      const row = (productRows || []).find(r => r.id === line.productId);
      if (!row) return send(res, 400, { error: `Unknown product: ${line.productId}` });
      const product = rowToProduct(row);
      const category = product.category;
      const qty = line.qty || 1;
      if (!['shipping', 'manual'].includes(category.fulfillment)) {
        return send(res, 400, { error: `"${product.name}" cannot currently be purchased with PayPal (download/booking items are not yet supported through PayPal checkout).` });
      }
      if (category.fulfillment === 'shipping' && typeof product.stock === 'number' && qty > product.stock) {
        return send(res, 400, { error: `Only ${product.stock} unit(s) of "${product.name}" left in stock.` });
      }
      resolved.push({ product, category, qty });
    }
    const needsShipping = resolved.some(r => r.category.fulfillment === 'shipping');
    if (needsShipping && (!shippingAddress || !shippingAddress.trim())) {
      return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
    }
    const total = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);

    const { data: orderRow, error: orderErr } = await client.from('orders').insert({
      tenant_id: tenant.id, client_id: user.id, payment_status: 'pending', status: 'pending',
      payment_method: 'paypal', shipping_address: needsShipping ? shippingAddress : null, total,
    }).select().maybeSingle();
    if (orderErr) return send(res, 400, { error: orderErr.message });
    if (!orderRow) return send(res, 500, { error: apiT('orderCreationFailed', reqLang(req)) });

    const itemRows = resolved.map(r => ({
      order_id: orderRow.id, tenant_id: tenant.id, product_id: r.product.id, name: r.product.name, sku: r.product.sku || null,
      translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
      category_name: r.category.name, fulfillment: r.category.fulfillment, status: 'awaiting_payment',
    }));
    const { error: itemsErr } = await client.from('order_items').insert(itemRows);
    if (itemsErr) {
      await client.from('orders').delete().eq('id', orderRow.id);
      return send(res, 400, { error: itemsErr.message });
    }
    await client.from('order_status_history').insert({ tenant_id: tenant.id, order_id: orderRow.id, status: 'pending', changed_by: 'System' });

    let payment = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        payment = await createPaymentRecord({ supabaseAdminClient: supabaseAdmin(), tenantId: tenant.id, orderId: orderRow.id, clientId: user.id, method: 'paypal', status: 'pending', amount: total, currency: 'usd' });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt === 1 ? 200 : 500));
      }
    }
    if (!payment) {
      console.error(`[paypal checkout] ALERT: could not create payments row for order ${orderRow.id} even before contacting PayPal.`, lastErr && lastErr.message);
      await client.from('order_items').delete().eq('order_id', orderRow.id);
      await client.from('orders').delete().eq('id', orderRow.id);
      return send(res, 500, { error: 'Could not start PayPal payment. Please try again.' });
    }

    let paypalOrder;
    try {
            const origin = req.headers['x-forwarded-proto'] + '://' + req.headers.host;
      paypalOrder = await paypalConnectLib.createOrder({ paypalApiCall, sellerMerchantId: record.paypalMerchantId, amount: total, currency: 'USD', customId:  
      payment.id, returnUrl: origin + '/?paypalReturn=1&orderId=' + orderRow.id, cancelUrl: origin + '/?paypalCancel=1&orderId=' + orderRow.id });
    } catch (e) {
      console.error('[paypal checkout] failed to create Order:', e.message);
      await supabaseAdmin().from('payments').delete().eq('id', payment.id);
      await client.from('order_items').delete().eq('order_id', orderRow.id);
      await client.from('orders').delete().eq('id', orderRow.id);
      return send(res, 500, { error: 'Could not start PayPal payment. Please try again.' });
    }

    let anchorPersisted = false;
    let anchorErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const anchorResult = await supabaseAdmin().from('orders').update({ pending_provider_reference: paypalOrder.id }).eq('id', orderRow.id).select().maybeSingle();
      if (!anchorResult.error && anchorResult.data) { anchorPersisted = true; break; }
      anchorErr = anchorResult.error;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt === 1 ? 200 : 500));
    }

    if (!anchorPersisted) {
      try { await paypalApiCall('POST', `/v2/checkout/orders/${paypalOrder.id}/void`, {}); }
      catch (e) { console.error(`[paypal checkout] FATAL: could not persist recovery anchor AND could not void PayPal order ${paypalOrder.id} as containment. This order is now genuinely orphaned and needs manual attention.`, e.message); }
      await supabaseAdmin().from('payments').delete().eq('id', payment.id);
      await client.from('order_items').delete().eq('order_id', orderRow.id);
      await client.from('orders').delete().eq('id', orderRow.id);
      console.error(`[paypal checkout] ALERT: recovery anchor could not be persisted for order ${orderRow.id}; PayPal order ${paypalOrder.id} void attempted as containment.`, anchorErr && anchorErr.message);
      return send(res, 500, { error: 'Could not start PayPal payment. Please try again.' });
    }

    let refFilled = false;
    let refErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const refResult = await supabaseAdmin().from('payments').update({ provider_reference: paypalOrder.id }).eq('id', payment.id).select().maybeSingle();
      if (!refResult.error && refResult.data) { refFilled = true; break; }
      refErr = refResult.error;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt === 1 ? 200 : 500));
    }

    if (refFilled) {
      await supabaseAdmin().from('orders').update({ pending_provider_reference: null }).eq('id', orderRow.id);
    } else {
      console.error(`[paypal checkout] ALERT: payments.provider_reference could not be filled in after 3 attempts for order ${orderRow.id}, PayPal order ${paypalOrder.id}. Recovery anchor is in place; webhook reconciliation must recover this.`, refErr && refErr.message);
    }

  const approveLink = (paypalOrder.links || []).find(l => l.rel === 'approve' || l.rel === 'payer-action');
  return send(res, 201, { orderId: orderRow.id, paypalOrderId: paypalOrder.id, paypalClientId: process.env.PAYPAL_CLIENT_ID || null, approveUrl:    
  approveLink ? approveLink.href : null });  }

  const record = getTenantPaymentMethod(tenant.id, 'paypal');
  if (!record || !record.enabled || record.paypalOnboardingStatus !== 'connected') {
    return send(res, 400, { error: 'PayPal is not available for this store.' });
  }
  const { items: localItems, shippingAddress: localShippingAddress } = body;
  if (!Array.isArray(localItems) || localItems.length === 0) return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });
  const localResolved = [];
  for (const line of localItems) {
    const p = findProduct(line.productId, tenant.id);
    if (!p) return send(res, 400, { error: `Unknown product: ${line.productId}` });
    const qty = line.qty || 1;
    const category = findCategory(p.categoryId, tenant.id);
    if (!['shipping', 'manual'].includes(category.fulfillment)) {
      return send(res, 400, { error: `"${p.name}" cannot currently be purchased with PayPal (download/booking items are not yet supported through PayPal checkout).` });
    }
    if (category.fulfillment === 'shipping' && typeof p.stock === 'number' && qty > p.stock) {
      return send(res, 400, { error: `Only ${p.stock} unit(s) of "${p.name}" left in stock.` });
    }
    localResolved.push({ product: p, category, qty });
  }
  const localNeedsShipping = localResolved.some(r => r.category.fulfillment === 'shipping');
  if (localNeedsShipping && (!localShippingAddress || !localShippingAddress.trim())) {
    return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
  }
  const localTotal = localResolved.reduce((s, r) => s + r.product.price * r.qty, 0);
  const localNow = Date.now();
  const localOrderId = newId('ord');
  const localOrderItems = localResolved.map(r => ({
    productId: r.product.id, name: r.product.name, sku: r.product.sku || null, translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
    categoryId: r.category.id, categoryName: r.category.name, fulfillment: r.category.fulfillment,
    status: 'awaiting_payment',
    refundRequested: false, refundStatus: 'none', refundRequestReason: null, refundRequestedAt: null, refundDecisionBy: null, refundDecisionAt: null, refundDecisionReason: null, refundPaymentLast4: null,
  }));
  const localOrder = { id: localOrderId, tenantId: tenant.id, clientId: user.id, clientName: user.name, clientEmail: user.email, items: localOrderItems, total: localTotal, paymentStatus: 'pending', status: 'pending', shippingAddress: localNeedsShipping ? localShippingAddress : null, createdAt: localNow };
  db.orders.push(localOrder);
  db.orderStatusHistory.push({ id: newId('osh'), tenantId: tenant.id, orderId: localOrderId, status: 'pending', changedBy: 'System', changedAt: localNow });
  try {
    const localPayment = await createPaymentRecord({ db, supabaseAdminClient: null, tenantId: tenant.id, orderId: localOrderId, clientId: user.id, method: 'paypal', status: 'pending', amount: localTotal, currency: 'usd' });
    const paypalOrder = await paypalConnectLib.createOrder({ paypalApiCall, sellerMerchantId: record.paypalMerchantId, amount: localTotal, currency: 'USD', customId: localPayment.id });
    localPayment.providerReference = paypalOrder.id;
    await persist();
    send(res, 201, { orderId: localOrderId, paypalOrderId: paypalOrder.id, paypalClientId: process.env.PAYPAL_CLIENT_ID || null });
  } catch (e) {
    console.error('[paypal checkout] failed to create Order:', e.message);
    send(res, 500, { error: 'Could not start PayPal payment. Please try again.' });
  }
});
/**
 * Cash checkout — no external provider, no redirect. The order and its
 * payment row are created immediately in a 'pending' state; the payment
 * only becomes 'paid' once staff explicitly confirms cash was actually
 * received (see POST /api/admin/payments/:paymentId/confirm-cash below),
 * exactly matching the same "never trust anything but a verified
 * confirmation" principle already enforced for Stripe/PayPal — here the
 * confirmation authority is staff judgement instead of a webhook.
 */
route('POST', '/api/orders/cash', { hostScope: 'tenant', auth: true, roles: ['client', 'admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (tenant.closedBySelf) return send(res, 403, { error: apiT('storeClosedNoOrders', reqLang(req)) });
  if (tenant.subscriptionExpiresAt && tenant.subscriptionExpiresAt < Date.now()) return send(res, 403, { error: apiT('storeSubExpiredNoOrders', reqLang(req)) });

  if (AUTH_DRIVER === 'supabase') {
    const cashRecord = await getTenantPaymentMethodSupabase(tenant.id, 'cash');
    if (!cashRecord || !cashRecord.enabled) {
      return send(res, 400, { error: 'Cash payment is not available for this store.' });
    }

    const { items, shippingAddress } = body;
    if (!Array.isArray(items) || items.length === 0) return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });

    const client = supabaseForRequest(bearerToken(req));
    const productIds = [...new Set(items.map(l => l.productId))];
    const { data: productRows, error: productsErr } = await client.from('products').select('*, categories(*)').eq('tenant_id', tenant.id).in('id', productIds);
    if (productsErr) return send(res, 500, { error: productsErr.message });

    const resolved = [];
    for (const line of items) {
      const row = (productRows || []).find(r => r.id === line.productId);
      if (!row) return send(res, 400, { error: `Unknown product: ${line.productId}` });
      const product = rowToProduct(row);
      const category = product.category;
      const qty = line.qty || 1;
      if (category.fulfillment === 'shipping' && typeof product.stock === 'number' && qty > product.stock) {
        return send(res, 400, { error: `Only ${product.stock} unit(s) of "${product.name}" left in stock.` });
      }
      resolved.push({ product, category, qty });
    }
    const needsShipping = resolved.some(r => r.category.fulfillment === 'shipping');
    if (needsShipping && (!shippingAddress || !shippingAddress.trim())) {
      return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
    }
    const total = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);

    const { data: orderRow, error: orderErr } = await client.from('orders').insert({
      tenant_id: tenant.id, client_id: user.id, payment_status: 'pending', status: 'pending',
      payment_method: 'cash', shipping_address: needsShipping ? shippingAddress : null, total,
    }).select().maybeSingle();
    if (orderErr) return send(res, 400, { error: orderErr.message });
    if (!orderRow) return send(res, 500, { error: apiT('orderCreationFailed', reqLang(req)) });

    const itemRows = resolved.map(r => ({
      order_id: orderRow.id, tenant_id: tenant.id, product_id: r.product.id, name: r.product.name, sku: r.product.sku || null,
      translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
      category_name: r.category.name, fulfillment: r.category.fulfillment, status: 'awaiting_payment',
    }));
    const { error: itemsErr } = await client.from('order_items').insert(itemRows);
    if (itemsErr) {
      await client.from('orders').delete().eq('id', orderRow.id);
      return send(res, 400, { error: itemsErr.message });
    }
    await client.from('order_status_history').insert({ tenant_id: tenant.id, order_id: orderRow.id, status: 'pending', changed_by: 'System' });

    let payment = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        payment = await createPaymentRecord({ supabaseAdminClient: supabaseAdmin(), tenantId: tenant.id, orderId: orderRow.id, clientId: user.id, method: 'cash', status: 'pending', amount: total, currency: 'usd' });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt === 1 ? 200 : 500));
      }
    }
    if (!payment) {
      console.error(`[cash checkout] ALERT: could not create payments row for order ${orderRow.id}.`, lastErr && lastErr.message);
      await client.from('order_items').delete().eq('order_id', orderRow.id);
      await client.from('orders').delete().eq('id', orderRow.id);
      return send(res, 500, { error: 'Could not start cash order. Please try again.' });
    }

    return send(res, 201, { orderId: orderRow.id, paymentId: payment.id, message: apiT('cashOrderPlacedMsg', reqLang(req)) || 'Order placed — pay with cash when you receive/collect it.' });
  }

  const record = getTenantPaymentMethod(tenant.id, 'cash');
  if (!record || !record.enabled) {
    return send(res, 400, { error: 'Cash payment is not available for this store.' });
  }
  const { items: localItems, shippingAddress: localShippingAddress } = body;
  if (!Array.isArray(localItems) || localItems.length === 0) return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });
  const localResolved = [];
  for (const line of localItems) {
    const p = findProduct(line.productId, tenant.id);
    if (!p) return send(res, 400, { error: `Unknown product: ${line.productId}` });
    const qty = line.qty || 1;
    const category = findCategory(p.categoryId, tenant.id);
    if (category.fulfillment === 'shipping' && typeof p.stock === 'number' && qty > p.stock) {
      return send(res, 400, { error: `Only ${p.stock} unit(s) of "${p.name}" left in stock.` });
    }
    localResolved.push({ product: p, category, qty });
  }
  const localNeedsShipping = localResolved.some(r => r.category.fulfillment === 'shipping');
  if (localNeedsShipping && (!localShippingAddress || !localShippingAddress.trim())) {
    return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
  }
  const localTotal = localResolved.reduce((s, r) => s + r.product.price * r.qty, 0);
  const localNow = Date.now();
  const localOrderId = newId('ord');
  const localOrderItems = localResolved.map(r => ({
    productId: r.product.id, name: r.product.name, sku: r.product.sku || null, translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
    categoryId: r.category.id, categoryName: r.category.name, fulfillment: r.category.fulfillment,
    status: 'awaiting_payment',
    refundRequested: false, refundStatus: 'none', refundRequestReason: null, refundRequestedAt: null, refundDecisionBy: null, refundDecisionAt: null, refundDecisionReason: null, refundPaymentLast4: null,
  }));
  const localOrder = { id: localOrderId, tenantId: tenant.id, clientId: user.id, clientName: user.name, clientEmail: user.email, items: localOrderItems, total: localTotal, paymentStatus: 'pending', status: 'pending', shippingAddress: localNeedsShipping ? localShippingAddress : null, createdAt: localNow };
  db.orders.push(localOrder);
  db.orderStatusHistory.push({ id: newId('osh'), tenantId: tenant.id, orderId: localOrderId, status: 'pending', changedBy: 'System', changedAt: localNow });
  const localPayment = await createPaymentRecord({ db, supabaseAdminClient: null, tenantId: tenant.id, orderId: localOrderId, clientId: user.id, method: 'cash', status: 'pending', amount: localTotal, currency: 'usd' });
  await persist();
  send(res, 201, { orderId: localOrderId, paymentId: localPayment.id, message: apiT('cashOrderPlacedMsg', reqLang(req)) || 'Order placed — pay with cash when you receive/collect it.' });
});

/**
 * Bank transfer checkout — like cash, no external provider or webhook.
 * Unlike cash, the customer's money moves outside Hadam entirely (a real
 * bank transfer), so staff need a way to match an incoming statement
 * line back to the correct order — hence the generated reference number,
 * enforced unique per (tenant, method) by the same idx_payments_provider_reference
 * index already proven for Stripe/PayPal. Settlement itself reuses the
 * exact same atomic-claim + consequence logic as cash.
 */
function generateBankTransferReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids transcription errors when a customer reads this aloud or copies it into a bank app
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `BT-${code}`;
}
route('POST', '/api/orders/bank-transfer', { hostScope: 'tenant', auth: true, roles: ['client', 'admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (tenant.closedBySelf) return send(res, 403, { error: apiT('storeClosedNoOrders', reqLang(req)) });
  if (tenant.subscriptionExpiresAt && tenant.subscriptionExpiresAt < Date.now()) return send(res, 403, { error: apiT('storeSubExpiredNoOrders', reqLang(req)) });

  if (AUTH_DRIVER === 'supabase') {
    const bankRecord = await getTenantPaymentMethodSupabase(tenant.id, 'bank_transfer');
    if (!bankRecord || !bankRecord.enabled) {
      return send(res, 400, { error: 'Bank transfer is not available for this store.' });
    }

    const { items, shippingAddress } = body;
    if (!Array.isArray(items) || items.length === 0) return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });

    const client = supabaseForRequest(bearerToken(req));
    const productIds = [...new Set(items.map(l => l.productId))];
    const { data: productRows, error: productsErr } = await client.from('products').select('*, categories(*)').eq('tenant_id', tenant.id).in('id', productIds);
    if (productsErr) return send(res, 500, { error: productsErr.message });

    const resolved = [];
    for (const line of items) {
      const row = (productRows || []).find(r => r.id === line.productId);
      if (!row) return send(res, 400, { error: `Unknown product: ${line.productId}` });
      const product = rowToProduct(row);
      const category = product.category;
      const qty = line.qty || 1;
      if (category.fulfillment === 'shipping' && typeof product.stock === 'number' && qty > product.stock) {
        return send(res, 400, { error: `Only ${product.stock} unit(s) of "${product.name}" left in stock.` });
      }
      resolved.push({ product, category, qty });
    }
    const needsShipping = resolved.some(r => r.category.fulfillment === 'shipping');
    if (needsShipping && (!shippingAddress || !shippingAddress.trim())) {
      return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
    }
    const total = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);

    const { data: orderRow, error: orderErr } = await client.from('orders').insert({
      tenant_id: tenant.id, client_id: user.id, payment_status: 'pending', status: 'pending',
      payment_method: 'bank_transfer', shipping_address: needsShipping ? shippingAddress : null, total,
    }).select().maybeSingle();
    if (orderErr) return send(res, 400, { error: orderErr.message });
    if (!orderRow) return send(res, 500, { error: apiT('orderCreationFailed', reqLang(req)) });

    const itemRows = resolved.map(r => ({
      order_id: orderRow.id, tenant_id: tenant.id, product_id: r.product.id, name: r.product.name, sku: r.product.sku || null,
      translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
      category_name: r.category.name, fulfillment: r.category.fulfillment, status: 'awaiting_payment',
    }));
    const { error: itemsErr } = await client.from('order_items').insert(itemRows);
    if (itemsErr) {
      await client.from('orders').delete().eq('id', orderRow.id);
      return send(res, 400, { error: itemsErr.message });
    }
    await client.from('order_status_history').insert({ tenant_id: tenant.id, order_id: orderRow.id, status: 'pending', changed_by: 'System' });

    // Reference generation retries on the rare unique-constraint collision
    // (idx_payments_provider_reference), same pattern as any other bounded,
    // idempotency-safe retry used elsewhere tonight.
    let payment = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const reference = generateBankTransferReference();
      try {
        payment = await createPaymentRecord({ supabaseAdminClient: supabaseAdmin(), tenantId: tenant.id, orderId: orderRow.id, clientId: user.id, method: 'bank_transfer', status: 'pending', amount: total, currency: 'usd', providerReference: reference });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const isUniqueConflict = e.code === '23505' || /duplicate|unique/i.test(e.message || '');
        if (!isUniqueConflict) break; // only retry on a genuine reference collision, not other failures
      }
    }
    if (!payment) {
      console.error(`[bank transfer checkout] ALERT: could not create payments row for order ${orderRow.id}.`, lastErr && lastErr.message);
      await client.from('order_items').delete().eq('order_id', orderRow.id);
      await client.from('orders').delete().eq('id', orderRow.id);
      return send(res, 500, { error: 'Could not start bank transfer order. Please try again.' });
    }

    return send(res, 201, {
      orderId: orderRow.id, paymentId: payment.id, reference: payment.providerReference,
      amount: total, currency: 'usd',
      bankDetails: bankRecord.config || {},
      message: apiT('bankTransferOrderPlacedMsg', reqLang(req)) || 'Order placed — complete your bank transfer using the reference below.',
    });
  }

  const record = getTenantPaymentMethod(tenant.id, 'bank_transfer');
  if (!record || !record.enabled) {
    return send(res, 400, { error: 'Bank transfer is not available for this store.' });
  }
  const { items: localItems, shippingAddress: localShippingAddress } = body;
  if (!Array.isArray(localItems) || localItems.length === 0) return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });
  const localResolved = [];
  for (const line of localItems) {
    const p = findProduct(line.productId, tenant.id);
    if (!p) return send(res, 400, { error: `Unknown product: ${line.productId}` });
    const qty = line.qty || 1;
    const category = findCategory(p.categoryId, tenant.id);
    if (category.fulfillment === 'shipping' && typeof p.stock === 'number' && qty > p.stock) {
      return send(res, 400, { error: `Only ${p.stock} unit(s) of "${p.name}" left in stock.` });
    }
    localResolved.push({ product: p, category, qty });
  }
  const localNeedsShipping = localResolved.some(r => r.category.fulfillment === 'shipping');
  if (localNeedsShipping && (!localShippingAddress || !localShippingAddress.trim())) {
    return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
  }
  const localTotal = localResolved.reduce((s, r) => s + r.product.price * r.qty, 0);
  const localNow = Date.now();
  const localOrderId = newId('ord');
  const localOrderItems = localResolved.map(r => ({
    productId: r.product.id, name: r.product.name, sku: r.product.sku || null, translations: r.product.translations || {}, price: r.product.price, qty: r.qty,
    categoryId: r.category.id, categoryName: r.category.name, fulfillment: r.category.fulfillment,
    status: 'awaiting_payment',
    refundRequested: false, refundStatus: 'none', refundRequestReason: null, refundRequestedAt: null, refundDecisionBy: null, refundDecisionAt: null, refundDecisionReason: null, refundPaymentLast4: null,
  }));
  const localOrder = { id: localOrderId, tenantId: tenant.id, clientId: user.id, clientName: user.name, clientEmail: user.email, items: localOrderItems, total: localTotal, paymentStatus: 'pending', status: 'pending', shippingAddress: localNeedsShipping ? localShippingAddress : null, createdAt: localNow };
  db.orders.push(localOrder);
  db.orderStatusHistory.push({ id: newId('osh'), tenantId: tenant.id, orderId: localOrderId, status: 'pending', changedBy: 'System', changedAt: localNow });
  const localReference = generateBankTransferReference();
  const localPayment = await createPaymentRecord({ db, supabaseAdminClient: null, tenantId: tenant.id, orderId: localOrderId, clientId: user.id, method: 'bank_transfer', status: 'pending', amount: localTotal, currency: 'usd', providerReference: localReference });
  await persist();
  send(res, 201, {
    orderId: localOrderId, paymentId: localPayment.id, reference: localReference,
    amount: localTotal, currency: 'usd',
    bankDetails: (record && record.config) || {},
    message: apiT('bankTransferOrderPlacedMsg', reqLang(req)) || 'Order placed — complete your bank transfer using the reference below.',
  });
});

route('POST', '/api/orders/paypal/:orderId/capture', { hostScope: 'tenant', auth: true, roles: ['client', 'admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('*').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: 'Order not found.' });
    const { data: payment, error: paymentErr } = await supabaseAdmin().from('payments').select('*').eq('order_id', order.id).eq('method', 'paypal').maybeSingle();
    if (paymentErr) return send(res, 500, { error: paymentErr.message });
    if (!payment) return send(res, 404, { error: 'No PayPal payment found for this order.' });
    try {
      const result = await paypalConnectLib.captureOrder({ paypalApiCall, paypalOrderId: payment.provider_reference });
      return send(res, 200, { status: result.status });
    } catch (e) {
      console.error('[paypal checkout] failed to capture Order:', e.message);
      return send(res, 500, { error: 'Could not confirm PayPal payment. Please try again.' });
    }
  }

  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: 'Order not found.' });
  const payment = db.payments.find(p => p.orderId === order.id && p.method === 'paypal');
  if (!payment) return send(res, 404, { error: 'No PayPal payment found for this order.' });
  try {
    const result = await paypalConnectLib.captureOrder({ paypalApiCall, paypalOrderId: payment.providerReference });
    send(res, 200, { status: result.status });
  } catch (e) {
    console.error('[paypal checkout] failed to capture Order:', e.message);
    send(res, 500, { error: 'Could not confirm PayPal payment. Please try again.' });
  }
});
/**
 * Staff confirmation of a cash payment — the cash equivalent of a
 * verified webhook. There is no external provider here, so the
 * confirmation authority is explicitly staff judgement (admin/employee
 * only, never the client themselves) rather than an automated signal.
 * Reuses the exact same atomic claim + settlement consequence logic
 * already proven for Stripe/PayPal, so stock decrement, order/item
 * settlement, and notification all behave identically regardless of
 * payment method.
 */
route('POST', '/api/admin/payments/:paymentId/confirm-cash', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('payments').select('*').eq('id', params.paymentId).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    const payment = data ? rowToPayment(data) : null;
    if (!payment) return send(res, 404, { error: 'Payment not found.' });
    if (payment.tenantId !== tenant.id) return send(res, 404, { error: 'Payment not found.' });
    if (payment.method !== 'cash') return send(res, 400, { error: 'This endpoint only confirms cash payments.' });
    if (payment.status !== 'pending') {
      return send(res, 400, { error: `This payment cannot be confirmed from its current status (${payment.status}).` });
    }
    const claimed = await tryClaimPaymentTransition({ paymentId: payment.id, fromStatus: 'pending', toStatus: 'paid', confirmedBy: user.id });
    if (!claimed) return send(res, 409, { error: 'This payment was already confirmed or its status changed.' });
    await applyPaymentOutcomeToOrderSupabase(claimed, true);
    return send(res, 200, { status: 'paid', message: 'Cash payment confirmed.' });
  }

  const payment = db.payments.find(p => p.id === params.paymentId);
  if (!payment) return send(res, 404, { error: 'Payment not found.' });
  if (payment.tenantId !== tenant.id) return send(res, 404, { error: 'Payment not found.' });
  if (payment.method !== 'cash') return send(res, 400, { error: 'This endpoint only confirms cash payments.' });
  if (payment.status !== 'pending') {
    return send(res, 400, { error: `This payment cannot be confirmed from its current status (${payment.status}).` });
  }
  payment.status = 'paid';
  payment.confirmedBy = user.id;
  await applyPaymentOutcomeToOrder(payment, true);
  await persist();
  send(res, 200, { status: 'paid', message: 'Cash payment confirmed.' });
});
/**
 * Staff confirmation of a bank transfer — same reasoning and pattern as
 * cash confirmation: no external provider, so a human matches an
 * incoming bank statement line to the reference number, then confirms
 * here. Reuses the exact same atomic claim + settlement consequence
 * logic.
 */
route('POST', '/api/admin/payments/:paymentId/confirm-bank-transfer', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('payments').select('*').eq('id', params.paymentId).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    const payment = data ? rowToPayment(data) : null;
    if (!payment) return send(res, 404, { error: 'Payment not found.' });
    if (payment.tenantId !== tenant.id) return send(res, 404, { error: 'Payment not found.' });
    if (payment.method !== 'bank_transfer') return send(res, 400, { error: 'This endpoint only confirms bank transfer payments.' });
    if (payment.status !== 'pending') {
      return send(res, 400, { error: `This payment cannot be confirmed from its current status (${payment.status}).` });
    }
    const claimed = await tryClaimPaymentTransition({ paymentId: payment.id, fromStatus: 'pending', toStatus: 'paid', confirmedBy: user.id });
    if (!claimed) return send(res, 409, { error: 'This payment was already confirmed or its status changed.' });
    await applyPaymentOutcomeToOrderSupabase(claimed, true);
    return send(res, 200, { status: 'paid', message: 'Bank transfer confirmed.' });
  }

  const payment = db.payments.find(p => p.id === params.paymentId);
  if (!payment) return send(res, 404, { error: 'Payment not found.' });
  if (payment.tenantId !== tenant.id) return send(res, 404, { error: 'Payment not found.' });
  if (payment.method !== 'bank_transfer') return send(res, 400, { error: 'This endpoint only confirms bank transfer payments.' });
  if (payment.status !== 'pending') {
    return send(res, 400, { error: `This payment cannot be confirmed from its current status (${payment.status}).` });
  }
  payment.status = 'paid';
  payment.confirmedBy = user.id;
  await applyPaymentOutcomeToOrder(payment, true);
  await persist();
  send(res, 200, { status: 'paid', message: 'Bank transfer confirmed.' });
});
/**
 * Cancellation of a still-pending bank transfer (or cash order) — the
 * customer changed their mind, or staff never received the transfer.
 * Since the payment never reached 'paid', no stock was ever decremented
 * (settlement is what causes the decrement, and settlement only runs on
 * a successful claim to 'paid') — so cancellation here is a pure status
 * change, never a stock reversal.
 */
route('POST', '/api/admin/payments/:paymentId/cancel-pending', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('payments').select('*').eq('id', params.paymentId).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    const payment = data ? rowToPayment(data) : null;
    if (!payment) return send(res, 404, { error: 'Payment not found.' });
    if (payment.tenantId !== tenant.id) return send(res, 404, { error: 'Payment not found.' });
    if (!['cash', 'bank_transfer'].includes(payment.method)) return send(res, 400, { error: 'This endpoint only cancels cash or bank transfer payments.' });
    if (payment.status !== 'pending') {
      return send(res, 400, { error: `This payment cannot be cancelled from its current status (${payment.status}).` });
    }
    const claimed = await tryClaimPaymentTransition({ paymentId: payment.id, fromStatus: 'pending', toStatus: 'cancelled', confirmedBy: user.id });
    if (!claimed) return send(res, 409, { error: 'This payment was already confirmed or its status changed.' });
    const supaAdmin = supabaseAdmin();
    await supaAdmin.from('orders').update({ payment_status: 'failed' }).eq('id', payment.orderId);
    await supaAdmin.from('order_items').update({ status: 'payment_failed' }).eq('order_id', payment.orderId).eq('status', 'awaiting_payment');
    return send(res, 200, { status: 'cancelled', message: 'Payment cancelled.' });
  }

  const payment = db.payments.find(p => p.id === params.paymentId);
  if (!payment) return send(res, 404, { error: 'Payment not found.' });
  if (payment.tenantId !== tenant.id) return send(res, 404, { error: 'Payment not found.' });
  if (!['cash', 'bank_transfer'].includes(payment.method)) return send(res, 400, { error: 'This endpoint only cancels cash or bank transfer payments.' });
  if (payment.status !== 'pending') {
    return send(res, 400, { error: `This payment cannot be cancelled from its current status (${payment.status}).` });
  }
  payment.status = 'cancelled';
  payment.confirmedBy = user.id;
  const order = db.orders.find(o => o.id === payment.orderId);
  if (order) { order.paymentStatus = 'failed'; order.items.forEach(i => { if (i.status === 'awaiting_payment') i.status = 'payment_failed'; }); }
  await persist();
  send(res, 200, { status: 'cancelled', message: 'Payment cancelled.' });
});
/**
 * Provider-dispatching refund endpoint — staff never needs to know or
 * care which provider a payment used; this route figures that out from
 * the payment record itself and calls the correct API. Staff-only
 * (matching the existing refund pattern elsewhere in this app — a
 * customer can request a refund, but never grant one themselves).
 *
 * Critical rule, matching checkout exactly: this route calls the real
 * provider refund API and returns whatever THEY report back — but it
 * NEVER transitions payment.status itself. Only the corresponding
 * webhook (charge.refunded / PAYMENT.CAPTURE.REFUNDED), independently
 * verified, does that. A refund "succeeding" from the provider's
 * immediate API response is not the same as it being confirmed —
 * exactly the same principle already enforced for "payment succeeded."
 */
route('POST', '/api/admin/payments/:paymentId/refund', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
    let payment;
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAdmin().from('payments').select('*').eq('id', params.paymentId).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    payment = data ? rowToPayment(data) : null;
  } else {
    payment = db.payments.find(p => p.id === params.paymentId);
  }
  if (!payment) return send(res, 404, { error: 'Payment not found.' });
  // Tenant ownership check — a real security boundary, not a formality:
  // this is what stops Store A's staff from refunding Store B's payment
  // even if they somehow guessed/obtained a valid payment id.
  if (payment.tenantId !== tenant.id) return send(res, 404, { error: 'Payment not found.' });

  if (!['paid', 'partially_refunded'].includes(payment.status)) {
    return send(res, 400, { error: `This payment cannot be refunded from its current status (${payment.status}).` });
  }

  const amount = body && body.amount != null ? Number(body.amount) : undefined; // undefined -> full refund
  if (amount !== undefined && (!(amount > 0) || amount > payment.amount)) {
    return send(res, 400, { error: 'Refund amount must be a positive number no greater than the original payment amount.' });
  }

  try {
    if (payment.method === 'stripe') {
      await stripeConnectLib.createRefund({ stripe: stripeClient(), paymentIntentId: payment.providerReference, amount });
    } else if (payment.method === 'paypal') {
      // The PayPal Order id (payment.providerReference) is not itself
      // refundable — refunds target the CAPTURE id, which only exists
      // after a successful capture. This app doesn't currently persist
      // the capture id separately, so it's read back from PayPal here.
      const orderDetails = await paypalApiCall('GET', `/v2/checkout/orders/${payment.providerReference}`);
      const capture = orderDetails.purchase_units && orderDetails.purchase_units[0] && orderDetails.purchase_units[0].payments && orderDetails.purchase_units[0].payments.captures && orderDetails.purchase_units[0].payments.captures[0];
      if (!capture) return send(res, 400, { error: 'No completed capture found for this payment yet.' });
      await paypalConnectLib.refundCapture({ paypalApiCall, captureId: capture.id, amount, currency: payment.currency ? payment.currency.toUpperCase() : 'USD' });
    } else {
      return send(res, 400, { error: `Refunds are not supported for payment method "${payment.method}" through this endpoint.` });
    }
    // Deliberately still 'paid'/'partially_refunded' here — the request
    // to refund was accepted by the provider, but confirmation is
    // webhook-driven, same as checkout.
    send(res, 202, { status: payment.status, message: 'Refund request accepted; awaiting provider confirmation.' });
  } catch (e) {
    console.error(`[${payment.method} refund] failed:`, e.message);
    send(res, 500, { error: e.message });
  }
});

/** The Stripe Connect webhook endpoint. Platform-level (hostScope: 'any') since Stripe calls one fixed URL regardless of which connected account an event is for — event.account in the verified payload, never anything host- or client-supplied, is what identifies the tenant. rawBody: true is essential here — see readRawBody's own comment for why. */
/** Applies the real-world consequences of a payment's outcome to its order: fulfillment status, stock decrement (only on success, only for shipping items), and the payment_received notification. Shared by every provider's webhook handler (Stripe, PayPal, and any future method) so this logic — the actual "did the money really arrive" business rules — is defined exactly once. */
async function tryClaimPaymentTransition({ paymentId, fromStatus, toStatus, confirmedBy = null }) {
  const admin = supabaseAdmin();
  const updateFields = { status: toStatus, updated_at: new Date().toISOString() };
  if (confirmedBy) updateFields.confirmed_by = confirmedBy;
  const { data, error } = await admin.from('payments').update(updateFields)
    .eq('id', paymentId).eq('status', fromStatus).select().maybeSingle();
  if (error) { console.error(`[webhook] failed to claim payment transition ${fromStatus} -> ${toStatus} for payment ${paymentId}:`, error.message); return null; }
  return data ? rowToPayment(data) : null;
}

async function applyPaymentOutcomeToOrderSupabase(payment, succeeded) {
  if (!payment) return;
  const admin = supabaseAdmin();

  const { data: order, error: orderFetchErr } = await admin.from('orders').select('*, order_items(*)').eq('id', payment.orderId).maybeSingle();
  if (orderFetchErr) { console.error('[webhook] failed to fetch order for outcome application:', orderFetchErr.message); return; }
  if (!order) { console.error(`[webhook] order ${payment.orderId} not found while applying payment outcome — nothing to update.`); return; }

  const { error: orderUpdateErr } = await admin.from('orders').update({ payment_status: succeeded ? 'success' : 'failed' }).eq('id', order.id);
  if (orderUpdateErr) console.error('[webhook] failed to update order.payment_status:', orderUpdateErr.message);

  for (const item of order.order_items || []) {
    if (item.status !== 'awaiting_payment') continue;

    if (succeeded && item.fulfillment === 'shipping' && item.product_id) {
      const { data: newStock, error: stockErr } = await admin.rpc('adjust_product_stock_for_item', {
        p_order_item_id: item.id, p_product_id: item.product_id, p_tenant_id: order.tenant_id, p_change: -item.qty, p_reason: 'sale', p_order_id: order.id,
      });
      if (stockErr) {
        console.error(`[webhook] ALERT: adjust_product_stock_for_item RPC call failed for order ${order.id}, item ${item.id}:`, stockErr.message);
        continue;
      }
      if (newStock === null) {
        console.error(`[webhook] ALERT: insufficient stock to fulfill order ${order.id}, item ${item.id} (product ${item.product_id}) — payment succeeded, stock not decremented. Requires manual inventory reconciliation.`);
      }
    }

    const newStatus = succeeded
      ? (item.fulfillment === 'shipping' ? 'pending' : item.fulfillment === 'booking' ? 'requested' : item.fulfillment === 'download' ? 'ready' : 'pending')
      : 'payment_failed';
    const { error: itemUpdateErr } = await admin.from('order_items').update({ status: newStatus }).eq('id', item.id);
    if (itemUpdateErr) console.error(`[webhook] failed to update order_item ${item.id} status:`, itemUpdateErr.message);
  }

  if (succeeded) {
    const { data: claimedForNotification, error: notifyClaimErr } = await admin.from('orders').update({ payment_notification_sent_at: new Date().toISOString() }).eq('id', order.id).is('payment_notification_sent_at', null).select().maybeSingle();
    if (notifyClaimErr) console.error('[webhook] failed to claim notification send for order', order.id, notifyClaimErr.message);
    if (claimedForNotification) {
      const itemsList = (order.order_items || []).map(i => `- ${i.name} × ${i.qty} ($${(i.price * i.qty).toFixed(2)})`).join('\n');
      const orderDate = new Date(order.created_at).toLocaleString();
      const { data: adminMemberships, error: adminMembershipsErr } = await admin.from('tenant_memberships').select('user_id').eq('tenant_id', order.tenant_id).eq('role', 'admin');
      if (adminMembershipsErr) console.error('[webhook] admin lookup for payment notice failed:', adminMembershipsErr.message);
      for (const m of adminMemberships || []) {
        try {
          const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
          if (authUser && authUser.user) {
            const adminLang = await getRecipientLang(authUser.user.email);
            const subject = emailT(EMAIL_I18N, 'paymentReceivedSubject', adminLang)(order.id);
            const emailBody = emailT(EMAIL_I18N, 'paymentReceivedBody', adminLang)(order.id, order.client_id, Number(order.total).toFixed(2), orderDate, itemsList);
            await admin.from('notifications').insert({ tenant_id: order.tenant_id, type: 'payment_received', to_email: authUser.user.email, subject, body: emailBody });
            await sendRealEmail({ to: authUser.user.email, subject, text: emailBody, html: wrapEmailHtml(emailBody, adminLang) });
          }
        } catch (e) { console.error('[webhook] admin notification failed (best-effort, non-fatal):', e.message); }
      }
    }
  }
}

async function reconcilePaymentByProviderReference({ providerReference, method, amount, currency = 'usd' }) {
  const admin = supabaseAdmin();

  const { data: existingPayment, error: findErr } = await admin.from('payments').select('*').eq('provider_reference', providerReference).eq('method', method).maybeSingle();
  if (findErr) { console.error('[webhook reconciliation] payments lookup failed:', findErr.message); return null; }
  if (existingPayment) return rowToPayment(existingPayment);

  const { data: order, error: orderErr } = await admin.from('orders').select('*').eq('pending_provider_reference', providerReference).eq('payment_method', method).maybeSingle();
  if (orderErr) { console.error('[webhook reconciliation] orders anchor lookup failed:', orderErr.message); return null; }
    if (!order) {
    console.error(`[webhook reconciliation] no payment or order found for provider reference ${providerReference} (method: ${method}) — ignoring.`);
    return null;
  }

  const { data: existingByOrder, error: byOrderErr } = await admin.from('payments').select('*').eq('order_id', order.id).eq('method', method).maybeSingle();
  if (byOrderErr) { console.error('[webhook reconciliation] payments lookup by order_id failed:', byOrderErr.message); return null; }
  if (existingByOrder) {
    if (!existingByOrder.provider_reference) {
      const { data: updated, error: updateErr } = await admin.from('payments').update({ provider_reference: providerReference }).eq('id', existingByOrder.id).select().maybeSingle();
      if (updateErr) { console.error(`[webhook reconciliation] found existing payment ${existingByOrder.id} for order ${order.id} but failed to attach provider_reference:`, updateErr.message); return rowToPayment(existingByOrder); }
      const { error: clearErr } = await admin.from('orders').update({ pending_provider_reference: null }).eq('id', order.id);
      if (clearErr) console.error(`[webhook reconciliation] attached provider_reference to payment ${existingByOrder.id}, but clearing the recovery anchor on order ${order.id} failed (harmless):`, clearErr.message);
      console.error(`[webhook reconciliation] reconciled existing payment ${existingByOrder.id} for order ${order.id} with provider reference ${providerReference}.`);
      return rowToPayment(updated);
    }
    return rowToPayment(existingByOrder);
  }

  try {
  
    const recovered = await createPaymentRecord({ supabaseAdminClient: admin, tenantId: order.tenant_id, orderId: order.id, clientId: order.client_id,  
    method, status: 'pending', amount: amount != null ? amount : Number(order.total), currency, providerReference });
    const { error: clearErr } = await admin.from('orders').update({ pending_provider_reference: null }).eq('id', order.id);
    if (clearErr) console.error(`[webhook reconciliation] payment ${recovered.id} recovered successfully, but clearing the recovery anchor on order  
    ${order.id} failed (harmless — a future webhook will still find the payment via the normal lookup first):`, clearErr.message);
    console.error(`[webhook reconciliation] recovered missing payments row for order ${order.id}, provider reference ${providerReference}.`);
    return recovered;
  } catch (e) {
    const isUniqueConflict = e.code === '23505' || /duplicate|unique/i.test(e.message || '');
    if (isUniqueConflict) {
      const { data: winner } = await admin.from('payments').select('*').eq('provider_reference', providerReference).eq('method', method).maybeSingle();
      if (winner) return rowToPayment(winner);
    }
    console.error(`[webhook reconciliation] ALERT: failed to reconstruct payments row for order ${order.id}, provider reference ${providerReference} even during reconciliation:`, e.message);
    return null;
  }
}
async function applyPaymentOutcomeToOrder(payment, succeeded) {
  const order = payment && db.orders.find(o => o.id === payment.orderId);
  if (!order) return;
  order.paymentStatus = succeeded ? 'success' : 'failed';
  for (const item of order.items) {
    item.status = succeeded ? (item.fulfillment === 'shipping' ? 'pending' : item.fulfillment === 'booking' ? 'requested' : item.fulfillment === 'download' ? 'ready' : 'pending') : 'payment_failed';
    if (succeeded && item.fulfillment === 'shipping') {
      const product = findProduct(item.productId, order.tenantId);
      if (product && typeof product.stock === 'number') {
        product.stock -= item.qty;
        db.stockMovements.push({ id: newId('stkmv'), tenantId: order.tenantId, productId: item.productId, change: -item.qty, reason: 'sale', orderId: order.id, createdBy: null, createdAt: Date.now() });
      }
    }
  }
  if (succeeded) {
    const itemsList = order.items.map(i => `- ${i.name} × ${i.qty} ($${(i.price * i.qty).toFixed(2)})`).join('\n');
    const orderDate = new Date(order.createdAt).toLocaleString();
    for (const admin of db.users.filter(u => u.tenantId === order.tenantId && u.role === 'admin')) {
      const adminLang = await getRecipientLang(admin.email);
      const subject = emailT(EMAIL_I18N, 'paymentReceivedSubject', adminLang)(order.id);
      const emailBody = emailT(EMAIL_I18N, 'paymentReceivedBody', adminLang)(order.id, order.clientName, order.total.toFixed(2), orderDate, itemsList);
      db.notifications.push({ id: newId('notif'), tenantId: order.tenantId, type: 'payment_received', to: admin.email, subject, body: emailBody, sentAt: Date.now() });
      try { await sendRealEmail({ to: admin.email, subject, text: emailBody, html: wrapEmailHtml(emailBody, adminLang) }); } catch { /* best-effort, matches every other notification in this app */ }
    }
  }
  await persist();
}

route('POST', '/api/webhooks/stripe', { hostScope: 'any', rawBody: true }, async (req, res, params, body) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) return send(res, 400, { error: 'Missing Stripe-Signature header.' });
  if (!process.env.STRIPE_WEBHOOK_SECRET) return send(res, 500, { error: 'Webhook secret not configured.' });

  let event;
  try {
    event = stripeConnectLib.verifyWebhookSignature({ stripe: stripeClient(), rawBody: body, signatureHeader: signature, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET });
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err.message);
    return send(res, 400, { error: 'Invalid signature.' });
  }

  const result = await stripeConnectLib.processWebhookEvent({ db, supabaseAdminClient: AUTH_DRIVER === 'supabase' ? supabaseAdmin() : null, event });
  // account.updated needs the tenant lookup + tenant_payment_methods write
  // that only this route (not lib/stripeConnect.js, which has no `db`
  // access of its own) can perform.
  if (result.processed && event.type === 'account.updated') {
    const account = event.data.object;
    const newStatus = stripeConnectLib.mapAccountStatus(account);
    if (AUTH_DRIVER === 'supabase') {
      const { data: record } = await supabaseAdmin().from('tenant_payment_methods').select('*').eq('stripe_account_id', account.id).maybeSingle();
      if (record) await upsertTenantPaymentMethodSupabase(record.tenant_id, 'stripe', { stripe_onboarding_status: newStatus });
    } else {
      const record = db.tenantPaymentMethods.find(m => m.stripeAccountId === account.id);
      if (record) {
        record.stripeOnboardingStatus = newStatus;
        await persist();
      }
    }
  }
  if (result.processed && (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed')) {
    const intent = event.data.object;
    const succeeded = event.type === 'payment_intent.succeeded';
    if (AUTH_DRIVER === 'supabase') {
      const paymentId = intent.metadata && intent.metadata.paymentId;
      let payment = null;
      if (paymentId) {
        const { data } = await supabaseAdmin().from('payments').select('*').eq('id', paymentId).maybeSingle();
        if (data) payment = rowToPayment(data);
      }
      if (!payment) {
        payment = await reconcilePaymentByProviderReference({ providerReference: intent.id, method: 'stripe', amount: intent.amount / 100, currency: intent.currency });
      }
      if (payment) {
        let claimed = await tryClaimPaymentTransition({ paymentId: payment.id, fromStatus: 'pending', toStatus: succeeded ? 'paid' : 'failed' });
        if (!claimed) {
          const { data: current } = await supabaseAdmin().from('payments').select('*').eq('id', payment.id).maybeSingle();
          if (current && current.status === (succeeded ? 'paid' : 'failed')) claimed = rowToPayment(current);
        }
        if (claimed) await applyPaymentOutcomeToOrderSupabase(claimed, succeeded);
      }
    } else {
      const paymentId = intent.metadata && intent.metadata.paymentId;
      const payment = paymentId && db.payments.find(p => p.id === paymentId);
      await applyPaymentOutcomeToOrder(payment, succeeded);
    }
  }
  send(res, 200, { received: true });
});

/**
 * PayPal webhook endpoint. Platform-level (hostScope: 'any') since PayPal
 * calls one fixed URL regardless of which connected seller an event is
 * for — resource.merchant_id in the verified payload, never anything
 * host- or client-supplied, is what identifies the tenant, matching
 * exactly how Stripe's event.account is used above. Does NOT need
 * rawBody — PayPal's own verify-webhook-signature API takes the parsed
 * JSON event body directly, unlike Stripe's local HMAC check.
 */
route('POST', '/api/webhooks/paypal', { hostScope: 'any' }, async (req, res, params, body) => {
  if (!process.env.PAYPAL_WEBHOOK_ID) return send(res, 500, { error: 'Webhook ID not configured.' });
  try {
    await paypalConnectLib.verifyWebhookSignature({ paypalApiCall, headers: req.headers, webhookId: process.env.PAYPAL_WEBHOOK_ID, webhookEventBody: body });
  } catch (err) {
    console.error('[paypal webhook] signature verification failed:', err.message);
    return send(res, 400, { error: 'Invalid signature.' });
  }

  const result = await paypalConnectLib.processWebhookEvent({ db, supabaseAdminClient: AUTH_DRIVER === 'supabase' ? supabaseAdmin() : null, event: body });

  if (result.processed && (body.event_type === 'MERCHANT.ONBOARDING.COMPLETED' || body.event_type === 'MERCHANT.PARTNER-CONSENT.REVOKED')) {
    const merchantId = body.resource && (body.resource.merchant_id || (body.resource.partner_client_id ? body.resource.merchant_id : null));
    if (merchantId) {
      const newStatus = body.event_type === 'MERCHANT.ONBOARDING.COMPLETED' ? 'connected' : 'restricted';
      if (AUTH_DRIVER === 'supabase') {
        const { data: record } = await supabaseAdmin().from('tenant_payment_methods').select('*').eq('paypal_merchant_id', merchantId).maybeSingle();
        if (record) await upsertTenantPaymentMethodSupabase(record.tenant_id, 'paypal', { paypal_onboarding_status: newStatus });
      } else {
        const record = db.tenantPaymentMethods.find(m => m.paypalMerchantId === merchantId);
        if (record) {
          record.paypalOnboardingStatus = newStatus;
          await persist();
        }
      }
    }
  }

  if (result.processed && (body.event_type === 'PAYMENT.CAPTURE.COMPLETED' || body.event_type === 'PAYMENT.CAPTURE.DENIED')) {
    const succeeded = body.event_type === 'PAYMENT.CAPTURE.COMPLETED';

    if (AUTH_DRIVER === 'supabase') {
      const paymentId = body.resource && body.resource.custom_id;
      let payment = null;
      if (paymentId) {
        const { data } = await supabaseAdmin().from('payments').select('*').eq('id', paymentId).maybeSingle();
        if (data) payment = rowToPayment(data);
      }
      if (!payment) {
        const paypalOrderId = body.resource && body.resource.supplementary_data && body.resource.supplementary_data.related_ids && body.resource.supplementary_data.related_ids.order_id;
                const amount = body.resource && body.resource.amount && Number(body.resource.amount.value);
        const currency = body.resource && body.resource.amount && body.resource.amount.currency_code && body.resource.amount.currency_code.toLowerCase();
        if (paypalOrderId) {
          payment = await reconcilePaymentByProviderReference({ providerReference: paypalOrderId, method: 'paypal', amount, currency });
        }
      }
      if (!payment) { send(res, 200, { received: true }); return; }

      let claimed = await tryClaimPaymentTransition({ paymentId: payment.id, fromStatus: 'pending', toStatus: succeeded ? 'paid' : 'failed' });
      if (!claimed) {
        const { data: current } = await supabaseAdmin().from('payments').select('*').eq('id', payment.id).maybeSingle();
        if (current && current.status === (succeeded ? 'paid' : 'failed')) claimed = rowToPayment(current);
      }
      if (claimed) await applyPaymentOutcomeToOrderSupabase(claimed, succeeded);
    } else {
      const paymentId = body.resource && body.resource.custom_id;
      const payment = paymentId && db.payments.find(p => p.id === paymentId);
      await applyPaymentOutcomeToOrder(payment, succeeded);
    }
  }
  send(res, 200, { received: true });
});
// Uses MyMemory's free translation API (https://mymemory.translated.net) —
// no signup or API key required for this level of usage. It has a fair-use
// daily character cap (higher if a contact email is provided), which is
// more than enough for occasional product/category name and description
// translation, but is not meant for bulk/automated translation of an entire
// catalog at once.
async function translateText(text, targetLang) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${encodeURIComponent(targetLang)}`;
  const apiRes = await fetch(url);
  if (!apiRes.ok) throw new Error(`Translation service returned an error (HTTP ${apiRes.status}).`);
  const data = await apiRes.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || data.responseStatus !== 200) throw new Error('Translation service could not translate this text right now.');
  return translated;
}

route('POST', '/api/admin/translate', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body) => {
  if (rateLimited(req, res, 'translate', 40, 5)) return;
  const { text, targetLang } = body;
  if (!text || !targetLang) return send(res, 400, { error: apiT('textTargetLangRequired', reqLang(req)) });
  if (text.length > 2000) return send(res, 400, { error: apiT('textTooLongTranslate', reqLang(req)) });
  try {
    const translated = await translateText(text, targetLang);
    send(res, 200, { translated });
  } catch (e) { send(res, 502, { error: e.message }); }
});

// Translates and saves every product, category, or the store's own text in
// one action — for when reviewing each item individually isn't wanted.
// Deliberately server-side and sequential (not many parallel browser
// requests) to stay well within the free translation service's fair-use
// limits, and to make partial failure clearly reportable per item rather
// than silently losing track of which ones succeeded.
route('POST', '/api/admin/translate-bulk', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (rateLimited(req, res, 'translate-bulk', 15, 15)) return;
  const { targetLang, scope } = body;
  if (!targetLang) return send(res, 400, { error: apiT('targetLangRequired', reqLang(req)) });
  if (!['products', 'categories', 'store'].includes(scope)) return send(res, 400, { error: apiT('scopeInvalid', reqLang(req)) });
  const lang = targetLang.trim().toLowerCase();
  const results = { translated: 0, skipped: 0, failed: [] };

  async function translateAndMergeOne(obj, fieldMap, saveFn) {
    // fieldMap maps { sourceField: translationKey } — needed because the
    // store's own fields don't share the same names as their translation
    // JSON keys (aboutText vs about_text, etc.), unlike products/categories.
    const existing = (obj.translations && obj.translations[lang]) || {};
    const already = Object.entries(fieldMap).every(([src, key]) => !obj[src] || existing[key]);
    if (already) { results.skipped++; return; }
    try {
      const newTrans = { ...existing };
      for (const [src, key] of Object.entries(fieldMap)) {
        if (obj[src] && !existing[key]) newTrans[key] = await translateText(String(obj[src]).slice(0, 2000), lang);
      }
      await saveFn({ ...(obj.translations || {}), [lang]: newTrans });
      results.translated++;
    } catch (e) { results.failed.push({ id: obj.id, error: e.message }); }
  }

  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    if (scope === 'products') {
      const { data: products, error } = await client.from('products').select('id, name, description, translations').eq('tenant_id', tenant.id);
      if (error) return send(res, 500, { error: error.message });
      for (const p of products) await translateAndMergeOne(p, { name: 'name', description: 'description' }, (translations) => client.from('products').update({ translations }).eq('id', p.id));
    } else if (scope === 'categories') {
      const { data: categories, error } = await client.from('categories').select('id, name, description, translations').eq('tenant_id', tenant.id);
      if (error) return send(res, 500, { error: error.message });
      for (const c of categories) await translateAndMergeOne(c, { name: 'name', description: 'description' }, (translations) => client.from('categories').update({ translations }).eq('id', c.id));
    } else {
      const { data: t, error } = await client.from('tenants').select('id, name, tagline, about_text, translations').eq('id', tenant.id).maybeSingle();
      if (error) return send(res, 500, { error: error.message });
      await translateAndMergeOne({ id: t.id, name: t.name, tagline: t.tagline, aboutText: t.about_text, translations: t.translations }, { name: 'name', tagline: 'tagline', aboutText: 'aboutText' }, (translations) => client.from('tenants').update({ translations }).eq('id', t.id));
    }
    return send(res, 200, results);
  }

  if (scope === 'products') {
    for (const p of db.products.filter(x => x.tenantId === tenant.id)) await translateAndMergeOne(p, { name: 'name', description: 'description' }, async (translations) => { p.translations = translations; await persist(); });
  } else if (scope === 'categories') {
    for (const c of db.categories.filter(x => x.tenantId === tenant.id)) await translateAndMergeOne(c, { name: 'name', description: 'description' }, async (translations) => { c.translations = translations; await persist(); });
  } else {
    await translateAndMergeOne(tenant, { name: 'name', tagline: 'tagline', aboutText: 'aboutText' }, async (translations) => { tenant.translations = translations; await persist(); });
  }
  send(res, 200, results);
});

route('GET', '/api/products', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    let q = supabaseAnon.from('products').select('*, categories(*), product_images(*), download_products(*)').eq('tenant_id', tenant.id);
    if (query.get('category')) q = q.eq('category_id', query.get('category'));
    const { data, error } = await q;
    if (error) return send(res, 500, { error: error.message });
    let list = data.map(row => rowToProduct(row));
    // The meeting link is only for customers who've actually purchased this
    // product — it must never leak to anyone just browsing the storefront.
    list = list.map(p => { const { meetingLink, ...rest } = p; return rest; });
    if (query.get('group')) list = list.filter(p => p.category.group === query.get('group'));
    if (query.get('q')) { const s = query.get('q').toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)); }
    return send(res, 200, { products: list });
  }
  let list = db.products.filter(p => p.tenantId === tenant.id).map(p => { const { meetingLink, ...rest } = p; return { ...rest, category: findCategory(p.categoryId, tenant.id) }; });
  if (query.get('group')) list = list.filter(p => p.category.group === query.get('group'));
  if (query.get('category')) list = list.filter(p => p.categoryId === query.get('category'));
  if (query.get('q')) { const q = query.get('q').toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)); }
  send(res, 200, { products: list });
});

// Admin-authenticated equivalent of GET /api/products — used by the admin Products
// table and the product edit form. Unlike the public route above, this deliberately
// does NOT strip meetingLink: it's only ever reachable by an authenticated store
// admin viewing/editing their own store's own products, not by anonymous shoppers.
route('GET', '/api/admin/products', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('products').select('*, categories(*), product_images(*), download_products(*)').eq('tenant_id', tenant.id);
    if (error) return send(res, 500, { error: error.message });
    const list = data.map(row => rowToProduct(row));
    return send(res, 200, { products: list });
  }
  const list = db.products.filter(p => p.tenantId === tenant.id).map(p => ({ ...p, category: findCategory(p.categoryId, tenant.id) }));
  send(res, 200, { products: list });
});

route('GET', '/api/products/:id', { hostScope: 'tenant' }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const { data, error } = await supabaseAnon.from('products').select('*, categories(*), product_images(*), download_products(*)').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    if (!data) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
    const { meetingLink, ...publicProduct } = rowToProduct(data);
    return send(res, 200, { product: publicProduct });
  }
  const p = findProduct(params.id, tenant.id);
  if (!p) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
  const { meetingLink, ...publicP } = p;
  send(res, 200, { product: { ...publicP, category: findCategory(p.categoryId, tenant.id) } });
});

/* =========================================================
   CLIENT ROUTES — orders, checkout, downloads (tenant-scoped)
========================================================= */
route('POST', '/api/orders', { hostScope: 'tenant', auth: true, roles: ['client', 'admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (tenant.closedBySelf) return send(res, 403, { error: apiT('storeClosedNoOrders', reqLang(req)) });
  // Real enforcement, not just an alert email: a store whose subscription has
  // actually lapsed cannot process new sales until it's renewed. Previously
  // subscriptionExpiresAt was only ever read to decide when to send warning
  // emails — nothing anywhere actually blocked anything once it passed.
  if (AUTH_DRIVER === 'supabase') {
    const { data: sub } = await supabaseAdmin().from('current_subscriptions').select('expiry_date').eq('tenant_id', tenant.id).maybeSingle();
    if (sub && new Date(sub.expiry_date).getTime() < Date.now()) {
      return send(res, 403, { error: apiT('storeSubExpiredNoOrders', reqLang(req)) });
    }
  } else if (tenant.subscriptionExpiresAt && tenant.subscriptionExpiresAt < Date.now()) {
    return send(res, 403, { error: apiT('storeSubExpiredNoOrders', reqLang(req)) });
  }
  const { items, shippingAddress, card, deliveryMethod } = body;
  if (!Array.isArray(items) || items.length === 0) return send(res, 400, { error: apiT('cartEmpty', reqLang(req)) });
  const cardFormatError = validateFullCard(card, reqLang(req));
  if (cardFormatError) return send(res, 400, { error: cardFormatError });
  const cardDigits = (card && card.number || '').replace(/\s/g, '');
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
      if (category.fulfillment === 'download') {
        // A customer's own session correctly cannot see download_products via
        // RLS (it's admin-only, to keep storage paths private) — but that
        // means the customer-scoped query above can never confirm a file
        // exists either. This check is a legitimate system-level lookup, not
        // something the buyer's own permissions should gate, so it uses
        // service_role specifically for this one question: does a file exist?
        const { data: dp } = await supabaseAdmin().from('download_products').select('id').eq('product_id', line.productId).maybeSingle();
        if (!dp) return send(res, 400, { error: `"${p.name}" has no file attached and is not currently available for purchase. Please contact the store.` });
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
        return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
      }
    }
    const total = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);
    const now = Date.now();

    // Reserve stock atomically BEFORE creating the order — this is what actually
    // prevents overselling under concurrent orders, since each call below is one
    // guarded UPDATE in the database itself, not a separate read-then-write from
    // this server. If any item fails partway through, undo the ones that already
    // succeeded, and never create an order for a sale that couldn't be honored.
    const decremented = [];
    if (paymentSucceeded) {
      for (const r of resolved) {
        if (r.category.fulfillment === 'shipping' && typeof r.product.stock === 'number') {
          const { data: newStock, error: adjErr } = await client.rpc('adjust_product_stock', {
            p_product_id: r.product.id, p_tenant_id: tenant.id, p_change: -r.qty, p_reason: 'sale',
          });
          if (adjErr) {
            for (const undo of decremented) await client.rpc('adjust_product_stock', { p_product_id: undo.productId, p_tenant_id: tenant.id, p_change: undo.qty, p_reason: 'manual_adjustment' });
            return send(res, 500, { error: adjErr.message });
          }
          if (newStock === null) {
            for (const undo of decremented) await client.rpc('adjust_product_stock', { p_product_id: undo.productId, p_tenant_id: tenant.id, p_change: undo.qty, p_reason: 'manual_adjustment' });
            return send(res, 400, { error: `Only ${r.product.stock} unit(s) of "${r.product.name}" left in stock — someone else may have just purchased the rest. Please update your cart.` });
          }
          decremented.push({ productId: r.product.id, qty: r.qty });
        }
      }
    }

    const { data: orderRow, error: orderErr } = await client.from('orders').insert({
      tenant_id: tenant.id, client_id: user.id, payment_status: paymentSucceeded ? 'success' : 'failed',
      shipping_address: needsShipping && chosenDelivery === 'shipping' ? shippingAddress : null, total,
    }).select().maybeSingle();
    if (orderErr) {
      for (const undo of decremented) await client.rpc('adjust_product_stock', { p_product_id: undo.productId, p_tenant_id: tenant.id, p_change: undo.qty, p_reason: 'manual_adjustment' });
      return send(res, 400, { error: orderErr.message });
    }
    if (!orderRow) {
      for (const undo of decremented) await client.rpc('adjust_product_stock', { p_product_id: undo.productId, p_tenant_id: tenant.id, p_change: undo.qty, p_reason: 'manual_adjustment' });
      return send(res, 500, { error: apiT('orderCreationFailed', reqLang(req)) });
    }
    // Phase 1 payment abstraction: additively record this checkout in the
    // new, provider-independent payments table alongside the existing
    // orders.payment_status column (left completely untouched above).
    // Best-effort and non-blocking — this table isn't load-bearing yet,
    // so a failure here must never break the working checkout flow.
    try {
      await createPaymentRecord({
        supabaseAdminClient: supabaseAdmin(), tenantId: tenant.id, orderId: orderRow.id, clientId: user.id,
        method: 'simulated', status: paymentSucceeded ? 'paid' : 'failed', amount: total, currency: 'usd',
      });
    } catch (e) { console.error('[payments] failed to record Phase 1 payment row:', e.message); }
    const itemRows = resolved.map(r => {
      const base = {
        order_id: orderRow.id, tenant_id: tenant.id, product_id: r.product.id, name: r.product.name, sku: r.product.sku || null,
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
    // Note: order_id is now known, but the stock movements recorded above were
    // logged before this order existed, so they carry no order_id reference —
    // an acceptable tradeoff given atomicity of the stock check matters more
    // than that one cross-reference for this rare ordering constraint.

    const { data: fullOrder, error: fetchErr } = await client.from('orders').select('*, order_items(*, products(meeting_link))').eq('id', orderRow.id).maybeSingle();
    if (fetchErr) return send(res, 500, { error: fetchErr.message });
    if (!fullOrder) return send(res, 500, { error: apiT('orderCreatedNotRetrieved', reqLang(req)) });

    await client.from('order_status_history').insert({ tenant_id: tenant.id, order_id: orderRow.id, status: 'pending', changed_by: 'System' });

    if (paymentSucceeded) {
      const itemsList = resolved.map(r => `- ${r.product.name} × ${r.qty} ($${(r.product.price * r.qty).toFixed(2)})`).join('\n');
      const orderDate = new Date(now).toLocaleString();
      // Notify every admin at this store — a store can have more than one.
      // Uses supabaseAdmin() (service_role) deliberately: this checkout runs
      // under the CUSTOMER's own session, which correctly cannot see other
      // members' data via RLS — "who administers this store" is a system-level
      // lookup, not something the buyer's own permissions should gate.
      const { data: adminMemberships, error: adminMembershipsErr } = await supabaseAdmin().from('tenant_memberships').select('user_id').eq('tenant_id', tenant.id).eq('role', 'admin');
      if (adminMembershipsErr) console.error('[admin lookup for payment notice failed]', adminMembershipsErr.message);
      for (const m of adminMemberships || []) {
        try {
          const { data: authUser } = await supabaseAdmin().auth.admin.getUserById(m.user_id);
          if (authUser && authUser.user) {
            const adminLang = await getRecipientLang(authUser.user.email);
            const subject = emailT(EMAIL_I18N, 'paymentReceivedSubject', adminLang)(orderRow.id);
            const emailBody = emailT(EMAIL_I18N, 'paymentReceivedBody', adminLang)(orderRow.id, user.name, total.toFixed(2), orderDate, itemsList);
            await client.from('notifications').insert({ tenant_id: tenant.id, type: 'payment_received', to_email: authUser.user.email, subject, body: emailBody });
            await sendRealEmail({ to: authUser.user.email, subject, text: emailBody, html: wrapEmailHtml(emailBody, adminLang) }); // best-effort — never blocks or fails the order if email delivery itself has a problem
          }
        } catch { /* one admin's lookup failing shouldn't block notifying the others or the customer below */ }
      }
      const orderUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}/orders`;
      // Any booking-fulfillment item with a meeting link gets it listed
      // directly in the confirmation email — the client shouldn't have to
      // separately visit their order history just to find how to join.
      const meetingLinks = resolved.filter(r => r.category.fulfillment === 'booking' && r.product.meetingLink);
      const pendingMeetingItems = resolved.filter(r => r.category.fulfillment === 'booking' && !r.product.meetingLink);
      const orderLang = reqLang(req); // the customer checking out IS the recipient — their own current session language is the correct, simplest source here
      const confirmSubject = emailT(EMAIL_I18N, 'orderConfirmationSubject', orderLang)(tenant.name, orderRow.id);
      const confirmBody = emailT(EMAIL_I18N, 'orderConfirmationBody', orderLang)({
        customerName: user.name, customerEmail: user.email, orderId: orderRow.id, date: orderDate, total: total.toFixed(2),
        itemsList, meetingLinks: meetingLinks.map(r => ({ name: r.product.name, link: r.product.meetingLink })),
        pendingMeetingItems: pendingMeetingItems.map(r => r.product.name), hasDownload: resolved.some(r => r.category.fulfillment === 'download'),
        orderUrl, storeName: tenant.name,
      });
      await client.from('notifications').insert({ tenant_id: tenant.id, type: 'order_confirmation', to_email: user.email, subject: confirmSubject, body: confirmBody });
      await sendRealEmail({ to: user.email, subject: confirmSubject, text: confirmBody, html: wrapEmailHtml(confirmBody, orderLang) }); // best-effort — the notifications row above is the record of truth; email delivery failing must not fail the order
    }

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
    if (category.fulfillment === 'download' && !(db.downloadProducts || []).some(d => d.productId === p.id)) {
      return send(res, 400, { error: `"${p.name}" has no file attached and is not currently available for purchase. Please contact the store.` });
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
      return send(res, 400, { error: apiT('shippingAddressRequired', reqLang(req)) });
    }
  }
  const total = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);
  const now = Date.now();
  const orderId = newId('ord');
  const orderItems = resolved.map(r => {
    const base = { productId: r.product.id, name: r.product.name, sku: r.product.sku || null, translations: r.product.translations || {}, price: r.product.price, qty: r.qty, categoryId: r.category.id, categoryName: r.category.name, fulfillment: r.category.fulfillment, refundRequested: false, refundStatus: 'none', refundRequestReason: null, refundRequestedAt: null, refundDecisionBy: null, refundDecisionAt: null, refundDecisionReason: null, refundPaymentLast4: null };
    if (!paymentSucceeded) return { ...base, status: 'payment_failed' };
    // Physical stock is only committed once payment has actually succeeded.
    if (r.category.fulfillment === 'shipping' && typeof r.product.stock === 'number') {
      r.product.stock -= r.qty;
      db.stockMovements.push({ id: newId('stkmv'), tenantId: tenant.id, productId: r.product.id, change: -r.qty, reason: 'sale', orderId, createdBy: null, createdAt: now });
    }
    if (r.category.fulfillment === 'download') {
      const windowHours = r.category.downloadWindowHours || 72, maxDownloads = r.category.maxDownloads || 1;
      return { ...base, status: 'ready', downloadToken: newId('dl'), downloadExpiresAt: now + windowHours * 3600 * 1000, downloadWindowHours: windowHours, downloadsUsed: 0, maxDownloads };
    }
    if (r.category.fulfillment === 'shipping') return { ...base, status: 'pending', deliveryMethod: chosenDelivery, trackingNote: '', customerConfirmedAt: null, customerReportedProblem: false, customerProblemNote: null, customerProblemReportedAt: null, deliveredAt: null, deliveryReminderSentAt: null };
    if (r.category.fulfillment === 'booking') return { ...base, status: 'requested', scheduledAt: null, assignedEmployee: null, meetingLink: r.product.meetingLink || null };
    return { ...base, status: 'pending' };
  });
  const order = { id: orderId, tenantId: tenant.id, clientId: user.id, clientName: user.name, clientEmail: user.email, items: orderItems, total, paymentStatus: paymentSucceeded ? 'success' : 'failed', status: 'pending', shippingAddress: needsShipping && chosenDelivery === 'shipping' ? shippingAddress : null, createdAt: now };
  db.orderStatusHistory.push({ id: newId('osh'), tenantId: tenant.id, orderId, status: 'pending', changedBy: 'System', changedAt: now });
  if (paymentSucceeded) {
    const itemsList = resolved.map(r => `- ${r.product.name} × ${r.qty} ($${(r.product.price * r.qty).toFixed(2)})`).join('\n');
    const orderDate = new Date(now).toLocaleString();
    for (const admin of db.users.filter(u => u.tenantId === tenant.id && u.role === 'admin')) {
      const adminLang = await getRecipientLang(admin.email);
      const subject = emailT(EMAIL_I18N, 'paymentReceivedSubject', adminLang)(orderId);
      const emailBody = emailT(EMAIL_I18N, 'paymentReceivedBody', adminLang)(orderId, user.name, total.toFixed(2), orderDate, itemsList);
      db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'payment_received', to: admin.email, subject, body: emailBody, sentAt: now });
      await sendRealEmail({ to: admin.email, subject, text: emailBody, html: wrapEmailHtml(emailBody, adminLang) });
    }
    const orderUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}/orders`;
    const hasDigitalItem = resolved.some(r => r.category.fulfillment === 'download');
    const meetingLinks = resolved.filter(r => r.category.fulfillment === 'booking' && r.product.meetingLink);
    const pendingMeetingItems = resolved.filter(r => r.category.fulfillment === 'booking' && !r.product.meetingLink);
    const orderLang = reqLang(req); // the customer checking out IS the recipient — their own current session language is the correct, simplest source here
    const confirmSubject = emailT(EMAIL_I18N, 'orderConfirmationSubject', orderLang)(tenant.name, orderId);
    const confirmBody = emailT(EMAIL_I18N, 'orderConfirmationBody', orderLang)({
      customerName: user.name, customerEmail: user.email, orderId, date: orderDate, total: total.toFixed(2),
      itemsList, meetingLinks: meetingLinks.map(r => ({ name: r.product.name, link: r.product.meetingLink })),
      pendingMeetingItems: pendingMeetingItems.map(r => r.product.name), hasDownload: hasDigitalItem,
      orderUrl, storeName: tenant.name,
    });
    db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'order_confirmation', to: user.email, subject: confirmSubject, body: confirmBody, sentAt: now });
    try { await sendRealEmail({ to: user.email, subject: confirmSubject, text: confirmBody, html: wrapEmailHtml(confirmBody, orderLang) }); } catch { /* best-effort — the notifications row above is the record of truth */ }
  }
  db.orders.push(order);
  try {
    await createPaymentRecord({
      db, supabaseAdminClient: null, tenantId: tenant.id, orderId: order.id, clientId: user.id,
      method: 'simulated', status: paymentSucceeded ? 'paid' : 'failed', amount: total, currency: 'usd',
    });
  } catch (e) { console.error('[payments] failed to record Phase 1 payment row:', e.message); }
  await persist();
  send(res, paymentSucceeded ? 201 : 402, { order: orderForClient(order) });
});

route('GET', '/api/orders/mine', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('orders').select('*, order_items(*, products(meeting_link))').eq('tenant_id', tenant.id).eq('client_id', user.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { orders: data.map(orderRowForClient) });
  }
  const mine = db.orders.filter(o => o.tenantId === tenant.id && o.clientId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  const mineWithLinks = mine.map(o => ({ ...o, items: o.items.map(i => ({ ...i, meetingLink: (db.products.find(p => p.id === i.productId) || {}).meetingLink || null })) }));
  send(res, 200, { orders: mineWithLinks.map(orderForClient) });
});

// Customer delivery confirmation — deliberately separate from the staff
// "delivered" status set via the Fulfillment Queue. This is the client's
// own confirmation, never overwritten by or overwriting the staff status.
route('POST', '/api/orders/:orderId/items/:productId/confirm-receipt', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('id, client_id').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order || order.client_id !== user.id) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    const { data: item, error: itemErr } = await client.from('order_items').select('id, status, fulfillment, customer_confirmed_at').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (itemErr) return send(res, 500, { error: itemErr.message });
    if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
    if (item.fulfillment !== 'shipping') return send(res, 400, { error: apiT('deliveryConfirmShippedOnly', reqLang(req)) });
    if (item.status !== 'delivered') return send(res, 400, { error: apiT('itemNotMarkedDelivered', reqLang(req)) });
    if (item.customer_confirmed_at) return send(res, 400, { error: apiT('alreadyConfirmedReceipt1', reqLang(req)) });
    const { error: updateErr } = await client.from('order_items').update({ customer_confirmed_at: new Date().toISOString() }).eq('id', item.id);
    if (updateErr) return send(res, 500, { error: updateErr.message });
    return send(res, 200, { ok: true });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order || order.clientId !== user.id) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
  if (item.fulfillment !== 'shipping') return send(res, 400, { error: apiT('deliveryConfirmShippedOnly', reqLang(req)) });
  if (item.status !== 'delivered') return send(res, 400, { error: apiT('itemNotMarkedDelivered', reqLang(req)) });
  if (item.customerConfirmedAt) return send(res, 400, { error: apiT('alreadyConfirmedReceipt1', reqLang(req)) });
  item.customerConfirmedAt = Date.now();
  await persist();
  send(res, 200, { ok: true });
});
route('POST', '/api/orders/:orderId/items/:productId/report-problem', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  const note = (body.note || '').trim();
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('id, client_id').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order || order.client_id !== user.id) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    const { data: item, error: itemErr } = await client.from('order_items').select('id, name, status, fulfillment, customer_confirmed_at').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (itemErr) return send(res, 500, { error: itemErr.message });
    if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
    if (item.fulfillment !== 'shipping') return send(res, 400, { error: apiT('onlyAppliesToShipped', reqLang(req)) });
    if (item.customer_confirmed_at) return send(res, 400, { error: apiT('alreadyConfirmedReceipt2', reqLang(req)) });
    const { error: updateErr } = await client.from('order_items').update({ customer_reported_problem: true, customer_problem_note: note, customer_problem_reported_at: new Date().toISOString() }).eq('id', item.id);
    if (updateErr) return send(res, 500, { error: updateErr.message });
    // Best-effort admin notification — a delivery dispute is exactly the
    // kind of thing staff should see promptly, not discover by chance.
    try {
      const { data: admins } = await client.from('tenant_memberships').select('user_id').eq('tenant_id', tenant.id).eq('role', 'admin');
      const admin = supabaseAdmin();
      for (const a of (admins || [])) {
        const { data: adminUser } = await admin.auth.admin.getUserById(a.user_id);
        if (adminUser && adminUser.user) {
          const problemLang = await getRecipientLang(adminUser.user.email);
          const subject = emailT(EMAIL_I18N, 'deliveryProblemSubject', problemLang)(tenant.name);
          const text = emailT(EMAIL_I18N, 'deliveryProblemBody', problemLang)(params.orderId, item.name, note);
          await client.from('notifications').insert({ tenant_id: tenant.id, type: 'delivery_problem_reported', to_email: adminUser.user.email, subject, body: text });
          await sendRealEmail({ to: adminUser.user.email, subject, text, html: wrapEmailHtml(text, problemLang) });
        }
      }
    } catch (e) { console.error('[report-problem] admin notify failed:', e.message); }
    return send(res, 200, { ok: true });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order || order.clientId !== user.id) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
  if (item.fulfillment !== 'shipping') return send(res, 400, { error: apiT('onlyAppliesToShipped', reqLang(req)) });
  if (item.customerConfirmedAt) return send(res, 400, { error: apiT('alreadyConfirmedReceipt2', reqLang(req)) });
  item.customerReportedProblem = true;
  item.customerProblemNote = note;
  item.customerProblemReportedAt = Date.now();
  await persist();
  send(res, 200, { ok: true });
});

/** A client can request a refund but cannot grant it — that stays a staff action (see /api/employee/.../refund). This just flags the item for staff attention. */
/** Notifies every admin/employee at a tenant the moment a customer requests a refund — so the request can never be missed by only checking the database manually. */
/** Notifies store staff (admin + employee) whenever a customer submits the store's own Contact form — added so this is discoverable proactively rather than only by staff remembering to check the Support Messages dashboard. */
async function notifyStaffOfNewContactMessage(tenant, { customerName, customerEmail, subject, message }) {
  try {
    if (AUTH_DRIVER === 'supabase') {
      const admin = supabaseAdmin();
      const { data: staff } = await admin.from('tenant_memberships').select('user_id').eq('tenant_id', tenant.id).in('role', ['admin', 'employee']);
      for (const s of (staff || [])) {
        const { data: staffUser } = await admin.auth.admin.getUserById(s.user_id);
        if (staffUser && staffUser.user) {
          const staffLang = await getRecipientLang(staffUser.user.email);
          const emailSubject = emailT(EMAIL_I18N, 'storeContactReceivedSubject', staffLang)(subject);
          const text = emailT(EMAIL_I18N, 'storeContactReceivedBody', staffLang)(customerName, customerEmail, subject, message);
          await admin.from('notifications').insert({ tenant_id: tenant.id, type: 'contact_message_received', to_email: staffUser.user.email, subject: emailSubject, body: text });
          await sendRealEmail({ to: staffUser.user.email, subject: emailSubject, text, html: wrapEmailHtml(text, staffLang) });
        }
      }
    } else {
      const staff = db.users.filter(u => u.tenantId === tenant.id && (u.role === 'admin' || u.role === 'employee'));
      for (const s of staff) {
        const staffLang = await getRecipientLang(s.email);
        const emailSubject = emailT(EMAIL_I18N, 'storeContactReceivedSubject', staffLang)(subject);
        const text = emailT(EMAIL_I18N, 'storeContactReceivedBody', staffLang)(customerName, customerEmail, subject, message);
        db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'contact_message_received', to: s.email, subject: emailSubject, body: text, sentAt: Date.now() });
        try { await sendRealEmail({ to: s.email, subject: emailSubject, text, html: wrapEmailHtml(text, staffLang) }); } catch { /* best-effort — this must never fail the customer's submission */ }
      }
    }
  } catch (e) { console.error('[contact-message-notify] failed:', e.message); }
}
async function notifyStaffOfRefundRequest(tenant, { orderId, itemName, customerEmail, reason }) {
  const requestedAt = new Date().toLocaleString();
  try {
    if (AUTH_DRIVER === 'supabase') {
      const admin = supabaseAdmin();
      const { data: staff } = await admin.from('tenant_memberships').select('user_id').eq('tenant_id', tenant.id).in('role', ['admin', 'employee']);
      for (const s of (staff || [])) {
        const { data: staffUser } = await admin.auth.admin.getUserById(s.user_id);
        if (staffUser && staffUser.user) {
          const staffLang = await getRecipientLang(staffUser.user.email);
          const subject = emailT(EMAIL_I18N, 'refundRequestedSubject', staffLang)(itemName);
          const text = emailT(EMAIL_I18N, 'refundRequestedBody', staffLang)(orderId, itemName, customerEmail, reason, requestedAt);
          await admin.from('notifications').insert({ tenant_id: tenant.id, type: 'refund_requested', to_email: staffUser.user.email, subject, body: text });
          await sendRealEmail({ to: staffUser.user.email, subject, text, html: wrapEmailHtml(text, staffLang) });
        }
      }
    } else {
      const staff = db.users.filter(u => u.tenantId === tenant.id && (u.role === 'admin' || u.role === 'employee'));
      for (const s of staff) {
        const staffLang = await getRecipientLang(s.email);
        const subject = emailT(EMAIL_I18N, 'refundRequestedSubject', staffLang)(itemName);
        const text = emailT(EMAIL_I18N, 'refundRequestedBody', staffLang)(orderId, itemName, customerEmail, reason, requestedAt);
        db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'refund_requested', to: s.email, subject, body: text, sentAt: Date.now() });
        try { await sendRealEmail({ to: s.email, subject, text, html: wrapEmailHtml(text, staffLang) }); } catch { /* best-effort */ }
      }
    }
  } catch (e) { console.error('[refund-notify] failed to notify staff:', e.message); }
}

route('POST', '/api/orders/:orderId/items/:productId/request-refund', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  const reason = (body.reason || '').slice(0, 500);
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('client_id').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    if (order.client_id !== user.id) return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
    const { data: item, error: findErr } = await client.from('order_items').select('status, fulfillment, first_downloaded_at, name, refund_status').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
    if (item.status === 'refunded') return send(res, 409, { error: apiT('itemAlreadyRefunded', reqLang(req)) });
    if (item.refund_status === 'requested' || item.refund_status === 'approved') return send(res, 409, { error: apiT('refundRequestInProgress', reqLang(req)) });
    if (item.fulfillment === 'download' && item.first_downloaded_at) {
      return send(res, 409, { error: `This digital product was already downloaded on ${new Date(item.first_downloaded_at).toLocaleString()} and can no longer be refunded.` });
    }
    const { data: updated, error: updateErr } = await client.from('order_items').update({
      refund_requested: true, refund_status: 'requested', refund_request_reason: reason, refund_requested_at: new Date().toISOString(),
    }).eq('order_id', params.orderId).eq('product_id', params.productId).select().maybeSingle();
    if (updateErr) return send(res, 400, { error: updateErr.message });
    if (!updated) return send(res, 500, { error: apiT('refundRequestFailed', reqLang(req)) });
    notifyStaffOfRefundRequest(tenant, { orderId: params.orderId, itemName: updated.name, customerEmail: user.email, reason });
    return send(res, 200, { item: orderItemRowToItem(updated) });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  if (order.clientId !== user.id) return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
  if (item.status === 'refunded') return send(res, 409, { error: apiT('itemAlreadyRefunded', reqLang(req)) });
  if (item.refundStatus === 'requested' || item.refundStatus === 'approved') return send(res, 409, { error: apiT('refundRequestInProgress', reqLang(req)) });
  if (item.fulfillment === 'download' && item.firstDownloadedAt) {
    return send(res, 409, { error: `This digital product was already downloaded on ${new Date(item.firstDownloadedAt).toLocaleString()} and can no longer be refunded.` });
  }
  item.refundRequested = true;
  item.refundStatus = 'requested';
  item.refundRequestReason = reason;
  item.refundRequestedAt = Date.now();
  await persist();
  notifyStaffOfRefundRequest(tenant, { orderId: params.orderId, itemName: item.name, customerEmail: user.email, reason });
  send(res, 200, { item });
});

route('GET', '/api/admin/products/:id/digital-file/verify-download', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    // Step 1: metadata must exist in download_products.
    const { data: dp, error: findErr } = await client.from('download_products').select('storage_path, original_filename').eq('product_id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!dp) return send(res, 404, { error: apiT('verifyFailedNoMetadataDownload', reqLang(req)) });
    // Step 2: the object must genuinely exist in Storage — this catches the
    // metadata and the actual file having drifted apart (e.g. deleted
    // directly in the Supabase dashboard without going through the app).
    const admin = supabaseAdmin();
    const dirPath = dp.storage_path.substring(0, dp.storage_path.lastIndexOf('/'));
    const bareName = dp.storage_path.substring(dp.storage_path.lastIndexOf('/') + 1);
    const { data: listing, error: listErr } = await admin.storage.from('digital-files').list(dirPath, { search: bareName });
    if (listErr || !listing || !listing.some(f => f.name === bareName)) {
      return send(res, 404, { error: apiT('verifyFailedFileMissingStorage', reqLang(req)) });
    }
    // Step 3: serve it through the exact same signed-URL mechanism a paying
    // customer's download goes through — this is not a separate code path.
    const { data: signed, error: signErr } = await admin.storage.from('digital-files').createSignedUrl(dp.storage_path, 300, { download: dp.original_filename });
    if (signErr) return send(res, 500, { error: `The file could not be retrieved: ${signErr.message}` });
    res.writeHead(302, { Location: signed.signedUrl, ...SECURITY_HEADERS });
    return res.end();
  }
  const dp = (db.downloadProducts || []).find(d => d.productId === params.id && d.tenantId === tenant.id);
  if (!dp) return send(res, 404, { error: apiT('verifyFailedNoMetadata', reqLang(req)) });
  const filePath = path.join(UPLOADS_DIR, tenant.id, 'digital', dp.diskFilename);
  if (!fs.existsSync(filePath)) return send(res, 404, { error: apiT('verifyFailedFileMissing', reqLang(req)) });
  try {
    const fileBuffer = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': dp.mimeType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${dp.filename}"`, 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
    return res.end(fileBuffer);
  } catch (e) { return send(res, 500, { error: `The file could not be read: ${e.message}` }); }
});

route('GET', '/api/downloads/:orderId/:productId/info', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('id, client_id').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    if (order.client_id !== user.id && user.role === 'client') return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
    const { data: itemRow } = await client.from('order_items').select('product_id, fulfillment').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (!itemRow || itemRow.fulfillment !== 'download') return send(res, 404, { error: apiT('noDownloadableItem', reqLang(req)) });
    const { data: dp } = await supabaseAdmin().from('download_products').select('is_compressed, extension, original_filename').eq('product_id', params.productId).maybeSingle();
    return send(res, 200, dp ? { isCompressed: dp.is_compressed, extension: dp.extension, filename: dp.original_filename } : { isCompressed: false, extension: null, filename: null });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  if (order.clientId !== user.id && user.role === 'client') return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item || item.fulfillment !== 'download') return send(res, 404, { error: apiT('noDownloadableItem', reqLang(req)) });
  const dp = (db.downloadProducts || []).find(d => d.productId === params.productId && d.tenantId === tenant.id);
  send(res, 200, dp ? { isCompressed: !!dp.isCompressed, extension: dp.extension, filename: dp.filename } : { isCompressed: false, extension: null, filename: null });
});

route('GET', '/api/downloads/:orderId/:productId/image', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('client_id, payment_status').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    if (order.client_id !== user.id && user.role === 'client') return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
    if (order.payment_status !== 'success') return send(res, 402, { error: apiT('paymentNotSuccessful', reqLang(req)) });
    const { data: itemRow } = await client.from('order_items').select('*').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (!itemRow || itemRow.fulfillment !== 'download') return send(res, 404, { error: apiT('noDownloadableItem', reqLang(req)) });
    // Governed by the exact same download-count policy as the file itself,
    // but tracked with its own independent counter — each asset gets its own
    // allowance rather than the two sharing a single budget.
    if (itemRow.status === 'refunded') return send(res, 410, { error: apiT('itemRefundedNoDownload', reqLang(req)) });
    if (itemRow.image_download_used_count >= itemRow.max_downloads) return send(res, 410, { error: apiT('imageMaxDownloads', reqLang(req)) });

    const { data: images } = await supabaseAdmin().from('product_images').select('storage_path, filename').eq('product_id', params.productId).order('uploaded_at', { ascending: true }).limit(1);
    const image = images && images[0];
    if (!image) return send(res, 404, { error: apiT('productHasNoImage', reqLang(req)) });
    const { data: signed, error: signErr } = await supabaseAdmin().storage.from('product-images').createSignedUrl(image.storage_path, 300, { download: image.filename });
    if (signErr) return send(res, 500, { error: `The image could not be retrieved: ${signErr.message}` });
    const { error: updErr } = await client.from('order_items').update({ image_download_used_count: itemRow.image_download_used_count + 1 }).eq('order_id', params.orderId).eq('product_id', params.productId);
    if (updErr) return send(res, 500, { error: updErr.message });
    res.writeHead(302, { Location: signed.signedUrl, ...SECURITY_HEADERS });
    return res.end();
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  if (order.clientId !== user.id && user.role === 'client') return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
  if (order.paymentStatus !== 'success') return send(res, 402, { error: apiT('paymentNotSuccessful', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item || item.fulfillment !== 'download') return send(res, 404, { error: apiT('noDownloadableItem', reqLang(req)) });
  if (item.status === 'refunded') return send(res, 410, { error: apiT('itemRefundedNoDownload', reqLang(req)) });
  item.imageDownloadsUsed = item.imageDownloadsUsed || 0;
  if (item.imageDownloadsUsed >= item.maxDownloads) return send(res, 410, { error: apiT('imageMaxDownloads', reqLang(req)) });
  const product = findProduct(params.productId, tenant.id);
  const image = product && product.images && product.images[0];
  if (!image) return send(res, 404, { error: apiT('productHasNoImage', reqLang(req)) });
  try {
    const imageBuffer = fs.readFileSync(path.join(UPLOADS_DIR, tenant.id, path.basename(image.url)));
    item.imageDownloadsUsed += 1;
    await persist();
    res.writeHead(200, { 'Content-Type': image.mimeType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${image.filename}"`, 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
    return res.end(imageBuffer);
  } catch (e) { return send(res, 500, { error: `The image could not be read: ${e.message}` }); }
});

route('GET', '/api/downloads/:orderId/:productId', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('*').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    if (order.client_id !== user.id && user.role === 'client') return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
    const { data: itemRow, error: itemErr } = await client.from('order_items').select('*').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (itemErr) return send(res, 500, { error: itemErr.message });
    if (!itemRow || itemRow.fulfillment !== 'download') return send(res, 404, { error: apiT('noDownloadableItem', reqLang(req)) });
    const item = orderItemRowToItem(itemRow);
    refreshItemStatus(item);
    if (order.payment_status !== 'success') return send(res, 402, { error: apiT('paymentNotSuccessful', reqLang(req)) });
    if (item.status === 'refunded') return send(res, 410, { error: apiT('itemRefundedNoDownload', reqLang(req)) });
    if (item.status === 'expired') return send(res, 410, { error: `This download link expired ${item.downloadWindowHours} hours after purchase.` });
    if (item.downloadsUsed >= item.maxDownloads) return send(res, 410, { error: apiT('fileMaxDownloads', reqLang(req)) });
    const newCount = item.downloadsUsed + 1;
    const newStatus = newCount >= item.maxDownloads ? 'downloaded' : 'ready';
    const updatePayload = { download_used_count: newCount, status: newStatus };
    if (!itemRow.first_downloaded_at) updatePayload.first_downloaded_at = new Date().toISOString(); // only ever set once — this is what "was it ever accessed" checks against, not the running count
    const { error: updErr } = await client.from('order_items').update(updatePayload).eq('order_id', params.orderId).eq('product_id', params.productId);
    if (updErr) return send(res, 500, { error: updErr.message });

    const { data: downloadProduct } = await supabaseAdmin().from('download_products').select('storage_path, original_filename, mime_type').eq('product_id', params.productId).maybeSingle();
    if (downloadProduct) {
      // A short-lived signed URL, not a buffered response — this is what keeps
      // large-file downloads memory-safe on our end too: the customer's
      // browser fetches the bytes directly from Supabase Storage, this
      // server never holds them at all. The `download` option tells Supabase
      // to set the Content-Disposition itself, preserving the exact original
      // filename and extension the admin uploaded. If the admin uploaded
      // their own pre-made zip (containing both the product and its cover
      // image), that zip IS this file — nothing is assembled or altered
      // here, it's delivered byte-for-byte exactly as uploaded.
      const { data: signed, error: signErr } = await supabaseAdmin().storage.from('digital-files')
        .createSignedUrl(downloadProduct.storage_path, 300, { download: downloadProduct.original_filename });
      if (signErr) return send(res, 500, { error: `The file could not be retrieved: ${signErr.message}` });
      res.writeHead(302, { Location: signed.signedUrl, ...SECURITY_HEADERS });
      return res.end();
    }
    const profile = await authSupabase.getProfile(bearerToken(req));
    const content = `HADAM — DIGITAL DELIVERY\nStore: ${tenant.name}\nProduct: ${item.name}\nLicensed to: ${profile.full_name || user.email} (${user.email})\nOrder: ${order.id}\nDelivered: ${new Date().toISOString()}\nDownload window: ${item.downloadWindowHours} hours from purchase, ${item.maxDownloads} download(s) allowed.\nDownloads used: ${newCount} of ${item.maxDownloads}\n\nNo file has been uploaded for this product yet — this is a placeholder standing in for "${item.name}".`;
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': `attachment; filename="${item.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.txt"`, 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
    return res.end(content);
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  if (order.clientId !== user.id && user.role === 'client') return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item || item.fulfillment !== 'download') return send(res, 404, { error: apiT('noDownloadableItem', reqLang(req)) });
  refreshItemStatus(item);
  if (order.paymentStatus !== 'success') return send(res, 402, { error: apiT('paymentNotSuccessful', reqLang(req)) });
  if (item.status === 'refunded') return send(res, 410, { error: apiT('itemRefundedNoDownload', reqLang(req)) });
  if (item.status === 'expired') return send(res, 410, { error: `This download link expired ${item.downloadWindowHours} hours after purchase.` });
  if (item.downloadsUsed >= item.maxDownloads) return send(res, 410, { error: apiT('fileMaxDownloads', reqLang(req)) });
  if (!item.firstDownloadedAt) item.firstDownloadedAt = Date.now(); // only ever set once
  item.downloadsUsed += 1;
  item.status = item.downloadsUsed >= item.maxDownloads ? 'downloaded' : 'ready';
  await persist();

  const downloadProduct = (db.downloadProducts || []).find(d => d.productId === item.productId && d.tenantId === tenant.id);
  if (downloadProduct) {
    const filePath = path.join(UPLOADS_DIR, tenant.id, 'digital', downloadProduct.diskFilename);
    try {
      const fileBuffer = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': downloadProduct.mimeType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${downloadProduct.filename}"`, 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
      return res.end(fileBuffer);
    } catch (e) { return send(res, 500, { error: `The file could not be read: ${e.message}` }); }
  }
  const content = `HADAM — DIGITAL DELIVERY\nStore: ${tenant.name}\nProduct: ${item.name}\nLicensed to: ${order.clientName} (${order.clientEmail})\nOrder: ${order.id}\nDelivered: ${new Date().toISOString()}\nDownload window: ${item.downloadWindowHours} hours from purchase, ${item.maxDownloads} download(s) allowed.\nDownloads used: ${item.downloadsUsed} of ${item.maxDownloads}\n\nNo file has been uploaded for this product yet — this is a placeholder standing in for "${item.name}".`;
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
  if (!subject || !message) return send(res, 400, { error: apiT('subjectMessageRequired', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('support_messages').insert({
      tenant_id: tenant.id, client_id: user.id, subject: subject.slice(0, 200), message: message.slice(0, 2000), status: 'open',
    }).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    if (!data) return send(res, 500, { error: apiT('messageCouldNotSend', reqLang(req)) });
    notifyStaffOfNewContactMessage(tenant, { customerName: user.name, customerEmail: user.email, subject, message: message.slice(0, 2000) });
    return send(res, 201, { message: supportMsgRowToMsg(data, user.name, user.email) });
  }
  const msg = { id: newId('msg'), tenantId: tenant.id, clientId: user.id, clientName: user.name, clientEmail: user.email, subject: subject.slice(0, 200), message: message.slice(0, 2000), reply: null, status: 'open', createdAt: Date.now() };
  db.messages.push(msg);
  await persist();
  notifyStaffOfNewContactMessage(tenant, { customerName: user.name, customerEmail: user.email, subject: msg.subject, message: msg.message });
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
    // Uses the admin/service-role connection, not the caller's own restricted
    // client — access here is already authorized by this route's own
    // roles: ['employee','admin'] check, and shouldn't also be silently
    // filtered by RLS policies written for the customer-facing
    // /api/support/messages/mine route (which correctly restricts a
    // customer to only their own messages). Using the caller's own client
    // here would mean staff quietly see an incomplete or empty list instead
    // of every message for their store — the same class of bug already
    // found and fixed in the meeting-link-notify lookup and the employee
    // order-item PATCH endpoint.
    const admin = supabaseAdmin();
    const { data, error } = await admin.from('support_messages').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false });
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

/** Notifies the client by email when staff reply to their support message — inline,
 * self-contained i18n (not lib/email.js's EMAIL_I18N) since this is a standalone
 * notification. Deliberately includes ONLY this client's own subject/message/reply —
 * never staff identity, other customers' messages, or any other tenant's data. */
async function notifyClientOfSupportReply(tenant, { clientEmail, clientLang, subject, reply }) {
  if (!clientEmail) return;
  const lang = clientLang || 'en';
  const T = {
    en: { subject: (s) => `Re: ${s}`, body: (s, r, t) => `${t} has replied to your message "${s}":\n\n${r}\n\nSign in to view the full conversation and reply.` },
    ar: { subject: (s) => `رد: ${s}`, body: (s, r, t) => `رد ${t} على رسالتك "${s}":\n\n${r}\n\nسجّل الدخول لعرض المحادثة كاملة والرد.` },
    fr: { subject: (s) => `Re : ${s}`, body: (s, r, t) => `${t} a répondu à votre message « ${s} » :\n\n${r}\n\nConnectez-vous pour voir la conversation complète et répondre.` },
  };
  const pack = T[lang] || T.en;
  const emailSubject = pack.subject(subject);
  const text = pack.body(subject, reply, tenant.name);
  try {
    await sendRealEmail({ to: clientEmail, subject: emailSubject, text, html: wrapEmailHtml(text, lang) });
  } catch (e) { console.error('[support-reply-notify] failed:', e.message); }
}

route('PATCH', '/api/employee/support/:id', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    // Same fix as the GET route above, for the same reason: this is a
    // staff-only write already authorized by roles: ['employee','admin'],
    // and must not be additionally (and silently) blocked by RLS policies
    // meant for the customer-facing message routes.
    const admin = supabaseAdmin();
    const { data: existing, error: findErr } = await admin.from('support_messages').select('client_id').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: apiT('messageNotFound', reqLang(req)) });
    const patch = {};
    if (typeof body.reply === 'string') { patch.reply = body.reply.slice(0, 2000); patch.replied_by = user.name; patch.replied_at = new Date().toISOString(); }
    if (body.status && ['open', 'resolved'].includes(body.status)) patch.status = body.status;
    const { data: updated, error: updErr } = await admin.from('support_messages').update(patch).eq('id', params.id).select().maybeSingle();
    if (updErr) return send(res, 400, { error: updErr.message });
    if (!updated) return send(res, 404, { error: apiT('messageNotFound', reqLang(req)) });
    let clientName = updated.client_id, clientEmail = '';
    try {
      const { data: authUser, error: adminErr } = await supabaseAdmin().auth.admin.getUserById(updated.client_id);
      if (adminErr) throw adminErr;
      clientName = authUser.user.user_metadata?.full_name || authUser.user.email;
      clientEmail = authUser.user.email;
    } catch { /* fall back to defaults above if the lookup fails */ }
    if (typeof body.reply === 'string' && body.reply.trim()) {
      const clientLang = await getRecipientLang(clientEmail);
      notifyClientOfSupportReply(tenant, { clientEmail, clientLang, subject: updated.subject, reply: patch.reply });
    }
    return send(res, 200, { message: supportMsgRowToMsg(updated, clientName, clientEmail) });
  }
  const msg = db.messages.find(m => m.id === params.id && m.tenantId === tenant.id);
  if (!msg) return send(res, 404, { error: apiT('messageNotFound', reqLang(req)) });
  if (typeof body.reply === 'string') { msg.reply = body.reply.slice(0, 2000); msg.repliedBy = user.name; msg.repliedAt = Date.now(); }
  if (body.status && ['open', 'resolved'].includes(body.status)) msg.status = body.status;
  await persist();
  if (typeof body.reply === 'string' && body.reply.trim()) {
    const clientLang = await getRecipientLang(msg.clientEmail);
    notifyClientOfSupportReply(tenant, { clientEmail: msg.clientEmail, clientLang, subject: msg.subject, reply: msg.reply });
  }
  send(res, 200, { message: msg });
});

/* =========================================================
   EMPLOYEE ROUTES (tenant-scoped)
========================================================= */
// Tracking Workflow Diagnostic — a built-in, no-SQL-needed way for staff to
// verify and troubleshoot the delivery tracking flow themselves. Two parts:
// (1) a plain state inspector showing exactly what's stored right now, and
// (2) a self-test that actually exercises the real write→read loop through
// the same code paths the UI itself uses, rather than trusting that things
// "should" work.
route('GET', '/api/admin/orders/:orderId/items/:productId/diagnostic', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  let item;
  if (AUTH_DRIVER === 'supabase') {
    const admin = supabaseAdmin();
    const { data, error } = await admin.from('order_items').select('*').eq('order_id', params.orderId).eq('tenant_id', tenant.id).eq('product_id', params.productId).maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    item = data && orderItemRowToItem(data);
  } else {
    const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
    item = order && order.items.find(i => i.productId === params.productId);
  }
  if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
  send(res, 200, {
    diagnostic: {
      productName: item.name, fulfillment: item.fulfillment,
      staffStatus: item.status, trackingNote: item.trackingNote || null, deliveredAt: item.deliveredAt || null,
      customerConfirmedAt: item.customerConfirmedAt || null,
      customerReportedProblem: item.customerReportedProblem || false,
      customerProblemNote: item.customerProblemNote || null,
      customerProblemReportedAt: item.customerProblemReportedAt || null,
      deliveryReminderSentAt: item.deliveryReminderSentAt || null,
    },
  });
});
route('POST', '/api/admin/orders/:orderId/items/:productId/run-tracking-self-test', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  const steps = [];
  const testNote = `SELF-TEST-${Date.now()}`;

  // --- small helpers so the Supabase/local-driver branching below doesn't
  // have to be repeated for every single field read or write ---
  async function readItem() {
    if (AUTH_DRIVER === 'supabase') {
      const { data, error } = await supabaseAdmin().from('order_items').select('*').eq('order_id', params.orderId).eq('tenant_id', tenant.id).eq('product_id', params.productId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
    const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
    return order && order.items.find(i => i.productId === params.productId);
  }
  async function writeItem(patch) {
    if (AUTH_DRIVER === 'supabase') {
      const dbPatch = {};
      if ('status' in patch) dbPatch.status = patch.status;
      if ('trackingNote' in patch) dbPatch.tracking_note = patch.trackingNote;
      if ('customerConfirmedAt' in patch) dbPatch.customer_confirmed_at = patch.customerConfirmedAt;
      if ('customerReportedProblem' in patch) dbPatch.customer_reported_problem = patch.customerReportedProblem;
      if ('customerProblemNote' in patch) dbPatch.customer_problem_note = patch.customerProblemNote;
      if ('customerProblemReportedAt' in patch) dbPatch.customer_problem_reported_at = patch.customerProblemReportedAt;
      const { error } = await supabaseAdmin().from('order_items').update(dbPatch).eq('order_id', params.orderId).eq('tenant_id', tenant.id).eq('product_id', params.productId);
      if (error) throw new Error(error.message);
    } else {
      const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
      Object.assign(order.items.find(i => i.productId === params.productId), patch);
      await persist();
    }
  }
  const field = (row, snakeKey, camelKey) => AUTH_DRIVER === 'supabase' ? row[snakeKey] : row[camelKey];

  try {
    // Step 1: find the item — same lookup the diagnostic view and Fulfillment Queue use.
    const before = await readItem();
    if (!before) { steps.push({ step: 'Find item', pass: false, detail: 'Item not found on this order.' }); return send(res, 200, { pass: false, steps }); }
    steps.push({ step: 'Find item', pass: true, detail: `Found "${before.name}", fulfillment=${before.fulfillment}` });
    if (before.fulfillment !== 'shipping') { steps.push({ step: 'Fulfillment check', pass: false, detail: `This test only applies to shipping items — this one is "${before.fulfillment}".` }); return send(res, 200, { pass: false, steps }); }

    // Snapshot every field this test will touch, as plain values — not
    // live object references — so the final restore step is genuinely
    // correct even on the local/file driver, where reading the same
    // object again later would show already-mutated data instead.
    const original = {
      status: field(before, 'status', 'status'),
      trackingNote: field(before, 'tracking_note', 'trackingNote') || null,
      customerConfirmedAt: field(before, 'customer_confirmed_at', 'customerConfirmedAt') || null,
      customerReportedProblem: field(before, 'customer_reported_problem', 'customerReportedProblem') || false,
      customerProblemNote: field(before, 'customer_problem_note', 'customerProblemNote') || null,
      customerProblemReportedAt: field(before, 'customer_problem_reported_at', 'customerProblemReportedAt') || null,
    };

    // Step 2: EMPLOYEE STATUS UPDATE — mirrors what "Save changes" in
    // Fulfillment Queue actually does: mark delivered, set a tracking note.
    await writeItem({ status: 'delivered', trackingNote: testNote, customerConfirmedAt: null, customerReportedProblem: false, customerProblemNote: null, customerProblemReportedAt: null });
    steps.push({ step: 'Employee marks item delivered with tracking note', pass: true, detail: `status=delivered, tracking_note="${testNote}"` });

    // Step 3: CUSTOMER VISIBILITY — read back exactly what "My Orders" would show.
    const afterEmployeeUpdate = await readItem();
    const statusVisible = field(afterEmployeeUpdate, 'status', 'status') === 'delivered';
    const noteVisible = field(afterEmployeeUpdate, 'tracking_note', 'trackingNote') === testNote;
    steps.push({ step: 'Customer can see updated status and tracking note', pass: statusVisible && noteVisible, detail: statusVisible && noteVisible ? `Customer would see: delivered, "${testNote}"` : `Mismatch — status visible=${statusVisible}, note visible=${noteVisible}` });

    // Step 4: CUSTOMER CONFIRMS RECEIPT — same effect as clicking "Confirm Receipt".
    await writeItem({ customerConfirmedAt: new Date().toISOString() });
    steps.push({ step: 'Customer confirms receipt', pass: true, detail: 'customer_confirmed_at set' });

    // Step 5: EMPLOYEE SEES THE CONFIRMATION — same read Fulfillment Queue uses.
    const afterConfirm = await readItem();
    const confirmVisible = !!field(afterConfirm, 'customer_confirmed_at', 'customerConfirmedAt');
    steps.push({ step: 'Employee can see the customer\'s confirmation', pass: confirmVisible, detail: confirmVisible ? 'Confirmation visible in Fulfillment Queue' : 'Confirmation NOT visible to staff — this would look like the customer never responded' });

    // Step 6: reset confirmation state, then test the DISPUTE path the same way —
    // confirmation and dispute are mutually exclusive in the real app, so
    // this can't be tested in the same state as step 4 without resetting first.
    await writeItem({ customerConfirmedAt: null });
    const disputeNote = 'Self-test dispute note';
    await writeItem({ customerReportedProblem: true, customerProblemNote: disputeNote, customerProblemReportedAt: new Date().toISOString() });
    steps.push({ step: 'Customer reports a problem instead', pass: true, detail: `customer_reported_problem=true, note="${disputeNote}"` });

    // Step 7: EMPLOYEE SEES THE DISPUTE.
    const afterDispute = await readItem();
    const disputeVisible = field(afterDispute, 'customer_reported_problem', 'customerReportedProblem') === true && field(afterDispute, 'customer_problem_note', 'customerProblemNote') === disputeNote;
    steps.push({ step: 'Employee can see the customer\'s reported problem', pass: disputeVisible, detail: disputeVisible ? `Dispute visible: "${disputeNote}"` : 'Dispute NOT visible to staff, or note did not match' });

    // Step 8: restore every field this test touched, back to its true
    // original value — a self-test must never leave real order data altered.
    await writeItem(original);
    const afterRestore = await readItem();
    const restored = field(afterRestore, 'status', 'status') === original.status
      && (field(afterRestore, 'tracking_note', 'trackingNote') || null) === original.trackingNote
      && (field(afterRestore, 'customer_confirmed_at', 'customerConfirmedAt') || null) === original.customerConfirmedAt
      && (field(afterRestore, 'customer_reported_problem', 'customerReportedProblem') || false) === original.customerReportedProblem;
    steps.push({ step: 'Restore original state', pass: restored, detail: restored ? `Restored to status=${original.status}, tracking_note=${original.trackingNote ? `"${original.trackingNote}"` : '(empty)'}` : 'Restore did not fully match the original snapshot — please check this item manually' });

    const overallPass = steps.every(s => s.pass);
    send(res, 200, { pass: overallPass, steps });
  } catch (e) {
    steps.push({ step: 'Unexpected error', pass: false, detail: e.message });
    send(res, 200, { pass: false, steps });
  }
});


route('GET', '/api/employee/queue', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('orders').select('*, order_items(*, products(meeting_link))').eq('tenant_id', tenant.id).eq('payment_status', 'success');
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
    // Uses the admin/service-role connection, not the caller's own
    // restricted client — this action is already authorized by the
    // route's own roles: ['employee','admin'] check, and shouldn't also
    // be silently blocked by RLS policies designed for other access
    // patterns. Using the caller's own client here was the actual bug:
    // an update that RLS silently rejects returns zero affected rows,
    // which reads identically to "item not found" — the true cause was
    // invisible without this fix.
    const admin = supabaseAdmin();
    const { data: item, error: findErr } = await admin.from('order_items').select('*').eq('order_id', params.orderId).eq('tenant_id', tenant.id).eq('product_id', params.productId).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
    const patch = {};
    if (item.fulfillment === 'shipping' && item.delivery_method === 'pickup') {
      if (body.status && ['pending', 'ready_for_pickup', 'picked_up'].includes(body.status)) patch.status = body.status;
      if (typeof body.trackingNote === 'string') patch.tracking_note = body.trackingNote;
    } else if (item.fulfillment === 'shipping') {
      if (body.status && ['pending', 'processing', 'shipped', 'delivered'].includes(body.status)) {
        patch.status = body.status;
        if (body.status === 'delivered' && item.status !== 'delivered') patch.delivered_at = new Date().toISOString();
      }
      if (typeof body.trackingNote === 'string') patch.tracking_note = body.trackingNote;
    } else if (item.fulfillment === 'booking') {
      if (body.status && ['requested', 'confirmed', 'completed', 'cancelled'].includes(body.status)) patch.status = body.status;
      if (body.scheduledAt) patch.scheduled_at = body.scheduledAt;
    } else if (item.fulfillment === 'manual') {
      if (body.status && ['pending', 'in_progress', 'done'].includes(body.status)) patch.status = body.status;
      if (typeof body.trackingNote === 'string') patch.tracking_note = body.trackingNote;
    }
    const { data: updated, error: updErr } = await admin.from('order_items').update(patch).eq('order_id', params.orderId).eq('tenant_id', tenant.id).eq('product_id', params.productId).select().maybeSingle();
    if (updErr) return send(res, 400, { error: updErr.message });
    if (!updated) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
    // Newly marked "delivered" (staff/courier claim) — prompt the customer
    // to make their own, separate confirmation. Only fires on the actual
    // transition, not every save while it's already delivered.
    if (patch.status === 'delivered' && item.status !== 'delivered') {
      try {
        const { data: orderRow } = await admin.from('orders').select('client_id').eq('id', params.orderId).maybeSingle();
        if (orderRow) {
          const { data: clientUser } = await admin.auth.admin.getUserById(orderRow.client_id);
          if (clientUser && clientUser.user) {
            const custLang = await getRecipientLang(clientUser.user.email);
            const subject = emailT(EMAIL_I18N, 'deliveryMarkedSubject', custLang)(tenant.name);
            const orderUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}/orders`;
            const text = emailT(EMAIL_I18N, 'deliveryMarkedBody', custLang)(updated.name, orderUrl, tenant.name);
            await admin.from('notifications').insert({ tenant_id: tenant.id, type: 'delivery_confirmation_requested', to_email: clientUser.user.email, subject, body: text });
            await sendRealEmail({ to: clientUser.user.email, subject, text, html: wrapEmailHtml(text, custLang) });
          }
        }
      } catch (e) { console.error('[delivery-notify] failed:', e.message); }
    }
    return send(res, 200, { item: orderItemRowToItem(updated) });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
  const wasAlreadyDelivered = item.status === 'delivered';
  if (item.fulfillment === 'shipping' && item.deliveryMethod === 'pickup') {
    if (body.status && ['pending', 'ready_for_pickup', 'picked_up'].includes(body.status)) item.status = body.status;
    if (typeof body.trackingNote === 'string') item.trackingNote = body.trackingNote;
  } else if (item.fulfillment === 'shipping') {
    if (body.status && ['pending', 'processing', 'shipped', 'delivered'].includes(body.status)) {
      if (body.status === 'delivered' && item.status !== 'delivered') item.deliveredAt = Date.now();
      item.status = body.status;
    }
    if (typeof body.trackingNote === 'string') item.trackingNote = body.trackingNote;
  } else if (item.fulfillment === 'booking') {
    if (body.status && ['requested', 'confirmed', 'completed', 'cancelled'].includes(body.status)) item.status = body.status;
    if (body.scheduledAt) item.scheduledAt = body.scheduledAt;
    item.assignedEmployee = user.name;
  } else if (item.fulfillment === 'manual') {
    if (body.status && ['pending', 'in_progress', 'done'].includes(body.status)) item.status = body.status;
    if (typeof body.trackingNote === 'string') item.trackingNote = body.trackingNote;
  }
  if (item.status === 'delivered' && !wasAlreadyDelivered) {
    const orderUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}/orders`;
    const custLang = await getRecipientLang(order.clientEmail);
    const subject = emailT(EMAIL_I18N, 'deliveryMarkedSubject', custLang)(tenant.name);
    const text = emailT(EMAIL_I18N, 'deliveryMarkedBody', custLang)(item.name, orderUrl, tenant.name);
    db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'delivery_confirmation_requested', to: order.clientEmail, subject, body: text, sentAt: Date.now() });
    try { await sendRealEmail({ to: order.clientEmail, subject, text, html: wrapEmailHtml(text, custLang) }); } catch { /* best-effort */ }
  }
  await persist();
  send(res, 200, { item });
});

route('GET', '/api/employee/orders', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('orders').select('*, order_items(*, products(meeting_link))').eq('tenant_id', tenant.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { orders: data.map(orderRowForClient) });
  }
  const orders = db.orders.filter(o => o.tenantId === tenant.id).sort((a, b) => b.createdAt - a.createdAt).map(orderForClient);
  send(res, 200, { orders });
});

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

route('PATCH', '/api/employee/orders/:orderId/status', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (!ORDER_STATUSES.includes(body.status)) return send(res, 400, { error: `status must be one of: ${ORDER_STATUSES.join(', ')}.` });
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: updated, error: updErr } = await client.from('orders').update({ status: body.status }).eq('id', params.orderId).eq('tenant_id', tenant.id).select().maybeSingle();
    if (updErr) return send(res, 400, { error: updErr.message });
    if (!updated) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    const { error: histErr } = await client.from('order_status_history').insert({ tenant_id: tenant.id, order_id: params.orderId, status: body.status, changed_by: user.name });
    if (histErr) console.error('[order status history insert failed]', histErr.message); // the status change itself already succeeded above; don't fail the request over the audit log entry
    return send(res, 200, { status: updated.status });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  order.status = body.status;
  db.orderStatusHistory.push({ id: newId('osh'), tenantId: tenant.id, orderId: order.id, status: body.status, changedBy: user.name, changedAt: Date.now() });
  await persist();
  send(res, 200, { status: order.status });
});

route('GET', '/api/orders/:orderId/status-history', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('client_id').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    if (order.client_id !== user.id && user.role === 'client') return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
    const { data, error } = await client.from('order_status_history').select('*').eq('order_id', params.orderId).order('changed_at', { ascending: true });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { history: data.map(h => ({ status: h.status, changedBy: h.changed_by, changedAt: h.changed_at })) });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  if (order.clientId !== user.id && user.role === 'client') return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
  const history = db.orderStatusHistory.filter(h => h.orderId === params.orderId).sort((a, b) => a.changedAt - b.changedAt);
  send(res, 200, { history });
});

/** Notifies the customer once staff has approved or rejected their refund request. */
async function notifyCustomerOfRefundDecision(tenant, { clientId, clientEmail, itemName, decision, decisionReason, orderId }) {
  const approved = decision === 'approved';
  const orderUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}/orders`;
  try {
    let email = clientEmail;
    if (!email && AUTH_DRIVER === 'supabase') {
      const { data: clientUser } = await supabaseAdmin().auth.admin.getUserById(clientId);
      email = clientUser && clientUser.user && clientUser.user.email;
    }
    if (!email) return;
    const custLang = await getRecipientLang(email); // requester here is staff, not the customer — must look up the recipient's own stored language, not reqLang(req)
    const subject = approved ? emailT(EMAIL_I18N, 'refundApprovedSubject', custLang)(itemName) : emailT(EMAIL_I18N, 'refundRejectedSubject', custLang)(itemName);
    const text = approved
      ? emailT(EMAIL_I18N, 'refundApprovedBody', custLang)(itemName, orderUrl, tenant.name)
      : emailT(EMAIL_I18N, 'refundRejectedBody', custLang)(itemName, decisionReason);
    if (AUTH_DRIVER === 'supabase') {
      await supabaseAdmin().from('notifications').insert({ tenant_id: tenant.id, type: 'refund_decision', to_email: email, subject, body: text });
    } else {
      db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'refund_decision', to: email, subject, body: text, sentAt: Date.now() });
    }
    await sendRealEmail({ to: email, subject, text, html: wrapEmailHtml(text, custLang) });
  } catch (e) { console.error('[refund-decision-notify] failed:', e.message); }
}
/** Notifies both staff and the customer once a refund has actually been processed (payment confirmed). */
async function notifyStaffAndCustomerOfCompletedRefund(tenant, { itemName, customerEmail, orderId, last4 }) {
  try {
    const custLang = await getRecipientLang(customerEmail); // whoever confirmed the refund payment (customer) may differ in language from whichever staff member is watching this run — look up the customer's own stored preference
    const custSubject = emailT(EMAIL_I18N, 'refundCompletedCustomerSubject', custLang)(itemName);
    const custText = emailT(EMAIL_I18N, 'refundCompletedCustomerBody', custLang)(itemName, last4, tenant.name);
    await sendRealEmail({ to: customerEmail, subject: custSubject, text: custText, html: wrapEmailHtml(custText, custLang) });
    if (AUTH_DRIVER === 'supabase') {
      const admin = supabaseAdmin();
      const { data: staff } = await admin.from('tenant_memberships').select('user_id').eq('tenant_id', tenant.id).in('role', ['admin', 'employee']);
      for (const s of (staff || [])) {
        const { data: staffUser } = await admin.auth.admin.getUserById(s.user_id);
        if (staffUser && staffUser.user) {
          const staffLang = await getRecipientLang(staffUser.user.email);
          const staffSubject = emailT(EMAIL_I18N, 'refundCompletedStaffSubject', staffLang)(itemName);
          const staffText = emailT(EMAIL_I18N, 'refundCompletedStaffBody', staffLang)(orderId, itemName, last4);
          await admin.from('notifications').insert({ tenant_id: tenant.id, type: 'refund_completed', to_email: staffUser.user.email, subject: staffSubject, body: staffText });
          await sendRealEmail({ to: staffUser.user.email, subject: staffSubject, text: staffText, html: wrapEmailHtml(staffText, staffLang) });
        }
      }
    } else {
      const staff = db.users.filter(u => u.tenantId === tenant.id && (u.role === 'admin' || u.role === 'employee'));
      for (const s of staff) {
        const staffLang = await getRecipientLang(s.email);
        const staffSubject = emailT(EMAIL_I18N, 'refundCompletedStaffSubject', staffLang)(itemName);
        const staffText = emailT(EMAIL_I18N, 'refundCompletedStaffBody', staffLang)(orderId, itemName, last4);
        db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'refund_completed', to: s.email, subject: staffSubject, body: staffText, sentAt: Date.now() });
        try { await sendRealEmail({ to: s.email, subject: staffSubject, text: staffText, html: wrapEmailHtml(staffText, staffLang) }); } catch { /* best-effort */ }
      }
    }
  } catch (e) { console.error('[refund-complete-notify] failed:', e.message); }
}

route('POST', '/api/employee/orders/:orderId/items/:productId/refund-decision', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {
  const decision = body.decision; // 'approve' | 'reject'
  if (!['approve', 'reject'].includes(decision)) return send(res, 400, { error: apiT('decisionInvalid', reqLang(req)) });
  const decisionReason = (body.reason || '').slice(0, 500);
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('payment_status, client_id').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    if (order.payment_status !== 'success') return send(res, 400, { error: apiT('onlyPaidOrdersRefundable', reqLang(req)) });
    const { data: item, error: itemErr } = await client.from('order_items').select('*').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (itemErr) return send(res, 500, { error: itemErr.message });
    if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
    if (item.status === 'refunded') return send(res, 409, { error: apiT('itemAlreadyRefunded', reqLang(req)) });
    if (item.refund_status === 'approved' || item.refund_status === 'processed') return send(res, 409, { error: apiT('refundDecisionAlreadyMade', reqLang(req)) });
    const profile = await authSupabase.getProfile(bearerToken(req));
    const decidedBy = profile.full_name || user.email;
    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    const { data: updated, error: updErr } = await client.from('order_items').update({
      refund_status: newStatus, refund_decision_by: decidedBy, refund_decision_at: new Date().toISOString(), refund_decision_reason: decisionReason,
    }).eq('order_id', params.orderId).eq('product_id', params.productId).select().maybeSingle();
    if (updErr) return send(res, 400, { error: updErr.message });
    if (!updated) return send(res, 500, { error: apiT('refundDecisionFailed', reqLang(req)) });
    notifyCustomerOfRefundDecision(tenant, { clientId: order.client_id, itemName: updated.name, decision: newStatus, decisionReason, orderId: params.orderId });
    return send(res, 200, { item: orderItemRowToItem(updated) });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  if (order.paymentStatus !== 'success') return send(res, 400, { error: apiT('onlyPaidOrdersRefundable', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
  if (item.status === 'refunded') return send(res, 409, { error: apiT('itemAlreadyRefunded', reqLang(req)) });
  if (item.refundStatus === 'approved' || item.refundStatus === 'processed') return send(res, 409, { error: apiT('refundDecisionAlreadyMade', reqLang(req)) });
  const newStatus = decision === 'approve' ? 'approved' : 'rejected';
  item.refundStatus = newStatus;
  item.refundDecisionBy = user.name;
  item.refundDecisionAt = Date.now();
  item.refundDecisionReason = decisionReason;
  await persist();
  notifyCustomerOfRefundDecision(tenant, { clientId: order.clientId, clientEmail: order.clientEmail, itemName: item.name, decision: newStatus, decisionReason, orderId: params.orderId });
  send(res, 200, { item });
});

// The final step: the customer provides a (simulated) refund payment method
// for an APPROVED refund, and the system actually processes it — status
// change, restock, and both-sides notification all happen only here, only
// once payment has been confirmed. Kept as a genuinely separate step from
// approval above so that plugging in a real payment gateway later means
// swapping what happens inside this one function, not redesigning the
// request/approval workflow around it.
route('POST', '/api/orders/:orderId/items/:productId/submit-refund-payment', { hostScope: 'tenant', auth: true }, async (req, res, params, body, query, user, tenant) => {
  const cardFormatError = validateFullCard(body.card, reqLang(req));
  if (cardFormatError) return send(res, 400, { error: cardFormatError });
  const cardDigits = ((body.card && body.card.number) || '').replace(/\s/g, '');
  if (cardDigits === '0000000000000000') return send(res, 402, { error: apiT('cardDeclinedTryDifferent', reqLang(req)) });
  const last4 = cardDigits.slice(-4);

  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: order, error: orderErr } = await client.from('orders').select('client_id').eq('id', params.orderId).eq('tenant_id', tenant.id).maybeSingle();
    if (orderErr) return send(res, 500, { error: orderErr.message });
    if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
    if (order.client_id !== user.id) return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
    const { data: item, error: itemErr } = await client.from('order_items').select('*').eq('order_id', params.orderId).eq('product_id', params.productId).maybeSingle();
    if (itemErr) return send(res, 500, { error: itemErr.message });
    if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
    if (item.refund_status !== 'approved') return send(res, 400, { error: apiT('refundNotApprovedOrProcessed', reqLang(req)) });
    const admin = supabaseAdmin();
    const { data: updated, error: updErr } = await admin.from('order_items').update({
      status: 'refunded', refund_status: 'processed', refund_payment_last4: last4,
      refunded_at: new Date().toISOString(), refunded_by: item.refund_decision_by, refund_reason: item.refund_decision_reason, refund_requested: false,
    }).eq('order_id', params.orderId).eq('tenant_id', tenant.id).eq('product_id', params.productId).select().maybeSingle();
    if (updErr) return send(res, 400, { error: updErr.message });
    if (!updated) return send(res, 500, { error: apiT('refundProcessingFailed', reqLang(req)) });
    if (item.fulfillment === 'shipping' && item.product_id) {
      const { error: adjErr } = await admin.rpc('adjust_product_stock', {
        p_product_id: item.product_id, p_tenant_id: tenant.id, p_change: item.qty, p_reason: 'refund_restock', p_order_id: params.orderId,
      });
      if (adjErr) console.error('[restock on refund failed]', adjErr.message);
    }
    notifyStaffAndCustomerOfCompletedRefund(tenant, { itemName: updated.name, customerEmail: user.email, orderId: params.orderId, last4 });
    return send(res, 200, { item: orderItemRowToItem(updated) });
  }
  const order = db.orders.find(o => o.id === params.orderId && o.tenantId === tenant.id);
  if (!order) return send(res, 404, { error: apiT('orderNotFound', reqLang(req)) });
  if (order.clientId !== user.id) return send(res, 403, { error: apiT('orderNotYours', reqLang(req)) });
  const item = order.items.find(i => i.productId === params.productId);
  if (!item) return send(res, 404, { error: apiT('itemNotFoundOnOrder', reqLang(req)) });
  if (item.refundStatus !== 'approved') return send(res, 400, { error: apiT('refundNotApprovedOrProcessed', reqLang(req)) });
  item.status = 'refunded';
  item.refundStatus = 'processed';
  item.refundPaymentLast4 = last4;
  item.refundedAt = Date.now();
  item.refundedBy = item.refundDecisionBy;
  item.refundReason = item.refundDecisionReason;
  item.refundRequested = false;
  if (item.fulfillment === 'shipping') {
    const product = findProduct(item.productId, tenant.id);
    if (product && typeof product.stock === 'number') {
      product.stock += item.qty;
      db.stockMovements.push({ id: newId('stkmv'), tenantId: tenant.id, productId: product.id, change: item.qty, reason: 'refund_restock', orderId: order.id, createdBy: item.refundDecisionBy, createdAt: Date.now() });
    }
  }
  await persist();
  notifyStaffAndCustomerOfCompletedRefund(tenant, { itemName: item.name, customerEmail: order.clientEmail, orderId: params.orderId, last4 });
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
  let exportData;
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const [{ data: categories }, { data: products }, { data: orders }, { data: memberships }, { data: images }] = await Promise.all([
      client.from('categories').select('*').eq('tenant_id', tenant.id),
      client.from('products').select('*, categories(*)').eq('tenant_id', tenant.id),
      client.from('orders').select('*, order_items(*)').eq('tenant_id', tenant.id),
      supabaseAdmin().from('tenant_memberships').select('user_id, role').eq('tenant_id', tenant.id),
      client.from('product_images').select('product_id, storage_path, filename, uploaded_at').eq('tenant_id', tenant.id),
    ]);
    const team = [];
    for (const m of memberships || []) {
      const { data: authUser } = await supabaseAdmin().auth.admin.getUserById(m.user_id);
      if (authUser && authUser.user) team.push({ id: m.user_id, email: authUser.user.email, name: authUser.user.user_metadata?.full_name || '', role: m.role });
    }
    const imagesByProduct = {};
    for (const img of images || []) {
      (imagesByProduct[img.product_id] = imagesByProduct[img.product_id] || []).push({ storagePath: img.storage_path, filename: img.filename, uploadedAt: img.uploaded_at });
    }
    exportData = {
      exportFormat: 'hadam-store-export-v1',
      exportedAt: new Date().toISOString(),
      store: { name: tenant.name, subdomain: tenant.subdomain, plan: tenant.plan, subscriptionTier: tenant.subscriptionTier, tagline: tenant.tagline, description: tenant.description, translations: tenant.translations || {} },
      categories: (categories || []).map(c => rowToCategory(c)),
      // images: storage references only (path + filename) — never the binaries or a
      // signed/temporary URL, per the explicit data-export privacy scope. Re-uploading
      // to a new store still requires pulling each file from Storage separately.
      products: (products || []).map(p => ({ ...rowToProduct({ ...p, product_images: [] }), images: imagesByProduct[p.id] || [] })), // includes sku, the permanent product code, for every product
      orders: (orders || []).map(orderRowForClient),
      team,
    };
  } else {
    exportData = {
      exportFormat: 'hadam-store-export-v1',
      exportedAt: new Date().toISOString(),
      store: { name: tenant.name, subdomain: tenant.subdomain, plan: tenant.plan, subscriptionTier: tenant.subscriptionTier, tagline: tenant.tagline, description: tenant.description, translations: tenant.translations || {} },
      categories: db.categories.filter(c => c.tenantId === tenant.id),
      products: db.products.filter(p => p.tenantId === tenant.id).map(p => ({ ...p, images: (p.images || []).map(img => ({ storagePath: img.path || img.url || null, filename: img.filename || null })) })), // already includes sku
      orders: db.orders.filter(o => o.tenantId === tenant.id),
      team: db.users.filter(u => u.tenantId === tenant.id).map(publicUser), // publicUser strips passwordHash
    };
  }
  const json = JSON.stringify(exportData, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${tenant.subdomain}-export-${new Date().toISOString().slice(0, 10)}.json"`,
    'Access-Control-Allow-Origin': '*',
    ...SECURITY_HEADERS,
  });
  res.end(json);
});

route('GET', '/api/admin/digital-products', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: products, error: prodErr } = await client.from('products').select('id, name, sku, price, categories!inner(id, name, fulfillment)').eq('tenant_id', tenant.id).eq('categories.fulfillment', 'download');
    if (prodErr) return send(res, 500, { error: prodErr.message });
    const { data: files, error: filesErr } = await client.from('download_products').select('*').eq('tenant_id', tenant.id);
    if (filesErr) return send(res, 500, { error: filesErr.message });
    const { data: items, error: itemsErr } = await client.from('order_items').select('product_id, download_used_count, image_download_used_count').eq('tenant_id', tenant.id).eq('fulfillment', 'download');
    if (itemsErr) return send(res, 500, { error: itemsErr.message });
    const downloadCounts = {}, imageDownloadCounts = {};
    (items || []).forEach(i => {
      downloadCounts[i.product_id] = (downloadCounts[i.product_id] || 0) + (i.download_used_count || 0);
      imageDownloadCounts[i.product_id] = (imageDownloadCounts[i.product_id] || 0) + (i.image_download_used_count || 0);
    });
    const filesByProduct = {};
    (files || []).forEach(f => { filesByProduct[f.product_id] = f; });
    const rows = products.map(p => {
      const f = filesByProduct[p.id];
      return {
        productId: p.id, productName: p.name, productCode: p.sku || null, categoryName: p.categories.name, price: Number(p.price),
        hasFile: !!f, readyForSale: !!f && f.upload_status === 'completed',
        originalFilename: f ? f.original_filename : null, extension: f ? f.extension : null, mimeType: f ? f.mime_type : null,
        sizeBytes: f ? f.size_bytes : null, isCompressed: f ? f.is_compressed : false, uploadStatus: f ? f.upload_status : null,
        uploadedAt: f ? f.uploaded_at : null, uploadedBy: f ? f.uploaded_by : null,
        storageProvider: f ? f.storage_provider : null, storagePath: f ? f.storage_path : null,
        downloadCount: downloadCounts[p.id] || 0, imageDownloadCount: imageDownloadCounts[p.id] || 0,
      };
    });
    return send(res, 200, { digitalProducts: rows });
  }
  const products = db.products.filter(p => p.tenantId === tenant.id).map(p => ({ ...p, category: findCategory(p.categoryId, tenant.id) })).filter(p => p.category && p.category.fulfillment === 'download');
  const downloadCounts = {}, imageDownloadCounts = {};
  db.orders.filter(o => o.tenantId === tenant.id).forEach(o => {
    o.items.filter(i => i.fulfillment === 'download').forEach(i => {
      downloadCounts[i.productId] = (downloadCounts[i.productId] || 0) + (i.downloadsUsed || 0);
      imageDownloadCounts[i.productId] = (imageDownloadCounts[i.productId] || 0) + (i.imageDownloadsUsed || 0);
    });
  });
  const rows = products.map(p => {
    const f = (db.downloadProducts || []).find(d => d.productId === p.id && d.tenantId === tenant.id);
    return {
      productId: p.id, productName: p.name, productCode: p.sku || null, categoryName: p.category.name, price: p.price,
      hasFile: !!f, readyForSale: !!f && f.uploadStatus === 'completed',
      originalFilename: f ? f.filename : null, extension: f ? f.extension : null, mimeType: f ? f.mimeType : null,
      sizeBytes: f ? f.size : null, isCompressed: f ? !!f.isCompressed : false, uploadStatus: f ? f.uploadStatus : null,
      uploadedAt: f ? f.uploadedAt : null, uploadedBy: f ? f.uploadedBy : null,
      storageProvider: f ? 'local' : null, storagePath: f ? f.diskFilename : null,
      downloadCount: downloadCounts[p.id] || 0, imageDownloadCount: imageDownloadCounts[p.id] || 0,
    };
  });
  send(res, 200, { digitalProducts: rows });
});

route('GET', '/api/admin/stats', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: orderRows, error: ordersErr } = await client.from('orders').select('*, order_items(*)').eq('tenant_id', tenant.id);
    if (ordersErr) return send(res, 500, { error: ordersErr.message });
    const mine = orderRows.map(orderRowForClient);
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

    const { data: productRows, error: productsErr } = await client.from('products').select('id, name, stock').eq('tenant_id', tenant.id);
    if (productsErr) return send(res, 500, { error: productsErr.message });
    const physicalProducts = productRows.filter(p => typeof p.stock === 'number');
    const lowStockThreshold = 5;
    const stockLevels = physicalProducts.map(p => ({ productId: p.id, name: p.name, stock: p.stock })).sort((a, b) => a.stock - b.stock);
    const lowStock = stockLevels.filter(p => p.stock <= lowStockThreshold);

    const { count: categoryCount } = await client.from('categories').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
    const { count: clientCount } = await client.from('tenant_memberships').select('user_id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('role', 'client');
    const { count: employeeCount } = await client.from('tenant_memberships').select('user_id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('role', 'employee');

    const { data: sub } = await client.from('current_subscriptions').select('*, plans(*)').eq('tenant_id', tenant.id).maybeSingle();
    const tierName = sub && sub.plans ? sub.plans.name : 'starter';
    const commissionRate = sub && sub.plans ? Number(sub.plans.commission_rate) : SUBSCRIPTION_TIERS.starter.commissionRate;
    const commissionOwed = revenue * commissionRate;

    return send(res, 200, {
      revenue, refundedTotal, netRevenue: revenue,
      orderCount: mine.length, successOrderCount: successOrders.length, refundedItemCount: refundedItems.length,
      productCount: productRows.length, categoryCount: categoryCount || 0, clientCount: clientCount || 0, employeeCount: employeeCount || 0,
      topProducts, stockLevels, lowStock, lowStockThreshold,
      subscriptionTier: tierName, commissionRate, commissionOwed, sellerKeeps: revenue - commissionOwed,
    });
  }
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
    return send(res, 400, { error: apiT('fromToTimestampsInvalid', reqLang(req)) });
  }

  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: orderRows, error: ordersErr } = await client.from('orders').select('*, order_items(*)')
      .eq('tenant_id', tenant.id).gte('created_at', new Date(from).toISOString()).lte('created_at', new Date(to).toISOString());
    if (ordersErr) return send(res, 500, { error: ordersErr.message });
    const inRange = orderRows.map(orderRowForClient);
    const successOrders = inRange.filter(o => o.paymentStatus === 'success');
    const failedOrders = inRange.filter(o => o.paymentStatus === 'failed');
    const allSuccessItems = successOrders.flatMap(o => o.items);
    const activeItems = allSuccessItems.filter(i => i.status !== 'refunded');
    const refundedItems = allSuccessItems.filter(i => i.status === 'refunded');
    const revenue = activeItems.reduce((s, i) => s + i.price * i.qty, 0);
    const refundedTotal = refundedItems.reduce((s, i) => s + i.price * i.qty, 0);

    const { data: sub } = await client.from('current_subscriptions').select('*, plans(*)').eq('tenant_id', tenant.id).maybeSingle();
    const tierName = sub && sub.plans ? sub.plans.name : 'starter';
    const commissionRate = sub && sub.plans ? Number(sub.plans.commission_rate) : SUBSCRIPTION_TIERS.starter.commissionRate;
    const commissionOwed = revenue * commissionRate;

    const salesByProduct = {};
    activeItems.forEach(i => {
      if (!salesByProduct[i.productId]) salesByProduct[i.productId] = { productId: i.productId, name: i.name, unitsSold: 0, revenue: 0 };
      salesByProduct[i.productId].unitsSold += i.qty;
      salesByProduct[i.productId].revenue += i.price * i.qty;
    });
    const topProducts = Object.values(salesByProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const byDay = {};
    successOrders.forEach(o => {
      const day = new Date(o.createdAt).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, revenue: 0, orders: 0 };
      byDay[day].orders += 1;
      o.items.filter(i => i.status !== 'refunded').forEach(i => { byDay[day].revenue += i.price * i.qty; });
    });
    const dailySeries = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

    const { count: newClients } = await client.from('tenant_memberships').select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id).eq('role', 'client').gte('created_at', new Date(from).toISOString()).lte('created_at', new Date(to).toISOString());

    return send(res, 200, {
      from, to, revenue, refundedTotal, netRevenue: revenue,
      orderCount: inRange.length, successOrderCount: successOrders.length, failedOrderCount: failedOrders.length,
      refundedItemCount: refundedItems.length, newClients: newClients || 0,
      subscriptionTier: tierName, commissionRate, commissionOwed, sellerKeeps: revenue - commissionOwed,
      topProducts, dailySeries,
    });
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

route('GET', '/api/admin/orders', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('orders').select('*, order_items(*)').eq('tenant_id', tenant.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    const orderIds = data.map(o => o.id);
    const { data: paymentRows } = orderIds.length ? await supabaseAdmin().from('payments').select('id, order_id, method, status, provider_reference').in('order_id', orderIds) : { data: [] };
    const paymentsByOrder = new Map((paymentRows || []).map(p => [p.order_id, p]));
    return send(res, 200, { orders: data.map(row => {
      const order = orderRowForClient(row);
      const payment = paymentsByOrder.get(row.id);
      order.paymentMethod = row.payment_method;
      order.paymentId = payment ? payment.id : null;
      order.paymentProviderStatus = payment ? payment.status : null;
      order.paymentReference = payment ? payment.provider_reference : null;
      return order;
    }) });
  }
  send(res, 200, { orders: db.orders.filter(o => o.tenantId === tenant.id).sort((a, b) => b.createdAt - a.createdAt).map(o => {
    const order = orderForClient(o);
    const payment = db.payments.find(p => p.orderId === o.id);
    order.paymentMethod = payment ? payment.method : null;
    order.paymentId = payment ? payment.id : null;
    order.paymentProviderStatus = payment ? payment.status : null;
    order.paymentReference = payment ? payment.providerReference : null;
    return order;
  }) });
});

// Admin-assisted MFA reset — the true last-resort recovery path for someone
// who has lost both their authenticator device AND their backup codes, with
// no self-service option left. Scoped strictly to the calling admin's own
// tenant — an admin can never reset MFA for a user outside their own store.
// Superadmin version of the same recovery path — needed specifically for
// the case an admin-scoped reset can't cover: a store's only admin losing
// their own device and backup codes, with no one else at that store able
// to help them.
route('POST', '/api/platform/users/reset-mfa-by-email', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res, params, body, query, user) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const { email } = body;
  if (!email) return send(res, 400, { error: apiT('emailRequired', reqLang(req)) });
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) return send(res, 500, { error: error.message });
  const targetUser = (data.users || []).find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (!targetUser) return send(res, 404, { error: apiT('noAccountForEmail', reqLang(req)) });
  // A superadmin must never be able to reset their own MFA this way — that
  // would turn "I lost my authenticator" into a plain password-only account
  // takeover path, exactly the self-service bypass this recovery design
  // deliberately avoids. Recovery for a superadmin must always come from a
  // second, independent superadmin account.
  if (targetUser.id === user.id) return send(res, 403, { error: apiT('cannotResetOwnMfa', reqLang(req)) });
  try {
    await authSupabase.adminResetAllMfaForUser(targetUser.id);
    logAuthEvent({ userId: targetUser.id, email: targetUser.email, eventType: 'admin_mfa_reset', req, details: { actingAdminId: user.id, actingAdminEmail: user.email, scope: 'superadmin_by_email' } });
    send(res, 200, { ok: true, name: targetUser.user_metadata && targetUser.user_metadata.full_name });
  } catch (e) { send(res, 400, { error: e.message }); }
});

route('POST', '/api/platform/users/:id/reset-mfa', { hostScope: 'platform', auth: true, roles: ['superadmin'] }, async (req, res, params, body, query, user) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  // Same self-reset guard as the by-email route above — never let a
  // superadmin reset their own MFA through either endpoint.
  if (params.id === user.id) return send(res, 403, { error: apiT('cannotResetOwnMfa', reqLang(req)) });
  try {
    await authSupabase.adminResetAllMfaForUser(params.id);
    logAuthEvent({ userId: params.id, eventType: 'admin_mfa_reset', req, details: { actingAdminId: user.id, actingAdminEmail: user.email, scope: 'superadmin_by_id' } });
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
});

route('POST', '/api/admin/users/:id/reset-mfa', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 501, { error: apiT('mfaSupabaseOnly', reqLang(req)) });
  const client = supabaseForRequest(bearerToken(req));
  const { data: membership, error: memErr } = await client.from('tenant_memberships').select('user_id').eq('tenant_id', tenant.id).eq('user_id', params.id).maybeSingle();
  if (memErr) return send(res, 500, { error: memErr.message });
  if (!membership) return send(res, 404, { error: apiT('accountNotMemberStore', reqLang(req)) });
  try {
    await authSupabase.adminResetAllMfaForUser(params.id);
    logAuthEvent({ userId: params.id, tenantId: tenant.id, eventType: 'admin_mfa_reset', req, details: { actingAdminId: user.id, actingAdminEmail: user.email, scope: 'tenant_admin' } });
    send(res, 200, { ok: true });
  } catch (e) { send(res, 400, { error: e.message }); }
});

route('GET', '/api/admin/users', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: memberships, error } = await client.from('tenant_memberships').select('user_id, role').eq('tenant_id', tenant.id);
    if (error) return send(res, 500, { error: error.message });
    const admin = supabaseAdmin();
    const users = [];
    for (const m of (memberships || [])) {
      const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
      if (authUser && authUser.user) {
        users.push({ id: m.user_id, name: (authUser.user.user_metadata && authUser.user.user_metadata.full_name) || authUser.user.email, email: authUser.user.email, role: m.role });
      }
    }
    return send(res, 200, { users });
  }
  send(res, 200, { users: db.users.filter(u => u.tenantId === tenant.id).map(publicUser) });
});

route('DELETE', '/api/admin/users/:id', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: target, error: findErr } = await client.from('tenant_memberships').select('user_id, role').eq('tenant_id', tenant.id).eq('user_id', params.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!target) return send(res, 404, { error: apiT('accountNotFound', reqLang(req)) });
    if (target.role === 'admin') {
      const { count } = await client.from('tenant_memberships').select('user_id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('role', 'admin').neq('user_id', params.id);
      if (!count) return send(res, 400, { error: apiT('cantDeleteOnlyAdmin', reqLang(req)) });
    }
    // Removes their access to THIS store only — the underlying auth
    // account isn't deleted, since the same person may be a member of
    // other stores too (e.g. an employee working two Hadam stores).
    const { error: delErr } = await client.from('tenant_memberships').delete().eq('tenant_id', tenant.id).eq('user_id', params.id);
    if (delErr) return send(res, 500, { error: delErr.message });
    return send(res, 200, { ok: true });
  }
  const target = db.users.find(u => u.id === params.id && u.tenantId === tenant.id);
  if (!target) return send(res, 404, { error: apiT('accountNotFound', reqLang(req)) });
  if (target.role === 'admin') {
    const otherAdmins = db.users.filter(u => u.tenantId === tenant.id && u.role === 'admin' && u.id !== target.id);
    if (otherAdmins.length === 0) return send(res, 400, { error: apiT('cantDeleteOnlyAdmin', reqLang(req)) });
  }
  db.users = db.users.filter(u => u.id !== target.id);
  await persist();
  send(res, 200, { ok: true });
});

route('POST', '/api/admin/employees', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const { name, email, password, role } = body;
  const chosenRole = ['employee', 'admin'].includes(role) ? role : 'employee';
  if (!name || !email || !password || password.length < 6) return send(res, 400, { error: apiT('nameEmailPassword6Required', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    const admin = supabaseAdmin();
    // email_confirm: true — an admin creating this account directly is
    // sufficient vouching; there's no reason to also require the new
    // employee to click a confirmation link before they can log in, the
    // way a normal self-service signup would.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (createErr) {
      if (/already been registered|already exists/i.test(createErr.message)) return send(res, 409, { error: apiT('accountExistsGeneral', reqLang(req)) });
      return send(res, 400, { error: createErr.message });
    }
    const { error: memberErr } = await admin.from('tenant_memberships').insert({ user_id: created.user.id, tenant_id: tenant.id, role: chosenRole });
    if (memberErr) {
      // Roll back the auth user if the membership couldn't be created —
      // otherwise this becomes an orphaned account with no store access,
      // silently taking up the email address for good.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return send(res, 400, { error: memberErr.message });
    }
    logAuthEvent({ userId: created.user.id, email, tenantId: tenant.id, eventType: 'account_created', req, details: { role: chosenRole, createdByAdminId: user.id } });
    return send(res, 201, { user: { id: created.user.id, name, email, role: chosenRole } });
  }
  if (findUserByEmail(email, tenant.id)) return send(res, 409, { error: apiT('accountExistsForStore', reqLang(req)) });
  const u = { id: newId('u'), name, email, passwordHash: hashPassword(password), role: chosenRole, tenantId: tenant.id, createdAt: Date.now() };
  db.users.push(u);
  await persist();
  send(res, 201, { user: publicUser(u) });
});

route('POST', '/api/admin/categories', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const { name, group, fulfillment, description, downloadWindowHours, maxDownloads, platformCategory, allowPickup, translations, customTypeName } = body;
  if (!name || !['store', 'marketplace', 'other'].includes(group) || !['shipping', 'download', 'booking', 'manual'].includes(fulfillment)) {
    return send(res, 400, { error: apiT('categoryFieldsRequired', reqLang(req)) });
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
  const normalizedName = name.trim().toLowerCase();
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    // Case-insensitive, whitespace-trimmed check — "Health care" and
    // "Healthcare " should be treated as the same category name, not two
    // separate near-duplicate categories that only differ by formatting.
    const { data: existingCats, error: dupErr } = await client.from('categories').select('name').eq('tenant_id', tenant.id);
    if (dupErr) return send(res, 500, { error: dupErr.message });
    if ((existingCats || []).some(c => c.name.trim().toLowerCase() === normalizedName)) {
      return send(res, 409, { error: `A category named "${name.trim()}" already exists (category names must be unique, regardless of capitalization or spacing).` });
    }
    const { data, error } = await client.from('categories').insert(categoryToRow(cat, tenant.id)).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    if (!data) return send(res, 500, { error: apiT('categoryCreationFailed', reqLang(req)) });
    return send(res, 201, { category: rowToCategory(data) });
  }
  if (db.categories.some(c => c.tenantId === tenant.id && c.name.trim().toLowerCase() === normalizedName)) {
    return send(res, 409, { error: `A category named "${name.trim()}" already exists (category names must be unique, regardless of capitalization or spacing).` });
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
    if (!existing) return send(res, 404, { error: apiT('categoryNotFound', reqLang(req)) });
    if ((body.group !== undefined && body.group !== existing.group) || (body.fulfillment !== undefined && body.fulfillment !== existing.fulfillment)) {
      return send(res, 400, { error: apiT('categoryTypeImmutable', reqLang(req)) });
    }
    if (body.platformCategory !== undefined && !PLATFORM_CATEGORIES.includes(body.platformCategory)) {
      return send(res, 400, { error: `platformCategory must be one of: ${PLATFORM_CATEGORIES.join(', ')}.` });
    }
    const patch = {};
    if (body.name !== undefined) {
      const normalizedName = body.name.trim().toLowerCase();
      if (normalizedName !== existing.name.trim().toLowerCase()) {
        const { data: otherCats, error: dupErr } = await client.from('categories').select('id, name').eq('tenant_id', tenant.id).neq('id', params.id);
        if (dupErr) return send(res, 500, { error: dupErr.message });
        if ((otherCats || []).some(c => c.name.trim().toLowerCase() === normalizedName)) {
          return send(res, 409, { error: `A category named "${body.name.trim()}" already exists (category names must be unique, regardless of capitalization or spacing).` });
        }
      }
      patch.name = body.name;
    }
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
    const { data, error } = await client.from('categories').update(patch).eq('id', params.id).select().maybeSingle();
    if (error) return send(res, 400, { error: error.message });
    if (!data) return send(res, 404, { error: apiT('categoryNotFound', reqLang(req)) });
    return send(res, 200, { category: rowToCategory(data) });
  }
  const cat = findCategory(params.id, tenant.id);
  if (!cat) return send(res, 404, { error: apiT('categoryNotFound', reqLang(req)) });
  if ((body.group !== undefined && body.group !== cat.group) || (body.fulfillment !== undefined && body.fulfillment !== cat.fulfillment)) {
    return send(res, 400, { error: apiT('categoryTypeImmutable', reqLang(req)) });
  }
  if (body.platformCategory !== undefined && !PLATFORM_CATEGORIES.includes(body.platformCategory)) {
    return send(res, 400, { error: `platformCategory must be one of: ${PLATFORM_CATEGORIES.join(', ')}.` });
  }
  const transErr = mergeTranslations(cat, body.translations, ['name', 'description']);
  if (transErr) return send(res, 400, { error: transErr });
  if (body.name !== undefined) {
    const normalizedName = body.name.trim().toLowerCase();
    if (normalizedName !== cat.name.trim().toLowerCase() && db.categories.some(c => c.tenantId === tenant.id && c.id !== cat.id && c.name.trim().toLowerCase() === normalizedName)) {
      return send(res, 409, { error: `A category named "${body.name.trim()}" already exists (category names must be unique, regardless of capitalization or spacing).` });
    }
  }
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
    if (!existing) return send(res, 404, { error: apiT('categoryNotFound', reqLang(req)) });
    const { count } = await client.from('products').select('id', { count: 'exact', head: true }).eq('category_id', params.id);
    if (count > 0) return send(res, 409, { error: `This category can't be deleted because ${count} product(s) still use it. Either edit ${count === 1 ? 'that product' : 'those products'} and change their category, or delete ${count === 1 ? 'it' : 'them'} first — then try deleting this category again.` });
    const { error } = await client.from('categories').delete().eq('id', params.id);
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { ok: true, removed: 1 });
  }
  const cat = findCategory(params.id, tenant.id);
  if (!cat) return send(res, 404, { error: apiT('categoryNotFound', reqLang(req)) });
  const dependentCount = db.products.filter(p => p.tenantId === tenant.id && p.categoryId === cat.id).length;
  if (dependentCount > 0) {
    return send(res, 409, { error: `This category can't be deleted because ${dependentCount} product(s) still use it. Either edit ${dependentCount === 1 ? 'that product' : 'those products'} and change their category, or delete ${dependentCount === 1 ? 'it' : 'them'} first — then try deleting this category again.` });
  }
  db.categories = db.categories.filter(c => !(c.id === cat.id && c.tenantId === tenant.id));
  await persist();
  send(res, 200, { ok: true });
});

route('POST', '/api/admin/products', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const { name, description, price, categoryId, stock, translations, externalUrl, meetingLink } = body;
  if (AUTH_DRIVER === 'supabase') {
    if (!name || typeof price !== 'number' || price < 0) return send(res, 400, { error: apiT('nameNonNegPriceRequired', reqLang(req)) });
    const client = supabaseForRequest(bearerToken(req));
    const { data: cat, error: catErr } = await client.from('categories').select('id').eq('id', categoryId).eq('tenant_id', tenant.id).maybeSingle();
    if (catErr) return send(res, 500, { error: catErr.message });
    if (!cat) return send(res, 400, { error: apiT('productFieldsRequired', reqLang(req)) });
    const { data: sub, error: subErr } = await client.from('current_subscriptions').select('*, plans(*)').eq('tenant_id', tenant.id).maybeSingle();
    if (subErr) return send(res, 500, { error: subErr.message });
    const maxProducts = sub && sub.plans ? sub.plans.max_products : 10; // no active subscription found = treat as the most restrictive (Starter-equivalent) default
    if (maxProducts !== null) {
      const { count } = await client.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
      if (count >= maxProducts) return send(res, 403, { error: `Your plan allows up to ${maxProducts} products. Upgrade your subscription to add more.` });
    }
    // sku is deliberately never sent here — the column's own default
    // (nextval on a global sequence, see schema.sql) assigns it, so it's
    // impossible for application code to accidentally collide, skip, or
    // let an admin set an arbitrary non-unique value.
    const row = productToRow({ name, description, price, categoryId, stock, externalUrl, meetingLink, translations: {} }, tenant.id);
    const transErr = mergeTranslations(row, translations, ['name', 'description']);
    if (transErr) return send(res, 400, { error: transErr });
    const { data, error } = await client.from('products').insert(row).select('*, categories(*)').single();
    if (error) return send(res, 400, { error: error.message });
    return send(res, 201, { product: rowToProduct({ ...data, product_images: [] }) });
  }
  if (!name || typeof price !== 'number' || price < 0 || !findCategory(categoryId, tenant.id)) {
    return send(res, 400, { error: apiT('productFieldsRequired', reqLang(req)) });
  }
  const tier = SUBSCRIPTION_TIERS[tenant.subscriptionTier || 'starter'];
  const currentCount = db.products.filter(p => p.tenantId === tenant.id).length;
  if (tier.maxProducts !== null && currentCount >= tier.maxProducts) {
    return send(res, 403, { error: `Your ${tenant.subscriptionTier || 'starter'} plan allows up to ${tier.maxProducts} products. Upgrade your subscription tier to add more.` });
  }
  // A single counter shared across every tenant in the local fallback driver
  // too — mirrors the real database's global sequence, so the local/testing
  // path can't silently drift from "globally unique" into "unique per store."
  db.nextSkuNumber = (db.nextSkuNumber || 0) + 1;
  const sku = `HDM-${String(db.nextSkuNumber).padStart(6, '0')}`;
  const product = { id: newId('p'), tenantId: tenant.id, name, sku, description: description || '', price, categoryId, stock, externalUrl: externalUrl || '', meetingLink: meetingLink || '', images: [] };
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
    if (!existing) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
    if (body.categoryId !== undefined) {
      const { data: cat, error: catErr } = await client.from('categories').select('id').eq('id', body.categoryId).eq('tenant_id', tenant.id).maybeSingle();
      if (catErr) return send(res, 500, { error: catErr.message });
      if (!cat) return send(res, 400, { error: apiT('categoryMustBelongToStore', reqLang(req)) });
    }
    // sku is intentionally never editable here — it's the product's
    // permanent business identifier once assigned at creation.
    const patch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.price !== undefined) patch.price = body.price;
    if (body.categoryId !== undefined) patch.category_id = body.categoryId;
    if (body.stock !== undefined) patch.stock = body.stock;
    if (body.externalUrl !== undefined) patch.external_url = body.externalUrl;
    if (body.meetingLink !== undefined) patch.meeting_link = body.meetingLink;
    if (body.translations) {
      const wrapper = { translations: existing.translations || {} };
      const err = mergeTranslations(wrapper, body.translations, ['name', 'description']);
      if (err) return send(res, 400, { error: err });
      patch.translations = wrapper.translations;
    }
    const { data, error } = await client.from('products').update(patch).eq('id', params.id).select('*, categories(*)').single();
    if (error) return send(res, 400, { error: error.message });
    // If the meeting link was just set or changed, notify every client who
    // already has a paid, unrefunded booking for this product — they
    // shouldn't have to re-book or re-pay just because the link arrived
    // after their purchase rather than before it.
    if (body.meetingLink !== undefined) {
      console.log(`[meeting-link-notify] product patch included meetingLink="${body.meetingLink}" (previous was "${existing.meeting_link || ''}") — will${body.meetingLink && body.meetingLink !== existing.meeting_link ? '' : ' NOT'} trigger notification`);
    }
    if (body.meetingLink !== undefined && body.meetingLink && body.meetingLink !== existing.meeting_link) {
      console.log(`[meeting-link-notify] triggered — product "${data.name}" (${params.id}), new link: ${body.meetingLink}`);
      try {
        const { data: affectedItems, error: lookupErr } = await supabaseAdmin().from('order_items').select('order_id, orders(client_id)').eq('product_id', params.id).eq('fulfillment', 'booking').neq('status', 'refunded');
        if (lookupErr) { console.error('[meeting-link-notify] order_items lookup failed:', lookupErr.message); }
        console.log(`[meeting-link-notify] found ${(affectedItems || []).length} eligible order_items row(s)`);
        const notifiedClientIds = new Set();
        for (const item of (affectedItems || [])) {
          const clientId = item.orders && item.orders.client_id;
          console.log(`[meeting-link-notify] order_item -> order_id=${item.order_id}, resolved client_id=${clientId || 'MISSING'}`);
          if (!clientId || notifiedClientIds.has(clientId)) continue; // one email per client even if they booked this product more than once
          notifiedClientIds.add(clientId);
          const { data: clientUser, error: userLookupErr } = await supabaseAdmin().auth.admin.getUserById(clientId);
          if (userLookupErr) console.error(`[meeting-link-notify] getUserById failed for ${clientId}:`, userLookupErr.message);
          if (clientUser && clientUser.user) {
            console.log(`[meeting-link-notify] sending to ${clientUser.user.email}...`);
            const meetLang = await getRecipientLang(clientUser.user.email);
            const subject = emailT(EMAIL_I18N, 'meetingLinkAvailableSubject', meetLang)(data.name);
            const text = emailT(EMAIL_I18N, 'meetingLinkAvailableBody', meetLang)(data.name, body.meetingLink, tenant.name);
            const { error: insertErr } = await supabaseAdmin().from('notifications').insert({ tenant_id: tenant.id, type: 'meeting_link_available', to_email: clientUser.user.email, subject, body: text });
            if (insertErr) console.error('[meeting-link-notify] notifications insert failed:', insertErr.message);
            const emailResult = await sendRealEmail({ to: clientUser.user.email, subject, text, html: wrapEmailHtml(text, meetLang) }); // best-effort — never blocks the product save if email delivery has a problem
            console.log(`[meeting-link-notify] sendRealEmail result for ${clientUser.user.email}:`, JSON.stringify(emailResult));
          } else {
            console.log(`[meeting-link-notify] no auth user found for client_id=${clientId} — skipping`);
          }
        }
      } catch (e) { console.error('[meeting-link-notify] failed:', e.message, e.stack); }
    }
    return send(res, 200, { product: rowToProduct({ ...data, product_images: [] }) });
  }
  const p = findProduct(params.id, tenant.id);
  if (!p) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
  if (body.categoryId !== undefined && !findCategory(body.categoryId, tenant.id)) {
    return send(res, 400, { error: apiT('categoryMustBelongToStore', reqLang(req)) });
  }
  // sku is intentionally excluded from the allowed list below — permanent once assigned.
  const transErr = mergeTranslations(p, body.translations, ['name', 'description']);
  if (transErr) return send(res, 400, { error: transErr });
  const allowed = ['name', 'description', 'price', 'categoryId', 'stock', 'externalUrl', 'meetingLink'];
  const oldMeetingLink = p.meetingLink;
  allowed.forEach(key => { if (body[key] !== undefined) p[key] = body[key]; });
  await persist();
  if (body.meetingLink !== undefined && body.meetingLink && body.meetingLink !== oldMeetingLink) {
    const affectedOrders = db.orders.filter(o => o.tenantId === tenant.id && o.items.some(i => i.productId === p.id && i.fulfillment === 'booking' && i.status !== 'refunded'));
    const notifiedClientIds = new Set();
    for (const o of affectedOrders) {
      if (notifiedClientIds.has(o.clientId)) continue;
      notifiedClientIds.add(o.clientId);
      const meetLang = await getRecipientLang(o.clientEmail);
      const subject = emailT(EMAIL_I18N, 'meetingLinkAvailableSubject', meetLang)(p.name);
      const text = emailT(EMAIL_I18N, 'meetingLinkAvailableBody', meetLang)(p.name, body.meetingLink, tenant.name);
      db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'meeting_link_available', to: o.clientEmail, subject, body: text, sentAt: Date.now() });
      try { await sendRealEmail({ to: o.clientEmail, subject, text, html: wrapEmailHtml(text, meetLang) }); } catch { /* best-effort */ }
    }
  }
  send(res, 200, { product: p });
});

route('DELETE', '/api/admin/products/:id/digital-file', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: existing, error: findErr } = await client.from('download_products').select('storage_path, bundle_storage_path').eq('product_id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: apiT('noFileAttached', reqLang(req)) });
    const { error: storageErr } = await supabaseAdmin().storage.from('digital-files').remove([existing.storage_path]);
    if (storageErr) console.error('[digital file storage delete failed]', storageErr.message); // still remove the DB row below even if the storage object was already gone
    if (existing.bundle_storage_path) await supabaseAdmin().storage.from('digital-files').remove([existing.bundle_storage_path]).catch(() => {});
    const { error: deleteErr } = await client.from('download_products').delete().eq('product_id', params.id);
    if (deleteErr) return send(res, 400, { error: deleteErr.message });
    return send(res, 200, { ok: true });
  }
  const existing = (db.downloadProducts || []).find(d => d.productId === params.id && d.tenantId === tenant.id);
  if (!existing) return send(res, 404, { error: apiT('noFileAttached', reqLang(req)) });
  try { fs.unlinkSync(path.join(UPLOADS_DIR, tenant.id, 'digital', existing.diskFilename)); } catch { /* already gone — fine */ }
  db.downloadProducts = db.downloadProducts.filter(d => d.productId !== params.id);
  await persist();
  send(res, 200, { ok: true });
});

route('GET', '/api/admin/products/:id/stock-history', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data, error } = await client.from('product_stock_movements').select('*').eq('tenant_id', tenant.id).eq('product_id', params.id).order('created_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { movements: data.map(m => ({ id: m.id, change: m.change, reason: m.reason, orderId: m.order_id, createdBy: m.created_by, createdAt: m.created_at })) });
  }
  const movements = db.stockMovements.filter(m => m.tenantId === tenant.id && m.productId === params.id).sort((a, b) => b.createdAt - a.createdAt);
  send(res, 200, { movements });
});

/**
 * Restocking a product — the "Adding Stock" case from the inventory spec.
 * Always increases stock and always records a movement; the actual sale-side
 * enforcement (checking sufficiency, rejecting overselling) lives in the
 * checkout route, which is where a sale actually happens.
 */
route('POST', '/api/admin/products/:id/stock', { hostScope: 'tenant', auth: true, roles: ['admin', 'employee'] }, async (req, res, params, body, query, user, tenant) => {
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount <= 0) return send(res, 400, { error: apiT('amountPositiveWhole', reqLang(req)) });
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: existing, error: findErr } = await client.from('products').select('id, stock').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!existing) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
    if (existing.stock === null) return send(res, 400, { error: apiT('productNotStockTracked', reqLang(req)) });
    const { data: newStock, error: adjErr } = await client.rpc('adjust_product_stock', {
      p_product_id: params.id, p_tenant_id: tenant.id, p_change: amount, p_reason: 'restock', p_created_by: user.name,
    });
    if (adjErr) return send(res, 500, { error: adjErr.message });
    return send(res, 200, { stock: newStock });
  }
  const p = findProduct(params.id, tenant.id);
  if (!p) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
  if (typeof p.stock !== 'number') return send(res, 400, { error: apiT('productNotStockTracked', reqLang(req)) });
  p.stock += amount;
  db.stockMovements.push({ id: newId('stkmv'), tenantId: tenant.id, productId: p.id, change: amount, reason: 'restock', orderId: null, createdBy: user.name, createdAt: Date.now() });
  await persist();
  send(res, 200, { stock: p.stock });
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
const ALLOWED_IMAGE_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/tiff': 'tiff', 'image/svg+xml': 'svg' };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB decoded — comfortably under the 5MB raw request-body cap

const MAX_DIGITAL_FILE_BYTES = 20 * 1024 * 1024; // 20MB decoded — digital goods are typically larger than a product photo

function extractExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Uploads a digital file to real Supabase Storage, records it in
 * download_products, and then explicitly verifies both sides actually
 * persisted — this is not just "no error was thrown," it's a genuine
 * read-back confirming the file exists in Storage AND the table row is
 * correctly linked to the right product, matching what the checklist asks
 * for ("verify the file exists... the record exists... correctly linked").
 * Throws with a clear message on any failure; returns the saved row on success.
 */

async function uploadDigitalFileToSupabase(client, tenant, productId, { filename, mimeType, buffer, uploadedBy, isCompressed, originalFilename, sku }) {
  const admin = supabaseAdmin();
  const describedFilename = isCompressed && originalFilename ? originalFilename : filename;
  const ext = extractExtension(describedFilename);
  const storagePath = `${tenant.id}/products/${productId}/${newId('file')}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)}`;
  const { error: uploadErr } = await admin.storage.from('digital-files').upload(storagePath, buffer, { contentType: mimeType || 'application/octet-stream' });
  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  const dirPath = storagePath.substring(0, storagePath.lastIndexOf('/'));
  const bareName = storagePath.substring(storagePath.lastIndexOf('/') + 1);
  const { data: listing, error: listErr } = await admin.storage.from('digital-files').list(dirPath, { search: bareName });
  if (listErr || !listing || !listing.some(f => f.name === bareName)) {
    throw new Error('The file upload appeared to succeed, but could not be verified in Storage afterward.');
  }

  // Re-uploading replaces the product's one current file — upsert on the
  // unique product_id, rather than accumulating multiple rows over time.
  const { data: downloadProduct, error: upsertErr } = await client.from('download_products').upsert({
    product_id: productId, tenant_id: tenant.id, sku: sku || null, storage_provider: 'supabase', storage_bucket: 'digital-files',
    storage_path: storagePath, original_filename: describedFilename, extension: ext,
    mime_type: mimeType || 'application/octet-stream', size_bytes: buffer.length, is_compressed: !!isCompressed, upload_status: 'completed', uploaded_by: uploadedBy, uploaded_at: new Date().toISOString(),
  }, { onConflict: 'product_id' }).select().maybeSingle();
  if (upsertErr) throw new Error(`Database record failed: ${upsertErr.message}`);
  if (!downloadProduct) throw new Error('File uploaded but its record could not be saved.');
  if (downloadProduct.product_id !== productId) throw new Error('The saved record is not correctly linked to this product.');

  return downloadProduct;
}

/**
 * STEP 1 of large-file upload: generates a real signed upload URL directly
 * from Supabase Storage. The browser then PUTs the file straight to that URL
 * — the file's bytes never pass through this server or its memory at all,
 * which is what actually makes gigabyte-scale uploads possible (no artificial
 * size limit here, because there is nothing here to hold the file in the
 * first place; the only true ceiling is whatever Supabase's own plan allows).
 */
route('POST', '/api/admin/products/:id/digital-file/prepare-upload', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 400, { error: apiT('largeUploadsSupabaseOnly', reqLang(req)) });
  const { filename } = body;
  if (!filename) return send(res, 400, { error: apiT('filenameRequired', reqLang(req)) });
  const client = supabaseForRequest(bearerToken(req));
  const { data: product, error: findErr } = await client.from('products').select('id, categories(fulfillment)').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
  if (findErr) return send(res, 500, { error: findErr.message });
  if (!product) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
  if (product.categories.fulfillment !== 'download') return send(res, 400, { error: apiT('digitalFileWrongCategory', reqLang(req)) });

  const storagePath = `${tenant.id}/products/${params.id}/${newId('file')}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)}`;
  const { data: signed, error: signErr } = await supabaseAdmin().storage.from('digital-files').createSignedUploadUrl(storagePath);
  if (signErr) return send(res, 400, { error: signErr.message });
  // Supabase's own docs specifically recommend the direct storage hostname
  // (project-id.storage.supabase.co) rather than the regular project URL for
  // large-file resumable uploads — using the regular URL is a documented
  // source of uploads failing/corrupting partway through for files above ~6MB.
  const projectRef = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
  const tusEndpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  send(res, 200, { storagePath, signedUrl: signed.signedUrl, token: signed.token, tusEndpoint, anonKey: process.env.SUPABASE_ANON_KEY });
});

/**
 * STEP 2: called once the browser's direct upload to the signed URL has
 * finished. This does the same real verification as the small-file path —
 * confirms the object genuinely exists in Storage before trusting it — then
 * writes the metadata row. No file bytes are read here, only a lightweight
 * existence check, so this step stays fast and memory-safe regardless of
 * how large the actual file was.
 */
route('POST', '/api/admin/products/:id/digital-file/confirm-upload', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER !== 'supabase') return send(res, 400, { error: apiT('largeUploadsSupabaseOnly', reqLang(req)) });
  const { storagePath, filename, mimeType, sizeBytes, isCompressed, originalFilename } = body;
  if (!storagePath || !filename || typeof sizeBytes !== 'number') return send(res, 400, { error: apiT('storagePathFilenameSizeRequired', reqLang(req)) });
  const client = supabaseForRequest(bearerToken(req));
  const { data: product, error: findErr } = await client.from('products').select('id, sku').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
  if (findErr) return send(res, 500, { error: findErr.message });
  if (!product) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });

  const admin = supabaseAdmin();
  const dirPath = storagePath.substring(0, storagePath.lastIndexOf('/'));
  const bareName = storagePath.substring(storagePath.lastIndexOf('/') + 1);
  const { data: listing, error: listErr } = await admin.storage.from('digital-files').list(dirPath, { search: bareName });
  if (listErr || !listing || !listing.some(f => f.name === bareName)) {
    return send(res, 400, { error: apiT('uploadNotVerifiedStorage', reqLang(req)) });
  }

  // When compressed, originalFilename/extension describe what the customer
  // gets after extracting — not the .zip wrapper's own name.
  const describedFilename = isCompressed && originalFilename ? originalFilename : filename;
  const { data: downloadProduct, error: upsertErr } = await client.from('download_products').upsert({
    product_id: params.id, tenant_id: tenant.id, sku: product.sku || null, storage_provider: 'supabase', storage_bucket: 'digital-files',
    storage_path: storagePath, original_filename: describedFilename, extension: extractExtension(describedFilename),
    mime_type: mimeType || 'application/octet-stream', size_bytes: sizeBytes, is_compressed: !!isCompressed, upload_status: 'completed', uploaded_by: user.name, uploaded_at: new Date().toISOString(),
  }, { onConflict: 'product_id' }).select().maybeSingle();
  if (upsertErr) return send(res, 400, { error: upsertErr.message });
  if (!downloadProduct) return send(res, 500, { error: apiT('uploadVerifiedRecordFailed', reqLang(req)) });
  send(res, 200, { fileMeta: { filename: downloadProduct.original_filename, extension: downloadProduct.extension, mimeType: downloadProduct.mime_type, size: downloadProduct.size_bytes, isCompressed: downloadProduct.is_compressed, uploadStatus: downloadProduct.upload_status, uploadedBy: downloadProduct.uploaded_by, sku: downloadProduct.sku, verified: true } });
});

route('POST', '/api/admin/products/:id/digital-file', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const { mimeType, dataBase64, filename, isCompressed, originalFilename } = body;
  if (!filename) return send(res, 400, { error: apiT('filenameRequired', reqLang(req)) });
  if (!dataBase64) return send(res, 400, { error: apiT('dataBase64Required', reqLang(req)) });
  const cleanedBase64 = dataBase64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanedBase64) || cleanedBase64.length === 0) {
    return send(res, 400, { error: apiT('dataBase64Invalid', reqLang(req)) });
  }
  const buffer = Buffer.from(cleanedBase64, 'base64');
  if (buffer.length > MAX_DIGITAL_FILE_BYTES) return send(res, 413, { error: `File is too large — max ${MAX_DIGITAL_FILE_BYTES / (1024 * 1024)}MB.` });

  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: product, error: findErr } = await client.from('products').select('id, sku, category_id, categories(fulfillment)').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!product) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
    if (product.categories.fulfillment !== 'download') return send(res, 400, { error: apiT('digitalFileWrongCategory', reqLang(req)) });
    try {
      const downloadProduct = await uploadDigitalFileToSupabase(client, tenant, params.id, { filename, mimeType, buffer, uploadedBy: user.name, isCompressed, originalFilename, sku: product.sku });
      return send(res, 200, { fileMeta: { filename: downloadProduct.original_filename, extension: downloadProduct.extension, mimeType: downloadProduct.mime_type, size: downloadProduct.size_bytes, isCompressed: downloadProduct.is_compressed, uploadStatus: downloadProduct.upload_status, uploadedBy: downloadProduct.uploaded_by, sku: downloadProduct.sku, verified: true } });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }

  const product = findProduct(params.id, tenant.id);
  if (!product) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
  const category = findCategory(product.categoryId, tenant.id);
  if (!category || category.fulfillment !== 'download') return send(res, 400, { error: apiT('digitalFileWrongCategory', reqLang(req)) });
  const digitalDir = path.join(UPLOADS_DIR, tenant.id, 'digital');
  fs.mkdirSync(digitalDir, { recursive: true });
  const diskFilename = `${newId('file')}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)}`;
  fs.writeFileSync(path.join(digitalDir, diskFilename), buffer);
  if (!fs.existsSync(path.join(digitalDir, diskFilename))) return send(res, 500, { error: apiT('fileUploadNotVerified', reqLang(req)) });
  const describedFilename = isCompressed && originalFilename ? originalFilename : filename;
  const fileMeta = { diskFilename, filename: describedFilename, extension: extractExtension(describedFilename), mimeType: mimeType || 'application/octet-stream', size: buffer.length, isCompressed: !!isCompressed, uploadStatus: 'completed', sku: product.sku || null, uploadedBy: user.name };
  // Mirrors the dedicated-table design above: one current file per product,
  // tracked in its own collection rather than as a loose field on the product.
  db.downloadProducts = (db.downloadProducts || []).filter(d => d.productId !== params.id);
  db.downloadProducts.push({ id: newId('dlp'), productId: params.id, tenantId: tenant.id, ...fileMeta, uploadedAt: Date.now() });
  await persist();
  send(res, 200, { fileMeta: { ...fileMeta, verified: true } });
});

route('POST', '/api/admin/products/:id/images', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  const { mimeType, dataBase64, filename } = body;
  const ext = ALLOWED_IMAGE_MIME[mimeType];
  if (!ext) return send(res, 400, { error: `Unsupported image type. Use one of: ${Object.keys(ALLOWED_IMAGE_MIME).join(', ')}.` });
  if (!dataBase64) return send(res, 400, { error: apiT('dataBase64Required', reqLang(req)) });
  const cleanedBase64 = dataBase64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanedBase64) || cleanedBase64.length === 0) {
    return send(res, 400, { error: apiT('dataBase64Invalid', reqLang(req)) });
  }
  const buffer = Buffer.from(cleanedBase64, 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) return send(res, 413, { error: `Image is too large — max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB per file.` });

  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: product, error: findErr } = await client.from('products').select('id, sku').eq('id', params.id).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!product) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
    const imageId = newId('img'); // used only for the storage path string below — the DB row gets its own real UUID from the table's own default, not this prefixed id
    const storagePath = `${tenant.id}/products/${imageId}.${ext}`;
    const { error: uploadErr } = await client.storage.from('product-images').upload(storagePath, buffer, { contentType: mimeType });
    if (uploadErr) return send(res, 400, { error: uploadErr.message });
    const { data: imageRow, error: insertErr } = await client.from('product_images').insert({
      product_id: params.id, tenant_id: tenant.id, sku: product.sku || null, storage_path: storagePath,
      filename: (filename || `${imageId}.${ext}`).slice(0, 120), mime_type: mimeType, size_bytes: buffer.length, uploaded_by: user.name,
    }).select().maybeSingle();
    if (insertErr || !imageRow) {
      // The file already landed in Storage but its database record failed —
      // remove the orphaned object rather than leaving a file with no
      // corresponding row (which "failed uploads must not create incomplete
      // records" specifically rules out).
      await client.storage.from('product-images').remove([storagePath]);
      return send(res, insertErr ? 400 : 500, { error: insertErr ? insertErr.message : 'Image record could not be saved — please try again.' });
    }
    const image = { id: imageRow.id, url: `${process.env.SUPABASE_URL}/storage/v1/object/public/product-images/${storagePath}`, filename: imageRow.filename, mimeType: imageRow.mime_type, size: imageRow.size_bytes, uploadedBy: imageRow.uploaded_by, uploadedAt: imageRow.uploaded_at };
    const { data: fullProduct } = await client.from('products').select('*, categories(*), product_images(*), download_products(*)').eq('id', params.id).maybeSingle();
    return send(res, 201, { image, product: fullProduct ? rowToProduct(fullProduct) : null });
  }

  const product = findProduct(params.id, tenant.id);
  if (!product) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
  const tenantDir = path.join(UPLOADS_DIR, tenant.id);
  fs.mkdirSync(tenantDir, { recursive: true });
  const imageId = newId('img');
  const diskFilename = `${imageId}.${ext}`;
  fs.writeFileSync(path.join(tenantDir, diskFilename), buffer);
  if (!fs.existsSync(path.join(tenantDir, diskFilename))) return send(res, 500, { error: apiT('imageNotVerifiedDisk', reqLang(req)) });

  const image = { id: imageId, url: `/uploads/${tenant.id}/${diskFilename}`, filename: (filename || diskFilename).slice(0, 120), mimeType, size: buffer.length, sku: product.sku || null, uploadedBy: user.name, uploadedAt: Date.now() };
  product.images = product.images || [];
  product.images.push(image);
  await persist();
  send(res, 201, { image, product });
});

route('DELETE', '/api/admin/products/:id/images/:imageId', { hostScope: 'tenant', auth: true, roles: ['admin'] }, async (req, res, params, body, query, user, tenant) => {
  if (AUTH_DRIVER === 'supabase') {
    const client = supabaseForRequest(bearerToken(req));
    const { data: imageRow, error: findErr } = await client.from('product_images').select('storage_path').eq('id', params.imageId).eq('tenant_id', tenant.id).maybeSingle();
    if (findErr) return send(res, 500, { error: findErr.message });
    if (!imageRow) return send(res, 404, { error: apiT('imageNotFoundOnProduct', reqLang(req)) });
    const { error: storageErr } = await client.storage.from('product-images').remove([imageRow.storage_path]);
    if (storageErr) console.error('[product image storage delete failed]', storageErr.message); // still remove the DB row below even if the storage object was already gone
    const { error: deleteErr } = await client.from('product_images').delete().eq('id', params.imageId);
    if (deleteErr) return send(res, 400, { error: deleteErr.message });
    return send(res, 200, { ok: true });
  }
  const product = findProduct(params.id, tenant.id);
  if (!product) return send(res, 404, { error: apiT('productNotFound', reqLang(req)) });
  const image = (product.images || []).find(i => i.id === params.imageId);
  if (!image) return send(res, 404, { error: apiT('imageNotFoundOnProduct', reqLang(req)) });
  product.images = product.images.filter(i => i.id !== params.imageId);
  const diskPath = path.join(UPLOADS_DIR, tenant.id, path.basename(image.url));
  try { fs.unlinkSync(diskPath); } catch { /* already gone — fine */ }
  await persist();
  send(res, 200, { ok: true });
});

/* =========================================================
   HTTP SERVER — tenant resolution, auth/role enforcement, static files
========================================================= */
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

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
      return send(res, 404, { error: apiT('imageNotFound', reqLang(req)) });
    }
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    const mime = Object.entries(ALLOWED_IMAGE_MIME).find(([, e]) => e === ext);
    res.writeHead(200, { 'Content-Type': mime ? mime[0] : 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000', ...SECURITY_HEADERS });
    return fs.createReadStream(fullPath).pipe(res);
  }

  const match = matchRoute(req.method, url.pathname);

  if (match) {
    const { route: r, params } = match;
    if (r.opts.hostScope !== 'platform' && !hostCtx.isPlatform && unknownStore) return send(res, 404, { error: apiT('storeNotFoundCheckSubdomain', reqLang(req)) });
    if (r.opts.hostScope === 'tenant' && hostCtx.isPlatform) return send(res, 404, { error: apiT('storeNotFoundCheckSubdomain', reqLang(req)) });
    if (r.opts.hostScope === 'platform' && !hostCtx.isPlatform) return send(res, 404, { error: apiT('notAvailableOnStoreSubdomain', reqLang(req)) });

    let user = null;
    if (r.opts.auth) {
      user = AUTH_DRIVER === 'supabase' ? await authenticateSupabase(req, tenant, hostCtx) : authenticate(req);
      if (!user) return send(res, 401, { error: apiT('loginRequired', reqLang(req)) });
      if (r.opts.hostScope === 'tenant' && user.tenantId !== tenant.id) return send(res, 403, { error: apiT('accountNotThisStore', reqLang(req)) });
      if (r.opts.hostScope === 'platform' && (user.role !== 'superadmin' || user.tenantId !== null)) return send(res, 403, { error: apiT('platformAccessOnly', reqLang(req)) });
      if (r.opts.roles && !r.opts.roles.includes(user.role)) return send(res, 403, { error: apiT('roleNoAccess', reqLang(req)) });
      if (user.email) captureRecipientLang(user.email, reqLang(req)); // fire-and-forget, see captureRecipientLang's own comment for why this exists
    }
    try {
      const body = r.opts.rawBody ? await readRawBody(req) : (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {});
      await r.handler(req, res, params, body, url.searchParams, user, tenant, hostCtx);
    } catch (err) {
      console.error(err);
      send(res, err.statusCode || 500, { error: err.statusCode ? err.message : 'Internal server error.' });
    }
    return;
  }

  if (req.method === 'GET') {
    if (unknownStore) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Store not found. Check the subdomain, or visit the main site to create one.'); }
    const served = serveStatic(res, hostCtx.isPlatform ? PLATFORM_PUBLIC_DIR : TENANT_PUBLIC_DIR, url.pathname);
    if (served !== false) return;
  }
  send(res, 404, { error: apiT('notFound', reqLang(req)) });
});

if (require.main === module) {
  (async () => {
    await initDb();
    server.listen(PORT, () => console.log(`Hadam platform listening on http://localhost:${PORT} (base domain: ${BASE_DOMAIN}, db driver: ${process.env.HADAM_DB_DRIVER || 'file'})`));
    // Real periodic check for a real running server. An hour is frequent enough that a
    // reminder fires within an hour of crossing a threshold, without being wasteful; a real
    // production deployment might prefer an external daily cron hitting the endpoint above instead.
    setInterval(() => { checkSubscriptionAlerts().catch(err => console.error('Subscription check failed:', err)); }, 60 * 60 * 1000);
    setInterval(() => { checkDeliveryConfirmationReminders().catch(err => console.error('Delivery reminder check failed:', err)); }, 60 * 60 * 1000);
  })().catch(err => { console.error('Failed to start:', err); process.exit(1); });
}
module.exports = { server, initDb, resolveHost, hashPassword, verifyPassword, signToken, verifyToken, refreshItemStatus, DB_PATH, SEED_PATH, getDb: () => db, applyPaymentOutcomeToOrder, applyPaymentOutcomeToOrderSupabase, reconcilePaymentByProviderReference, tryClaimPaymentTransition };
