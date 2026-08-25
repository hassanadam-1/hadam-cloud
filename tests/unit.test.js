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
};

if (require.main === module) {
  (async () => { await module.exports(); process.exit(require('./harness').summary() ? 0 : 1); })();
}
