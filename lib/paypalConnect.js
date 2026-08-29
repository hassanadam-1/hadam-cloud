/**
 * lib/paypalConnect.js — PayPal Phase 1 (backend foundation).
 *
 * PayPal's multi-merchant equivalent of Stripe Connect: the Partner
 * Referrals API. Each tenant onboards their OWN PayPal account as a
 * seller; customer payments route directly to that seller via
 * purchase_units[].payee.merchant_id in the Orders API. Hadam's own
 * PayPal platform account never holds customer funds.
 *
 * Every PayPal API call is made through an injected `paypalApiCall`
 * function — (method, path, body?) => Promise<parsedJsonResponse> —
 * rather than a bundled SDK client, matching how PayPal integrations are
 * conventionally built (direct REST calls) and, just as importantly,
 * keeping this module genuinely unit-testable with a fake/mock call
 * function — no real network access to PayPal is required to test the
 * logic here, matching the same injectable pattern already used in
 * lib/stripeConnect.js (which takes an injected `stripe` client).
 */

const { transitionPaymentStatus } = require('./payments');

/**
 * Creates a partner referral for a new seller (store) and returns the
 * onboarding action_url the store admin is redirected to. PayPal's own
 * hosted signup flow collects all business/identity/banking information
 * directly — none of it ever passes through Hadam's server.
 */
async function createPartnerReferral({ paypalApiCall, tenantId, trackingId, returnUrl }) {
  const body = {
    tracking_id: trackingId,
    partner_config_override: { return_url: returnUrl },
    operations: [{ operation: 'API_INTEGRATION', api_integration_preference: { rest_api_integration: { integration_method: 'PAYPAL', integration_type: 'THIRD_PARTY', third_party_details: { features: ['PAYMENT', 'REFUND'] } } } }],
    products: ['EXPRESS_CHECKOUT'],
    legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }],
  };
  const referral = await paypalApiCall('POST', '/v2/customer/partner-referrals', body);
  const actionLink = (referral.links || []).find(l => l.rel === 'action_url');
  if (!actionLink) throw new Error('PayPal did not return an onboarding action_url.');
  return actionLink.href;
}

/**
 * Checks a seller's actual onboarding/eligibility state directly from
 * PayPal — the only correct source of truth for whether a store can
 * genuinely receive payments, never inferred from a client-side claim.
 */
async function getMerchantStatus({ paypalApiCall, partnerMerchantId, sellerMerchantId }) {
  const status = await paypalApiCall('GET', `/v1/customer/partners/${partnerMerchantId}/merchant-integrations/${sellerMerchantId}`);
  return mapMerchantStatus(status);
}

function mapMerchantStatus(status) {
  if (!status) return 'not_connected';
  const paymentsReceivable = !!status.payments_receivable;
  const emailConfirmed = !!status.primary_email_confirmed;
  if (paymentsReceivable && emailConfirmed) return 'connected';
  if (status.oauth_third_party && status.oauth_third_party.length === 0) return 'restricted';
  return 'pending';
}

/**
 * Creates a PayPal Order routed to a specific seller's merchant_id — the
 * PayPal equivalent of Stripe's transfer_data.destination. No platform
 * fee (no payee-side platform_fees array) is included, per the explicit
 * product decision to keep fees disabled until deliberately turned on.
 */
async function createOrder({ paypalApiCall, sellerMerchantId, amount, currency = 'USD', customId }) {
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: currency, value: amount.toFixed(2) },
      payee: { merchant_id: sellerMerchantId },
      custom_id: customId, // how the webhook finds its way back to the exact payments row — the PayPal equivalent of Stripe's metadata.paymentId
    }],
  };
  return paypalApiCall('POST', '/v2/checkout/orders', body);
}

/**
 * Captures an approved order server-side. This — never the browser's own
 * "approved" callback — is what actually confirms a payment. Matches the
 * exact same principle already enforced for Stripe (webhook, not client
 * response, decides `paid`), extended here to PayPal's Approve→Capture
 * flow specifically.
 */
async function captureOrder({ paypalApiCall, paypalOrderId }) {
  return paypalApiCall('POST', `/v2/checkout/orders/${paypalOrderId}/capture`, {});
}

/**
 * Refunds an original capture. Refund ownership is structurally correct
 * by construction — PayPal only allows a refund against the same
 * merchant account the capture actually belongs to.
 */
async function refundCapture({ paypalApiCall, captureId, amount, currency = 'USD' }) {
  const body = amount != null ? { amount: { value: amount.toFixed(2), currency_code: currency } } : {};
  return paypalApiCall('POST', `/v2/payments/captures/${captureId}/refund`, body);
}

/**
 * Verifies a webhook via PayPal's own verify-webhook-signature endpoint
 * (PayPal, unlike Stripe, verifies server-side via an API call rather
 * than a local HMAC check). Throws if verification fails or PayPal
 * reports anything other than SUCCESS — callers must treat that as
 * "reject the request," never as "process it anyway."
 */
async function verifyWebhookSignature({ paypalApiCall, headers, webhookId, webhookEventBody }) {
  const body = {
    transmission_id: headers['paypal-transmission-id'],
    transmission_time: headers['paypal-transmission-time'],
    cert_url: headers['paypal-cert-url'],
    auth_algo: headers['paypal-auth-algo'],
    transmission_sig: headers['paypal-transmission-sig'],
    webhook_id: webhookId,
    webhook_event: webhookEventBody,
  };
  const result = await paypalApiCall('POST', '/v1/notifications/verify-webhook-signature', body);
  if (result.verification_status !== 'SUCCESS') throw new Error(`PayPal webhook signature verification failed: ${result.verification_status}`);
  return true;
}

/**
 * Processes one already-signature-verified PayPal webhook event: dedupes
 * against paypal_webhook_events (PayPal's own event id), then routes to
 * the appropriate payments update. Idempotent by construction — the same
 * event id processed twice is always a safe no-op the second time.
 *
 * @returns {{ processed: boolean, reason?: string }}
 */
async function processWebhookEvent({ db, supabaseAdminClient, event }) {
  const alreadyProcessed = await isEventAlreadyProcessed({ db, supabaseAdminClient, eventId: event.id });
  if (alreadyProcessed) return { processed: false, reason: 'duplicate_event' };

  const resource = event.resource || {};

  switch (event.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const paymentId = resource.custom_id;
      if (paymentId) await transitionPaymentStatus({ db, supabaseAdminClient, paymentId, newStatus: 'paid' });
      break;
    }
    case 'PAYMENT.CAPTURE.DENIED': {
      const paymentId = resource.custom_id;
      if (paymentId) await transitionPaymentStatus({ db, supabaseAdminClient, paymentId, newStatus: 'failed' });
      break;
    }
    case 'PAYMENT.CAPTURE.REFUNDED': {
      const paymentId = resource.custom_id;
      if (paymentId) {
        const fullyRefunded = !resource.amount || !resource.seller_payable_breakdown || Number(resource.seller_payable_breakdown.net_amount && resource.seller_payable_breakdown.net_amount.value) === 0;
        await transitionPaymentStatus({ db, supabaseAdminClient, paymentId, newStatus: fullyRefunded ? 'refunded' : 'partially_refunded' });
      }
      break;
    }
    case 'MERCHANT.ONBOARDING.COMPLETED':
    case 'MERCHANT.PARTNER-CONSENT.REVOKED':
      // Merchant status sync is handled by the caller (needs to look up
      // which tenant owns this merchant id and update
      // tenant_payment_methods) — same division of responsibility as
      // Stripe's account.updated handling in server.js.
      break;
    default:
      break; // unrecognized event types are acknowledged, not an error
  }

  await markEventProcessed({ db, supabaseAdminClient, eventId: event.id, merchantId: resource.merchant_id || null, eventType: event.event_type });
  return { processed: true };
}

async function isEventAlreadyProcessed({ db, supabaseAdminClient, eventId }) {
  if (supabaseAdminClient) {
    const { data } = await supabaseAdminClient.from('paypal_webhook_events').select('event_id').eq('event_id', eventId).maybeSingle();
    return !!data;
  }
  db.paypalWebhookEvents = db.paypalWebhookEvents || [];
  return db.paypalWebhookEvents.some(e => e.eventId === eventId);
}

async function markEventProcessed({ db, supabaseAdminClient, eventId, merchantId, eventType }) {
  if (supabaseAdminClient) {
    const { error } = await supabaseAdminClient.from('paypal_webhook_events').insert({ event_id: eventId, merchant_id: merchantId, event_type: eventType });
    if (error && !String(error.message || '').includes('duplicate')) throw new Error(error.message);
    return;
  }
  db.paypalWebhookEvents = db.paypalWebhookEvents || [];
  if (!db.paypalWebhookEvents.some(e => e.eventId === eventId)) {
    db.paypalWebhookEvents.push({ eventId, merchantId, eventType, processedAt: Date.now() });
  }
}

module.exports = {
  createPartnerReferral,
  getMerchantStatus,
  mapMerchantStatus,
  createOrder,
  captureOrder,
  refundCapture,
  verifyWebhookSignature,
  processWebhookEvent,
  isEventAlreadyProcessed,
};
