/**
 * Run the full QA suite: unit tests, integration/API tests, and
 * acceptance (end-to-end user journey) tests, against an isolated
 * throwaway database — never the real data/db.json.
 *
 *   node tests/run.js
 *
 * HARD SAFETY GUARD: this suite must NEVER run against a real Supabase
 * project. It was discovered (2026-09-10) that an earlier run had done
 * exactly that — twice — leaving 142 fake test tenants (and all their
 * cascaded products/orders/etc.) sitting in the live production
 * marketplace for over a week before anyone noticed. This guard makes
 * that structurally impossible going forward: if SUPABASE_URL or
 * SUPABASE_SERVICE_ROLE_KEY are present in the environment at all (e.g.
 * because they're set in .env and something loaded it, or exported in
 * the shell), the suite refuses to start. There is no legitimate reason
 * for this file/driver test run to ever see real Supabase credentials —
 * it always forces AUTH_DRIVER to the local file driver below anyway.
 */
if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is set in this environment.');
  console.error('This test suite only ever runs against a local throwaway file-driver');
  console.error('database and must NEVER be run with real Supabase credentials present —');
  console.error('doing so once before created 142 fake tenants in the live production');
  console.error('marketplace. Unset these variables (check your shell and .env file)');
  console.error('before running tests.');
  process.exit(1);
}
process.env.HADAM_AUTH_DRIVER = ''; // force the local file driver, never Supabase, regardless of what's already set

const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '.tmp-test-db.json');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.HADAM_DB_PATH = TEST_DB;
process.env.HADAM_TEST_MODE = '1';
process.env.JWT_SECRET = 'test-secret';
// Fake, local-only Stripe test-mode credentials — used ONLY for offline
// HMAC signature generation/verification in Phase 2 webhook tests (see
// stripe.webhooks.generateTestHeaderString / constructEvent). No real
// Stripe account, network access, or real key is involved anywhere here.
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_local_testing_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_secret_for_local_testing_only';

const { summary } = require('./harness');
const { server, initDb } = require('../server');

const TEST_PORT = 3987;

(async () => {
  console.log('═'.repeat(50));
  console.log('HADAM — automated QA suite');
  console.log('═'.repeat(50));

  await initDb();
  await new Promise(resolve => server.listen(TEST_PORT, resolve));

  try {
    await require('./unit.test')();
    await require('./i18n.test')();
    await require('./api.test')(TEST_PORT);
    await require('./acceptance.test')(TEST_PORT);
  } catch (err) {
    console.error('\nTest run crashed unexpectedly:', err);
  } finally {
    server.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  }

  const ok = summary();
  process.exit(ok ? 0 : 1);
})();
