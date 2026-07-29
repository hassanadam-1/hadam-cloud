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
};

if (require.main === module) {
  (async () => { await module.exports(); process.exit(require('./harness').summary() ? 0 : 1); })();
}
