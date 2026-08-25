/**
 * lib/payments.js — Phase 1 of the multi-provider payment architecture.
 *
 * This module is the provider-independent payment abstraction: create a
 * payment record, transition its status, read payments for an order — all
 * without any single caller needing to know whether the eventual provider
 * is Stripe, PayPal, a bank transfer, or cash. No real provider is wired
 * up here; this phase only builds and tests the foundation those
 * providers will be built against in later phases.
 *
 * Supports both drivers this app already runs on (Supabase and the local
 * file store), matching the existing convention in server.js rather than
 * introducing a different architecture style.
 */

const VALID_METHODS = ['stripe', 'paypal', 'bank_transfer', 'cash', 'simulated'];
const VALID_STATUSES = ['pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'];

// The state machine: which status a payment may move to FROM its current
// one. A terminal status (paid, failed, cancelled, refunded) has no
// forward transitions except the explicit refund path from 'paid'.
// 'partially_refunded' can still move to 'refunded' (a second, final
// refund covering what was left) but nothing can move backward into
// 'pending' or 'authorized' once money has actually moved.
const ALLOWED_TRANSITIONS = {
  pending: ['authorized', 'paid', 'failed', 'cancelled'],
  authorized: ['paid', 'failed', 'cancelled'],
  paid: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded', 'partially_refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
};

function newId(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`; }

/**
 * Creates a new payment record. Does NOT decide whether the payment
 * succeeded — that's the caller's job (today: the simulated card check;
 * later: an actual provider response) — this only records the outcome
 * the caller already determined, in the shared, provider-independent shape.
 *
 * @param {object} db - the in-memory db object (local file driver) or null (Supabase)
 * @param {object} supabaseAdminClient - a service-role Supabase client, or null (local driver)
 * @param {object} fields - { tenantId, orderId, clientId, method, status, amount, currency, providerReference, idempotencyKey, metadata, confirmedBy }
 */
async function createPayment({ db, supabaseAdminClient, tenantId, orderId, clientId, method, status = 'pending', amount, currency = 'usd', providerReference = null, idempotencyKey = null, metadata = {}, confirmedBy = null }) {
  if (!VALID_METHODS.includes(method)) throw new Error(`Invalid payment method: ${method}`);
  if (!VALID_STATUSES.includes(status)) throw new Error(`Invalid payment status: ${status}`);
  if (typeof amount !== 'number' || amount < 0) throw new Error('Payment amount must be a non-negative number.');

  const now = new Date();
  const payment = {
    id: newId('pay'),
    tenantId, orderId, clientId, method, status, amount, currency,
    providerReference, idempotencyKey, metadata, confirmedBy,
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  };

  if (supabaseAdminClient) {
    // Idempotency: if a key is supplied and a row with the same
    // (tenant, method, key) already exists, return that existing row
    // instead of creating a duplicate — this is what the unique index in
    // the schema enforces at the database level; catching it here too
    // gives a clean, expected return value instead of a raw constraint
    // violation bubbling up to the caller.
    if (idempotencyKey) {
      const { data: existing } = await supabaseAdminClient.from('payments').select('*').eq('tenant_id', tenantId).eq('method', method).eq('idempotency_key', idempotencyKey).maybeSingle();
      if (existing) return rowToPayment(existing);
    }
    const { data, error } = await supabaseAdminClient.from('payments').insert({
      tenant_id: tenantId, order_id: orderId, client_id: clientId, method, status, amount, currency: currency.toLowerCase(),
      provider_reference: providerReference, idempotency_key: idempotencyKey, metadata, confirmed_by: confirmedBy,
    }).select().single();
    if (error) throw new Error(error.message);
    return rowToPayment(data);
  }

  // Local file driver.
  db.payments = db.payments || [];
  if (idempotencyKey) {
    const existing = db.payments.find(p => p.tenantId === tenantId && p.method === method && p.idempotencyKey === idempotencyKey);
    if (existing) return existing;
  }
  db.payments.push(payment);
  return payment;
}

/**
 * Moves a payment to a new status, enforcing the state machine above.
 * Throws if the transition isn't allowed — callers should treat that as a
 * logic error to fix, not a condition to silently swallow.
 */
async function transitionPaymentStatus({ db, supabaseAdminClient, paymentId, newStatus, confirmedBy = null }) {
  if (!VALID_STATUSES.includes(newStatus)) throw new Error(`Invalid payment status: ${newStatus}`);

  if (supabaseAdminClient) {
    const { data: current, error: findErr } = await supabaseAdminClient.from('payments').select('*').eq('id', paymentId).maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!current) throw new Error('Payment not found.');
    assertTransitionAllowed(current.status, newStatus);
    const { data, error } = await supabaseAdminClient.from('payments').update({ status: newStatus, confirmed_by: confirmedBy, updated_at: new Date().toISOString() }).eq('id', paymentId).select().single();
    if (error) throw new Error(error.message);
    return rowToPayment(data);
  }

  db.payments = db.payments || [];
  const payment = db.payments.find(p => p.id === paymentId);
  if (!payment) throw new Error('Payment not found.');
  assertTransitionAllowed(payment.status, newStatus);
  payment.status = newStatus;
  payment.confirmedBy = confirmedBy;
  payment.updatedAt = Date.now();
  return payment;
}

function assertTransitionAllowed(fromStatus, toStatus) {
  if (fromStatus === toStatus) return; // no-op transition, harmless
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`Illegal payment status transition: ${fromStatus} -> ${toStatus}`);
  }
}

async function getPaymentsForOrder({ db, supabaseAdminClient, tenantId, orderId }) {
  if (supabaseAdminClient) {
    const { data, error } = await supabaseAdminClient.from('payments').select('*').eq('tenant_id', tenantId).eq('order_id', orderId).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(rowToPayment);
  }
  db.payments = db.payments || [];
  return db.payments.filter(p => p.tenantId === tenantId && p.orderId === orderId).sort((a, b) => a.createdAt - b.createdAt);
}

function rowToPayment(row) {
  return {
    id: row.id, tenantId: row.tenant_id, orderId: row.order_id, clientId: row.client_id,
    method: row.method, status: row.status, amount: Number(row.amount), currency: row.currency,
    providerReference: row.provider_reference, idempotencyKey: row.idempotency_key,
    metadata: row.metadata || {}, confirmedBy: row.confirmed_by,
    createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at).getTime(),
  };
}

module.exports = { VALID_METHODS, VALID_STATUSES, ALLOWED_TRANSITIONS, createPayment, transitionPaymentStatus, getPaymentsForOrder, assertTransitionAllowed };
