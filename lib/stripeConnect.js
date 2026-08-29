/**
 * lib/stripeConnect.js — Phase 2 of the payment architecture.
 *
 * Stripe Connect (Express accounts, Stripe-hosted onboarding). Each tenant
 * connects their OWN Stripe account; customer payments go directly to that
 * account via PaymentIntent's transfer_data.destination. Hadam's platform
 * Stripe account never holds customer funds and never sees a store's
 * banking/identity information — Stripe's hosted onboarding collects all
 * of that directly.
 *
 * The `stripe` client is always passed in by the caller (never constructed
 * internally) so this module is genuinely unit-testable with a fake/mock
 * client — no real network access to Stripe is required to test the logic
 * here, matching the same injectable pattern already used in
 * lib/payments.js (db / supabaseAdminClient).
 */

const { createPayment, transitionPaymentStatus } = require('./payments');

/**
 * Creates a new Express connected account for a tenant. Only the account
 * type is required — Stripe's hosted onboarding collects everything else
 * (business info, identity verification, banking details) directly from
 * the store owner; none of that ever passes through Hadam's server.
 */
async function createConnectedAccount({ stripe, tenantId }) {
  const account = await stripe.accounts.create({
    type: 'express',
    metadata: { tenantId }, // lets a webhook's account.updated event be traced back to a tenant even before we've stored the mapping, as a defensive fallback
  });
  return account.id; // e.g. 'acct_1AbC...' — a public identifier, not a secret
}

/**
 * Creates a short-lived, single-use onboarding link for a connected
 * account. The store admin is redirected here to complete Stripe's own
 * hosted form. Links expire after a few minutes — if unused, the caller
 * just requests a fresh one; nothing is lost on the Stripe side.
 */
async function createOnboardingLink({ stripe, stripeAccountId, returnUrl, refreshUrl }) {
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

/**
 * Reads a connected account's actual state from Stripe and maps it to our
 * four-value status. This is the ONLY correct source of truth for whether
 * a store can actually accept payments — never inferred from, e.g., "the
 * store owner clicked a button saying they finished onboarding."
 */
function mapAccountStatus(stripeAccount) {
  if (!stripeAccount) return 'not_connected';
  if (stripeAccount.charges_enabled && stripeAccount.payouts_enabled) return 'connected';
  if (stripeAccount.requirements && stripeAccount.requirements.disabled_reason) return 'restricted';
  return 'pending';
}

/**
 * Creates a PaymentIntent for a specific store's connected account. The
 * money is routed directly to that store (transfer_data.destination) —
 * Hadam's own platform account is never the recipient. application_fee_amount
 * is intentionally omitted for now (no platform fee), per the explicit
 * product decision to keep fees disabled until deliberately turned on.
 */
async function createPaymentIntent({ stripe, stripeAccountId, amount, currency = 'usd' }) {
  // Stripe amounts are in the smallest currency unit (cents for usd).
  const amountInCents = Math.round(amount * 100);
  const intent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency,
    transfer_data: { destination: stripeAccountId },
  });
  return intent;
}

/**
 * Verifies a webhook request's signature against the raw request body.
 * Throws if verification fails — callers must treat that as "reject the
 * request", never as "process it anyway." Requires the exact, unparsed
 * request body (see readRawBody in server.js) — signature verification
 * breaks the instant the body is JSON-parsed and re-serialized.
 */
function verifyWebhookSignature({ stripe, rawBody, signatureHeader, webhookSecret }) {
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
}

/**
 * Processes one already-signature-verified Stripe event: dedupes against
 * stripe_webhook_events (Stripe's own event.id — the correct webhook-level
 * identifier, distinct from payments.idempotency_key), then routes to the
 * appropriate payments/account-status update. Idempotent by construction —
 * calling this twice with the same event.id is always a safe no-op the
 * second time.
 *
 * @returns {{ processed: boolean, reason?: string }}
 */
async function processWebhookEvent({ db, supabaseAdminClient, event }) {
  const alreadyProcessed = await isEventAlreadyProcessed({ db, supabaseAdminClient, eventId: event.id });
  if (alreadyProcessed) return { processed: false, reason: 'duplicate_event' };

  const accountId = event.account || null;

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      const paymentId = intent.metadata && intent.metadata.paymentId;
      if (paymentId) await transitionPaymentStatus({ db, supabaseAdminClient, paymentId, newStatus: 'paid' });
      break;
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const paymentId = intent.metadata && intent.metadata.paymentId;
      if (paymentId) await transitionPaymentStatus({ db, supabaseAdminClient, paymentId, newStatus: 'failed' });
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentId = charge.metadata && charge.metadata.paymentId;
      if (paymentId) {
        const fullyRefunded = charge.amount_refunded >= charge.amount;
        await transitionPaymentStatus({ db, supabaseAdminClient, paymentId, newStatus: fullyRefunded ? 'refunded' : 'partially_refunded' });
      }
      break;
    }
    case 'account.updated': {
      // Account status sync is handled by the caller (it needs to look up
      // which tenant owns this stripeAccountId and update
      // tenant_payment_methods) — this module only marks the event
      // processed and returns the account status for the caller to apply.
      break;
    }
    default:
      break; // unrecognized event types are acknowledged (not an error) but otherwise ignored
  }

  await markEventProcessed({ db, supabaseAdminClient, eventId: event.id, accountId, eventType: event.type });
  return { processed: true };
}

async function isEventAlreadyProcessed({ db, supabaseAdminClient, eventId }) {
  if (supabaseAdminClient) {
    const { data } = await supabaseAdminClient.from('stripe_webhook_events').select('event_id').eq('event_id', eventId).maybeSingle();
    return !!data;
  }
  db.stripeWebhookEvents = db.stripeWebhookEvents || [];
  return db.stripeWebhookEvents.some(e => e.eventId === eventId);
}

async function markEventProcessed({ db, supabaseAdminClient, eventId, accountId, eventType }) {
  if (supabaseAdminClient) {
    // Idempotent insert: if a concurrent request already inserted this
    // exact event_id (the primary key), this insert will conflict — that
    // is fine and expected, not an error worth surfacing.
    const { error } = await supabaseAdminClient.from('stripe_webhook_events').insert({ event_id: eventId, account_id: accountId, event_type: eventType });
    if (error && !String(error.message || '').includes('duplicate')) throw new Error(error.message);
    return;
  }
  db.stripeWebhookEvents = db.stripeWebhookEvents || [];
  if (!db.stripeWebhookEvents.some(e => e.eventId === eventId)) {
    db.stripeWebhookEvents.push({ eventId, accountId, eventType, processedAt: Date.now() });
  }
}

/**
 * Refunds a payment given its PaymentIntent id. Stripe refunds target a
 * charge, not a PaymentIntent directly, so this first retrieves the
 * intent to find its latest_charge. Refund ownership is structurally
 * correct by construction — the charge lives on the same connected
 * account the original payment was made on, so Stripe only permits
 * refunding it from there.
 */
async function createRefund({ stripe, paymentIntentId, amount }) {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const chargeId = intent.latest_charge;
  if (!chargeId) throw new Error('No completed charge found for this PaymentIntent yet.');
  const refundParams = { charge: chargeId };
  if (amount != null) refundParams.amount = Math.round(amount * 100);
  return stripe.refunds.create(refundParams);
}

module.exports = {
  createConnectedAccount,
  createOnboardingLink,
  mapAccountStatus,
  createPaymentIntent,
  createRefund,
  verifyWebhookSignature,
  processWebhookEvent,
  isEventAlreadyProcessed,
};
