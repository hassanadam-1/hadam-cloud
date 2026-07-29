/**
 * ACCEPTANCE TESTS — full user journeys, phrased the way a client or
 * QA reviewer would describe them, rather than individual endpoint checks
 * (those live in api.test.js). Each test walks a real path through the
 * product end to end and checks the outcome a user would actually see.
 */
const { suite, test, assert } = require('./harness');

module.exports = async function runAcceptanceTests(port) {
  const uniq = () => Math.random().toString(36).slice(2, 9);
  const { request } = require('./harness');
  async function call(host, path, opts = {}) {
    return request(port, host, path, opts);
  }

  await suite('Acceptance — a new merchant opens a store and sells a service', async () => {
    const sub = 'clinic-' + uniq();
    let adminToken, clientToken, categoryId, productId, orderId;

    await test('the merchant creates a store from the main site', async () => {
      const { status, body } = await call('localhost', '/api/platform/tenants', {
        method: 'POST', body: JSON.stringify({ subdomain: sub, storeName: 'Riverside Clinic', adminName: 'Dr. Rivera', adminEmail: `rivera-${uniq()}@test.dev`, adminPassword: 'password123', plan: 'both' }),
      });
      assert.strictEqual(status, 201);
      adminToken = body.token;
    });

    await test('the merchant defines a booking category for consultations', async () => {
      const { status, body } = await call(`${sub}.localhost`, '/api/admin/categories', {
        method: 'POST', headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Consultations', group: 'marketplace', fulfillment: 'booking', description: 'Book a consultation slot.' }),
      });
      assert.strictEqual(status, 201);
      categoryId = body.category.id;
    });

    await test('the merchant lists their first service', async () => {
      const { status, body } = await call(`${sub}.localhost`, '/api/admin/products', {
        method: 'POST', headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Initial Consultation (30 min)', price: 35, categoryId, description: 'A first appointment to assess needs.' }),
      });
      assert.strictEqual(status, 201);
      productId = body.product.id;
    });

    await test('a patient finds the store, registers, and books the consultation', async () => {
      const email = `patient-${uniq()}@test.dev`;
      await call(`${sub}.localhost`, '/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Pat Patient', email, password: 'password123' }) });
      const { body: login } = await call(`${sub}.localhost`, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'password123' }) });
      clientToken = login.token;
      const { status, body } = await call(`${sub}.localhost`, '/api/orders', {
        method: 'POST', headers: { Authorization: `Bearer ${clientToken}` },
        body: JSON.stringify({ items: [{ productId, qty: 1 }], card: { number: '4111111111111111' } }),
      });
      assert.strictEqual(status, 201);
      assert.strictEqual(body.order.items[0].status, 'requested');
      orderId = body.order.id;
    });

    await test('the clinic confirms and schedules the booking', async () => {
      const scheduledAt = Date.now() + 1000 * 60 * 60 * 24 * 3;
      const { status, body } = await call(`${sub}.localhost`, `/api/employee/orders/${orderId}/items/${productId}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ status: 'confirmed', scheduledAt }),
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(body.item.status, 'confirmed');
    });

    await test('the patient sees the confirmed appointment in their own order history', async () => {
      const { body } = await call(`${sub}.localhost`, '/api/orders/mine', { headers: { Authorization: `Bearer ${clientToken}` } });
      const order = body.orders.find(o => o.id === orderId);
      assert.strictEqual(order.items[0].status, 'confirmed');
      assert.ok(order.items[0].scheduledAt);
    });

    await test('none of this ever touched the Demo Store\'s data', async () => {
      const { body: demoCats } = await call('demo.localhost', '/api/categories');
      assert.ok(!demoCats.categories.some(c => c.name === 'Consultations'));
    });
  });

  await suite('Acceptance — a shopper buys a physical item and a digital item together', async () => {
    let clientToken, orderId, digitalProductId;

    await test('log in as the existing demo client', async () => {
      const { body } = await call('demo.localhost', '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'client@hadamstore.com', password: 'client123' }) });
      clientToken = body.token;
      assert.ok(clientToken);
    });

    await test('browse the marketplace group and find a digital product', async () => {
      const { body } = await call('demo.localhost', '/api/products?group=marketplace');
      const digital = body.products.find(p => p.category.fulfillment === 'download');
      assert.ok(digital);
      digitalProductId = digital.id;
    });

    await test('check out with a valid card and a shipping address', async () => {
      const { body: products } = await call('demo.localhost', '/api/products?group=store');
      const physical = products.products[0];
      const { status, body } = await call('demo.localhost', '/api/orders', {
        method: 'POST', headers: { Authorization: `Bearer ${clientToken}` },
        body: JSON.stringify({ items: [{ productId: digitalProductId, qty: 1 }, { productId: physical.id, qty: 1 }], shippingAddress: '10 Downing St', card: { number: '4242424242424242' } }),
      });
      assert.strictEqual(status, 201);
      orderId = body.order.id;
    });

    await test('the digital file is available to download immediately', async () => {
      const res = await call('demo.localhost', `/api/downloads/${orderId}/${digitalProductId}`, { headers: { Authorization: `Bearer ${clientToken}` } });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('DIGITAL DELIVERY'));
    });
  });
};
