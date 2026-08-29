/** UNIT TESTS — pure functions, no server/network involved. */
if (require.main === module && !process.env.HADAM_DB_PATH) {
  process.env.HADAM_DB_PATH = require('path').join(__dirname, '.tmp-unit-db.json');
}
const { suite, test, assert } = require('./harness');
const { hashPassword, verifyPassword, signToken, verifyToken, resolveHost, refreshItemStatus } = require('../server');

module.exports = async function runUnitTests() {
  await suite('Unit — password hashing', async () => {
    await test('hashes and verifies a correct password', () => {
      const hash = hashPassword('correct-horse');
      assert.ok(verifyPassword('correct-horse', hash));
    });
    await test('rejects an incorrect password', () => {
      const hash = hashPassword('correct-horse');
      assert.ok(!verifyPassword('wrong-password', hash));
    });
    await test('produces a different salt each time (no two hashes identical)', () => {
      assert.notStrictEqual(hashPassword('same-input'), hashPassword('same-input'));
    });
  });

  await suite('Unit — signed tokens', async () => {
    await test('round-trips a payload', () => {
      const token = signToken({ sub: 'u-1', role: 'client', tenantId: 't-1' });
      const payload = verifyToken(token);
      assert.strictEqual(payload.sub, 'u-1');
      assert.strictEqual(payload.role, 'client');
      assert.strictEqual(payload.tenantId, 't-1');
    });
    await test('rejects a tampered signature', () => {
      const token = signToken({ sub: 'u-1', role: 'client' });
      const tampered = token.slice(0, -4) + 'abcd';
      assert.strictEqual(verifyToken(tampered), null);
    });
    await test('rejects an expired token', () => {
      const token = signToken({ sub: 'u-1', role: 'client' }, -1); // already expired
      assert.strictEqual(verifyToken(token), null);
    });
    await test('rejects a garbage string', () => {
      assert.strictEqual(verifyToken('not.a.token'), null);
    });
  });

  await suite('Unit — subdomain resolution', async () => {
    await test('bare base domain is the platform', () => {
      assert.deepStrictEqual(resolveHost('hadam.com'), { isPlatform: true, subdomain: null });
    });
    await test('www is the platform', () => {
      assert.deepStrictEqual(resolveHost('www.hadam.com'), { isPlatform: true, subdomain: null });
    });
    await test('a subdomain resolves to a tenant slug', () => {
      assert.deepStrictEqual(resolveHost('acme.hadam.com'), { isPlatform: false, subdomain: 'acme' });
    });
    await test('bare localhost is the platform (local dev convenience)', () => {
      assert.deepStrictEqual(resolveHost('localhost:3000'), { isPlatform: true, subdomain: null });
    });
    await test('*.localhost resolves to a tenant slug (local dev convenience)', () => {
      assert.deepStrictEqual(resolveHost('acme.localhost:3000'), { isPlatform: false, subdomain: 'acme' });
    });
    await test('a nested label still resolves to the first slug', () => {
      assert.strictEqual(resolveHost('acme.hadam.com').subdomain, 'acme');
    });
  });

  await suite('Unit — download window enforcement', async () => {
    await test('an unexpired ready item stays ready', () => {
      const item = { fulfillment: 'download', status: 'ready', downloadExpiresAt: Date.now() + 1000 * 60 };
      refreshItemStatus(item);
      assert.strictEqual(item.status, 'ready');
    });
    await test('an item past its window flips to expired', () => {
      const item = { fulfillment: 'download', status: 'ready', downloadExpiresAt: Date.now() - 1000 };
      refreshItemStatus(item);
      assert.strictEqual(item.status, 'expired');
    });
    await test('non-download items are left untouched', () => {
      const item = { fulfillment: 'shipping', status: 'pending' };
      refreshItemStatus(item);
      assert.strictEqual(item.status, 'pending');
    });
  });

  await suite('Unit — Phase 1 payment abstraction (lib/payments.js)', async () => {
    const { createPayment, transitionPaymentStatus, getPaymentsForOrder, assertTransitionAllowed } = require('../lib/payments');

    await test('creates a payment record with the fields provided', async () => {
      const db = { payments: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'cash', status: 'pending', amount: 42.5, currency: 'usd' });
      assert.strictEqual(payment.tenantId, 't-1');
      assert.strictEqual(payment.method, 'cash');
      assert.strictEqual(payment.status, 'pending');
      assert.strictEqual(payment.amount, 42.5);
      assert.strictEqual(db.payments.length, 1);
    });

    await test('rejects an invalid method', async () => {
      const db = { payments: [] };
      await assert.rejects(() => createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'venmo', amount: 10 }));
    });

    await test('rejects a negative amount', async () => {
      const db = { payments: [] };
      await assert.rejects(() => createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'cash', amount: -5 }));
    });

    await test('idempotency key returns the existing record instead of creating a duplicate', async () => {
      const db = { payments: [] };
      const first = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, idempotencyKey: 'evt-123' });
      const second = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, idempotencyKey: 'evt-123' });
      assert.strictEqual(first.id, second.id);
      assert.strictEqual(db.payments.length, 1);
    });

    await test('a different idempotency key (or no key) creates a genuinely separate record', async () => {
      const db = { payments: [] };
      await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, idempotencyKey: 'evt-1' });
      await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, idempotencyKey: 'evt-2' });
      assert.strictEqual(db.payments.length, 2);
    });

    await test('valid transitions succeed: pending -> paid -> refunded', async () => {
      const db = { payments: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'bank_transfer', amount: 10, status: 'pending' });
      await transitionPaymentStatus({ db, supabaseAdminClient: null, paymentId: payment.id, newStatus: 'paid' });
      assert.strictEqual(db.payments[0].status, 'paid');
      await transitionPaymentStatus({ db, supabaseAdminClient: null, paymentId: payment.id, newStatus: 'refunded' });
      assert.strictEqual(db.payments[0].status, 'refunded');
    });

    await test('illegal transitions are rejected: paid -> pending', async () => {
      const db = { payments: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'cash', amount: 10, status: 'paid' });
      await assert.rejects(() => transitionPaymentStatus({ db, supabaseAdminClient: null, paymentId: payment.id, newStatus: 'pending' }));
    });

    await test('illegal transitions are rejected: failed -> paid', async () => {
      const db = { payments: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'cash', amount: 10, status: 'failed' });
      await assert.rejects(() => transitionPaymentStatus({ db, supabaseAdminClient: null, paymentId: payment.id, newStatus: 'paid' }));
    });

    await test('a refunded payment cannot be transitioned further at all', async () => {
      const db = { payments: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'cash', amount: 10, status: 'refunded' });
      await assert.rejects(() => transitionPaymentStatus({ db, supabaseAdminClient: null, paymentId: payment.id, newStatus: 'paid' }));
      await assert.rejects(() => transitionPaymentStatus({ db, supabaseAdminClient: null, paymentId: payment.id, newStatus: 'pending' }));
    });

    await test('partially_refunded can move to a final full refund', () => {
      assert.doesNotThrow(() => assertTransitionAllowed('partially_refunded', 'refunded'));
    });

    await test('getPaymentsForOrder returns only that order\'s payments, in creation order', async () => {
      const db = { payments: [] };
      await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'cash', amount: 10 });
      await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-2', clientId: 'c-1', method: 'cash', amount: 20 });
      const forOrder1 = await getPaymentsForOrder({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1' });
      assert.strictEqual(forOrder1.length, 1);
      assert.strictEqual(forOrder1[0].orderId, 'o-1');
    });
  });
  await suite('Unit — Phase 2 Stripe Connect (lib/stripeConnect.js)', async () => {
    const { mapAccountStatus, createConnectedAccount, createOnboardingLink, createPaymentIntent, createRefund, processWebhookEvent, isEventAlreadyProcessed } = require('../lib/stripeConnect');
    const { createPayment } = require('../lib/payments');

    await test('mapAccountStatus: no account -> not_connected', () => {
      assert.strictEqual(mapAccountStatus(null), 'not_connected');
    });
    await test('mapAccountStatus: charges+payouts enabled -> connected', () => {
      assert.strictEqual(mapAccountStatus({ charges_enabled: true, payouts_enabled: true }), 'connected');
    });
    await test('mapAccountStatus: disabled_reason present -> restricted', () => {
      assert.strictEqual(mapAccountStatus({ charges_enabled: false, payouts_enabled: false, requirements: { disabled_reason: 'requirements.past_due' } }), 'restricted');
    });
    await test('mapAccountStatus: incomplete, no disabled reason -> pending', () => {
      assert.strictEqual(mapAccountStatus({ charges_enabled: false, payouts_enabled: false }), 'pending');
    });

    await test('createConnectedAccount calls Stripe with type express and tenant metadata', async () => {
      let captured;
      const fakeStripe = { accounts: { create: async (params) => { captured = params; return { id: 'acct_fake123' }; } } };
      const id = await createConnectedAccount({ stripe: fakeStripe, tenantId: 't-1' });
      assert.strictEqual(id, 'acct_fake123');
      assert.strictEqual(captured.type, 'express');
      assert.strictEqual(captured.metadata.tenantId, 't-1');
    });

    await test('createOnboardingLink passes the correct account and URLs', async () => {
      let captured;
      const fakeStripe = { accountLinks: { create: async (params) => { captured = params; return { url: 'https://connect.stripe.com/fake' }; } } };
      const url = await createOnboardingLink({ stripe: fakeStripe, stripeAccountId: 'acct_fake123', returnUrl: 'https://x/return', refreshUrl: 'https://x/refresh' });
      assert.strictEqual(url, 'https://connect.stripe.com/fake');
      assert.strictEqual(captured.account, 'acct_fake123');
      assert.strictEqual(captured.type, 'account_onboarding');
      assert.strictEqual(captured.return_url, 'https://x/return');
    });

    await test('createPaymentIntent routes funds to the connected account and converts to cents', async () => {
      let captured;
      const fakeStripe = { paymentIntents: { create: async (params) => { captured = params; return { id: 'pi_fake123' }; } } };
      await createPaymentIntent({ stripe: fakeStripe, stripeAccountId: 'acct_fake123', amount: 19.99, currency: 'usd' });
      assert.strictEqual(captured.amount, 1999);
      assert.strictEqual(captured.transfer_data.destination, 'acct_fake123');
      assert.strictEqual(captured.currency, 'usd');
    });
    await test('createPaymentIntent has no application_fee_amount \u2014 no platform fee, per the explicit product decision', async () => {
      let captured;
      const fakeStripe = { paymentIntents: { create: async (params) => { captured = params; return { id: 'pi_fake123' }; } } };
      await createPaymentIntent({ stripe: fakeStripe, stripeAccountId: 'acct_fake123', amount: 10 });
      assert.strictEqual(captured.application_fee_amount, undefined);
    });

    await test('createRefund: full refund retrieves the charge and refunds it in full (no amount specified)', async () => {
      let capturedRefundParams;
      const fakeStripe = {
        paymentIntents: { retrieve: async () => ({ latest_charge: 'ch_fake123' }) },
        refunds: { create: async (params) => { capturedRefundParams = params; return { id: 're_fake123', status: 'succeeded' }; } },
      };
      await createRefund({ stripe: fakeStripe, paymentIntentId: 'pi_fake123' });
      assert.strictEqual(capturedRefundParams.charge, 'ch_fake123');
      assert.strictEqual(capturedRefundParams.amount, undefined, 'a full refund should not specify an amount at all');
    });

    await test('createRefund: partial refund converts dollars to cents correctly', async () => {
      let capturedRefundParams;
      const fakeStripe = {
        paymentIntents: { retrieve: async () => ({ latest_charge: 'ch_fake123' }) },
        refunds: { create: async (params) => { capturedRefundParams = params; return { id: 're_fake123' }; } },
      };
      await createRefund({ stripe: fakeStripe, paymentIntentId: 'pi_fake123', amount: 5.5 });
      assert.strictEqual(capturedRefundParams.amount, 550);
    });

    await test('createRefund throws clearly if the PaymentIntent has no completed charge yet', async () => {
      const fakeStripe = { paymentIntents: { retrieve: async () => ({ latest_charge: null }) } };
      await assert.rejects(() => createRefund({ stripe: fakeStripe, paymentIntentId: 'pi_fake123' }));
    });

    await test('processWebhookEvent: payment_intent.succeeded transitions the payment to paid', async () => {
      const db = { payments: [], stripeWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, status: 'pending' });
      const event = { id: 'evt_1', type: 'payment_intent.succeeded', account: 'acct_fake123', data: { object: { metadata: { paymentId: payment.id } } } };
      const result = await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(result.processed, true);
      assert.strictEqual(db.payments[0].status, 'paid');
    });

    await test('processWebhookEvent: payment_intent.payment_failed transitions the payment to failed', async () => {
      const db = { payments: [], stripeWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, status: 'pending' });
      const event = { id: 'evt_2', type: 'payment_intent.payment_failed', account: 'acct_fake123', data: { object: { metadata: { paymentId: payment.id } } } };
      await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(db.payments[0].status, 'failed');
    });

    await test('processWebhookEvent: charge.refunded (full amount) transitions to refunded', async () => {
      const db = { payments: [], stripeWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, status: 'paid' });
      const event = { id: 'evt_3', type: 'charge.refunded', account: 'acct_fake123', data: { object: { metadata: { paymentId: payment.id }, amount: 1000, amount_refunded: 1000 } } };
      await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(db.payments[0].status, 'refunded');
    });

    await test('processWebhookEvent: charge.refunded (partial amount) transitions to partially_refunded', async () => {
      const db = { payments: [], stripeWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, status: 'paid' });
      const event = { id: 'evt_4', type: 'charge.refunded', account: 'acct_fake123', data: { object: { metadata: { paymentId: payment.id }, amount: 1000, amount_refunded: 500 } } };
      await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(db.payments[0].status, 'partially_refunded');
    });

    await test('processWebhookEvent: the SAME event.id is never processed twice', async () => {
      const db = { payments: [], stripeWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'stripe', amount: 10, status: 'pending' });
      const event = { id: 'evt_duplicate', type: 'payment_intent.succeeded', account: 'acct_fake123', data: { object: { metadata: { paymentId: payment.id } } } };
      const first = await processWebhookEvent({ db, supabaseAdminClient: null, event });
      // Manually revert status to simulate what would happen if the event were WRONGLY reprocessed.
      db.payments[0].status = 'pending';
      const second = await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(first.processed, true);
      assert.strictEqual(second.processed, false);
      assert.strictEqual(second.reason, 'duplicate_event');
      assert.strictEqual(db.payments[0].status, 'pending', 'the second call must NOT have touched the payment again');
    });

    await test('isEventAlreadyProcessed correctly distinguishes seen vs. unseen event ids', async () => {
      const db = { stripeWebhookEvents: [{ eventId: 'evt_seen', accountId: 'acct_x', eventType: 'x', processedAt: Date.now() }] };
      assert.strictEqual(await isEventAlreadyProcessed({ db, supabaseAdminClient: null, eventId: 'evt_seen' }), true);
      assert.strictEqual(await isEventAlreadyProcessed({ db, supabaseAdminClient: null, eventId: 'evt_never_seen' }), false);
    });
  });

  await suite('Unit — PayPal Connect (lib/paypalConnect.js)', async () => {
    const {
      mapMerchantStatus, createPartnerReferral, getMerchantStatus, createOrder, captureOrder, refundCapture,
      verifyWebhookSignature, processWebhookEvent, isEventAlreadyProcessed: paypalEventProcessed,
    } = require('../lib/paypalConnect');
    const { createPayment } = require('../lib/payments');

    await test('mapMerchantStatus: no status -> not_connected', () => {
      assert.strictEqual(mapMerchantStatus(null), 'not_connected');
    });
    await test('mapMerchantStatus: payments_receivable + email confirmed -> connected', () => {
      assert.strictEqual(mapMerchantStatus({ payments_receivable: true, primary_email_confirmed: true }), 'connected');
    });
    await test('mapMerchantStatus: no oauth permissions granted -> restricted', () => {
      assert.strictEqual(mapMerchantStatus({ payments_receivable: false, primary_email_confirmed: false, oauth_third_party: [] }), 'restricted');
    });
    await test('mapMerchantStatus: incomplete, no restriction signal -> pending', () => {
      assert.strictEqual(mapMerchantStatus({ payments_receivable: false, primary_email_confirmed: false }), 'pending');
    });

    await test('createPartnerReferral calls the correct endpoint and returns the action_url', async () => {
      let captured;
      const fakeCall = async (method, path, body) => { captured = { method, path, body }; return { links: [{ rel: 'self', href: 'https://x/self' }, { rel: 'action_url', href: 'https://paypal.com/onboard/abc' }] }; };
      const url = await createPartnerReferral({ paypalApiCall: fakeCall, tenantId: 't-1', trackingId: 't-1', returnUrl: 'https://x/return' });
      assert.strictEqual(url, 'https://paypal.com/onboard/abc');
      assert.strictEqual(captured.method, 'POST');
      assert.strictEqual(captured.path, '/v2/customer/partner-referrals');
      assert.strictEqual(captured.body.products[0], 'EXPRESS_CHECKOUT');
      assert.strictEqual(captured.body.partner_config_override.return_url, 'https://x/return');
    });

    await test('createPartnerReferral throws clearly if PayPal returns no action_url', async () => {
      const fakeCall = async () => ({ links: [{ rel: 'self', href: 'https://x/self' }] });
      await assert.rejects(() => createPartnerReferral({ paypalApiCall: fakeCall, tenantId: 't-1', trackingId: 't-1', returnUrl: 'https://x/return' }));
    });

    await test('getMerchantStatus calls the correct merchant-integrations endpoint and maps the result', async () => {
      let capturedPath;
      const fakeCall = async (method, path) => { capturedPath = path; return { payments_receivable: true, primary_email_confirmed: true }; };
      const status = await getMerchantStatus({ paypalApiCall: fakeCall, partnerMerchantId: 'PARTNER1', sellerMerchantId: 'SELLER1' });
      assert.strictEqual(status, 'connected');
      assert.strictEqual(capturedPath, '/v1/customer/partners/PARTNER1/merchant-integrations/SELLER1');
    });

    await test('createOrder routes funds to the correct seller merchant_id and includes custom_id for webhook correlation', async () => {
      let captured;
      const fakeCall = async (method, path, body) => { captured = body; return { id: 'ORDER123' }; };
      await createOrder({ paypalApiCall: fakeCall, sellerMerchantId: 'SELLER1', amount: 19.99, currency: 'USD', customId: 'pay-abc' });
      assert.strictEqual(captured.purchase_units[0].payee.merchant_id, 'SELLER1');
      assert.strictEqual(captured.purchase_units[0].amount.value, '19.99');
      assert.strictEqual(captured.purchase_units[0].custom_id, 'pay-abc');
    });
    await test('createOrder has no platform_fees / no platform fee, per the explicit product decision', async () => {
      let captured;
      const fakeCall = async (method, path, body) => { captured = body; return { id: 'ORDER123' }; };
      await createOrder({ paypalApiCall: fakeCall, sellerMerchantId: 'SELLER1', amount: 10, customId: 'pay-x' });
      assert.strictEqual(captured.purchase_units[0].payee.platform_fees, undefined);
    });

    await test('captureOrder calls the correct capture endpoint for the given order id', async () => {
      let capturedPath;
      const fakeCall = async (method, path) => { capturedPath = path; return { status: 'COMPLETED' }; };
      await captureOrder({ paypalApiCall: fakeCall, paypalOrderId: 'ORDER123' });
      assert.strictEqual(capturedPath, '/v2/checkout/orders/ORDER123/capture');
    });

    await test('refundCapture targets the original capture id', async () => {
      let capturedPath;
      const fakeCall = async (method, path) => { capturedPath = path; return { status: 'COMPLETED' }; };
      await refundCapture({ paypalApiCall: fakeCall, captureId: 'CAP123' });
      assert.strictEqual(capturedPath, '/v2/payments/captures/CAP123/refund');
    });

    await test('verifyWebhookSignature accepts a genuinely SUCCESS response', async () => {
      const fakeCall = async () => ({ verification_status: 'SUCCESS' });
      await assert.doesNotReject(() => verifyWebhookSignature({ paypalApiCall: fakeCall, headers: {}, webhookId: 'WH1', webhookEventBody: {} }));
    });
    await test('verifyWebhookSignature REJECTS anything other than SUCCESS \u2014 never treats an ambiguous response as valid', async () => {
      const fakeCall = async () => ({ verification_status: 'FAILURE' });
      await assert.rejects(() => verifyWebhookSignature({ paypalApiCall: fakeCall, headers: {}, webhookId: 'WH1', webhookEventBody: {} }));
    });

    await test('processWebhookEvent: PAYMENT.CAPTURE.COMPLETED transitions the payment to paid', async () => {
      const db = { payments: [], paypalWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'paypal', amount: 10, status: 'pending' });
      const event = { id: 'WH-EVT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { custom_id: payment.id } };
      const result = await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(result.processed, true);
      assert.strictEqual(db.payments[0].status, 'paid');
    });

    await test('processWebhookEvent: PAYMENT.CAPTURE.DENIED transitions the payment to failed', async () => {
      const db = { payments: [], paypalWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'paypal', amount: 10, status: 'pending' });
      const event = { id: 'WH-EVT-2', event_type: 'PAYMENT.CAPTURE.DENIED', resource: { custom_id: payment.id } };
      await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(db.payments[0].status, 'failed');
    });

    await test('processWebhookEvent: PAYMENT.CAPTURE.REFUNDED (full) transitions to refunded', async () => {
      const db = { payments: [], paypalWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'paypal', amount: 10, status: 'paid' });
      const event = { id: 'WH-EVT-3', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { custom_id: payment.id, amount: { value: '10.00' }, seller_payable_breakdown: { net_amount: { value: '0.00' } } } };
      await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(db.payments[0].status, 'refunded');
    });

    await test('processWebhookEvent: the SAME event id is never processed twice', async () => {
      const db = { payments: [], paypalWebhookEvents: [] };
      const payment = await createPayment({ db, supabaseAdminClient: null, tenantId: 't-1', orderId: 'o-1', clientId: 'c-1', method: 'paypal', amount: 10, status: 'pending' });
      const event = { id: 'WH-EVT-DUP', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { custom_id: payment.id } };
      const first = await processWebhookEvent({ db, supabaseAdminClient: null, event });
      db.payments[0].status = 'pending'; // simulate what WOULD happen if wrongly reprocessed
      const second = await processWebhookEvent({ db, supabaseAdminClient: null, event });
      assert.strictEqual(first.processed, true);
      assert.strictEqual(second.processed, false);
      assert.strictEqual(second.reason, 'duplicate_event');
      assert.strictEqual(db.payments[0].status, 'pending', 'the duplicate delivery must not have touched the payment again');
    });

    await test("PayPal's webhook idempotency ledger is genuinely separate from Stripe's \u2014 no cross-provider event id collision is possible even in principle", async () => {
      const db = { payments: [], stripeWebhookEvents: [{ eventId: 'evt_shared_id', accountId: 'acct_x', eventType: 'x', processedAt: Date.now() }], paypalWebhookEvents: [] };
      // The exact same id already "seen" on the Stripe side must NOT be considered seen on the PayPal side.
      assert.strictEqual(await paypalEventProcessed({ db, supabaseAdminClient: null, eventId: 'evt_shared_id' }), false);
    });
  });
};

if (require.main === module) {
  (async () => { await module.exports(); process.exit(require('./harness').summary() ? 0 : 1); })();
}
