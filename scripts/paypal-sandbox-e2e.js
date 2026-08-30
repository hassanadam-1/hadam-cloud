#!/usr/bin/env node
/**
 * Real PayPal Sandbox API-level E2E verification.
 *
 * This script makes GENUINE network calls to PayPal's sandbox — no mocks,
 * no fakes. It is deliberately scoped to exactly what's reachable via a
 * supported API without the interactive buyer-approval step (see
 * docs/PAYPAL_SANDBOX_E2E.md for the full explanation of that boundary).
 *
 * Required environment variables (set as GitHub Actions secrets, never
 * committed):
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_SANDBOX_MERCHANT_ID  — the merchant_id of a sandbox seller
 *                                 account that has ALREADY completed
 *                                 PayPal's hosted onboarding once, by
 *                                 hand (see the one-time manual setup
 *                                 doc). This script never performs
 *                                 onboarding itself.
 *
 * If any required variable is missing, this script exits with a clear,
 * distinct failure — never a silent skip. A CI run that "passed" because
 * it quietly skipped everything would be worse than no CI run at all.
 */

const BASE = 'https://api-m.sandbox.paypal.com';
const REQUIRED_VARS = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_SANDBOX_MERCHANT_ID'];
const SANDBOX_TRACKING_ID = 'hadam-onboarding-test-1';

let passed = 0;
let failed = 0;

function step(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err.message}`);
      failed++;
    }
  })();
}

async function main() {
  console.log('=== Real PayPal Sandbox API E2E ===');
  console.log('(No mocks. Every call below is a genuine network request to PayPal sandbox.)\n');

  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('FATAL: required sandbox secrets are not configured:');
    for (const v of missing) console.error(`  - ${v}`);
    console.error('\nThis is a hard failure, not a skip — a workflow that silently skipped');
    console.error('would risk being mistaken for a passing real-API test. Configure these');
    console.error('as GitHub Actions repository secrets and re-run.');
    process.exit(1);
  }

  let accessToken;

  await step('Obtain OAuth access token from PayPal sandbox', async () => {
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`OAuth failed: ${data.error_description || res.status}`);
    if (!data.access_token) throw new Error('OAuth response had no access_token — malformed response.');
    accessToken = data.access_token;
  });

  if (!accessToken) {
    console.log(`\n${passed} passed, ${failed} failed — stopping early, nothing else can proceed without a token.`);
    process.exit(1);
  }

  async function call(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  await step('Verify Platform app credentials are genuinely accepted by PayPal (not just a well-formed token)', async () => {
    // A lightweight authenticated call — if the token/app itself is
    // invalid or lacks the Platform capability, this fails with a real
    // 401/403 from PayPal, not from anything we constructed ourselves.
    const result = await call('GET', `/v1/customer/partners/${process.env.PAYPAL_SANDBOX_MERCHANT_ID}/merchant-integrations?tracking_id=${SANDBOX_TRACKING_ID}`);
    if (!result.ok && result.status !== 404) {
      // 404 here can legitimately mean "no sub-merchants yet listed under
      // this exact path shape" depending on account configuration — what
      // actually matters is that this ISN'T a 401 (credentials rejected).
      throw new Error(`Unexpected status ${result.status}: ${JSON.stringify(result.data)}`);
    }
    if (result.status === 401) throw new Error('PayPal rejected these credentials (401) — Platform app capability may not be genuinely active.');
  });

  let realMerchantStatus;
  await step('Fetch the REAL onboarding/status of the pre-onboarded sandbox merchant', async () => {
    const result = await call('GET', `/v1/customer/partners/${process.env.PAYPAL_SANDBOX_MERCHANT_ID}/merchant-integrations?tracking_id=${SANDBOX_TRACKING_ID}`);
    if (!result.ok) throw new Error(`Could not fetch merchant status: ${result.status} ${JSON.stringify(result.data)}`);
    realMerchantStatus = result.data;
    const { mapMerchantStatus } = require('../lib/paypalConnect');
    const mapped = mapMerchantStatus(realMerchantStatus);
    console.log(`  -> real onboarding status from PayPal: ${mapped}`);
  });

  let realOrderId;
  await step('Create a REAL sandbox order, routed to the pre-onboarded merchant', async () => {
    const { createOrder } = require('../lib/paypalConnect');
    const order = await createOrder({
      paypalApiCall: async (method, path, body) => {
        const result = await call(method, path, body);
        if (!result.ok) throw new Error(`PayPal API error creating order: ${result.status} ${JSON.stringify(result.data)}`);
        return result.data;
      },
      sellerMerchantId: process.env.PAYPAL_SANDBOX_MERCHANT_ID,
      amount: 10.0,
      currency: 'USD',
      customId: 'ci-e2e-check',
    });
    if (!order.id) throw new Error('PayPal did not return an order id.');
    realOrderId = order.id;
    console.log(`  -> real PayPal sandbox order id: ${realOrderId}`);
  });

  await step('Verify the REAL order targets the correct merchant and is in the expected pre-approval state', async () => {
    const result = await call('GET', `/v2/checkout/orders/${realOrderId}`);
    if (!result.ok) throw new Error(`Could not fetch order back: ${result.status}`);
    const payeeId = result.data.purchase_units && result.data.purchase_units[0] && result.data.purchase_units[0].payee && result.data.purchase_units[0].payee.merchant_id;
    if (payeeId !== process.env.PAYPAL_SANDBOX_MERCHANT_ID) {
      throw new Error(`Order's payee.merchant_id (${payeeId}) does not match the expected sandbox merchant — tenant/merchant routing is broken.`);
    }
    // This is the genuine, honest boundary: without a completed buyer
    // approval (an interactive, PayPal-hosted step — see the docs), a
    // freshly-created order can only ever reach this status. Confirming
    // it is exactly this, and nothing else, IS the real assertion here.
    if (result.data.status !== 'PAYER_ACTION_REQUIRED' && result.data.status !== 'CREATED') {
      throw new Error(`Unexpected order status "${result.data.status}" — expected PAYER_ACTION_REQUIRED/CREATED at this stage.`);
    }
    console.log(`  -> confirmed: real order ${realOrderId}, correct merchant, status ${result.data.status}`);
  });

  console.log(`\n${passed} passed, ${failed} failed (real PayPal sandbox API calls)`);
  console.log('\nNOT covered by this script (see docs/PAYPAL_SANDBOX_E2E.md):');
  console.log('  - Buyer approval of the order (requires PayPal-hosted, interactive checkout)');
  console.log('  - Capture, webhook delivery, and refund confirmation (all depend on approval above)');
  console.log('These require the documented occasional manual verification instead.');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('FATAL, unexpected error:', err.message);
  process.exit(1);
});
