/**
 * Run the full QA suite: unit tests, integration/API tests, and
 * acceptance (end-to-end user journey) tests, against an isolated
 * throwaway database — never the real data/db.json.
 *
 *   node tests/run.js
 */
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '.tmp-test-db.json');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.HADAM_DB_PATH = TEST_DB;
process.env.HADAM_TEST_MODE = '1';
process.env.JWT_SECRET = 'test-secret';

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
