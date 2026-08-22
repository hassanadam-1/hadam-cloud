/**
 * Deployment-level integration test: proves the COMPLETE chain —
 *   Store Contact submission -> notification -> localized template
 *   -> real Resend API -> a real, controlled test mailbox
 *
 * This is DELIBERATELY SEPARATE from `npm test`. The normal suite
 * (253+ tests) is fully deterministic and runs with no external
 * services or secrets. This script is the opposite: it requires real
 * credentials, makes real network calls, and its outcome depends on
 * infrastructure outside this codebase (Resend's delivery, the test
 * mailbox provider's uptime). Mixing the two would make the normal
 * suite flaky and slow for no benefit to everyday development.
 *
 * Run with:
 *   npm run test:email:resend
 *
 * Required environment variables:
 *   RESEND_API_KEY        - a real Resend API key
 *   FROM_EMAIL             - the sender address configured in Resend
 *   MAILOSAUR_API_KEY      - API key for a Mailosaur test server
 *   MAILOSAUR_SERVER_ID    - the Mailosaur server ID to receive test mail
 *
 * Uses Mailosaur (https://mailosaur.com) as the reference test-mailbox
 * provider, since its API is purpose-built for exactly this pattern
 * (a real inbox you can programmatically wait on, inspect, and clean
 * up). If you use a different provider (Mailtrap, etc.), the only
 * part of this file that needs to change is the `mailosaur` helper
 * object near the top — every other step is provider-agnostic.
 *
 * HONESTY NOTE: this script was written and syntax-checked, but has
 * never been run against a real Resend account or a real Mailosaur
 * server — no such credentials exist in the sandbox this was built
 * in. Treat the first real run as the actual first test of this
 * script itself, not just of the feature it exercises.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------
// Step 1 — confirm required secrets exist BEFORE doing anything else.
// A missing secret is a configuration problem, not a test failure —
// exit clearly rather than producing a confusing downstream error.
//
// SANDBOX MODE: if you're using Resend's onboarding@resend.dev sender
// (no verified domain yet), Resend will ONLY deliver to the email
// address you signed up to Resend with — never to an arbitrary
// Mailosaur address. In that situation, set SANDBOX_TEST_RECIPIENT to
// that same signup email instead of configuring Mailosaur — steps 1-8
// (submission, database, notification, Arabic template) remain fully
// automated either way; only the final delivery confirmation becomes a
// one-time manual inbox check, and the script says so explicitly rather
// than pretending that part is automated too. Once a real domain is
// verified in Resend, switch back to MAILOSAUR_API_KEY/
// MAILOSAUR_SERVER_ID for the fully-automated path.
// ---------------------------------------------------------------------
const SANDBOX_MODE = !!process.env.SANDBOX_TEST_RECIPIENT;
const REQUIRED_VARS = SANDBOX_MODE
  ? ['RESEND_API_KEY', 'FROM_EMAIL', 'SANDBOX_TEST_RECIPIENT']
  : ['RESEND_API_KEY', 'FROM_EMAIL', 'MAILOSAUR_API_KEY', 'MAILOSAUR_SERVER_ID'];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  console.log('Skipping Resend integration test — missing required environment variable(s):');
  for (const v of missing) console.log(`  - ${v}`);
  console.log('\nThis is expected in most environments (including CI without secrets configured).');
  console.log('Set these and re-run `npm run test:email:resend` to actually exercise real delivery.');
  console.log('\n(Using onboarding@resend.dev with no verified domain? Set SANDBOX_TEST_RECIPIENT to');
  console.log('your Resend account\'s own signup email instead of the Mailosaur variables.)');
  process.exit(0); // exit 0 deliberately — an unconfigured environment is not a test failure
}
if (SANDBOX_MODE) {
  console.log('SANDBOX MODE: routing delivery to SANDBOX_TEST_RECIPIENT instead of Mailosaur.');
  console.log('Steps 1-8 (submission, database, notification, Arabic template) are still fully');
  console.log('automated. Final delivery confirmation will be a one-time manual inbox check.\n');
}

// ---------------------------------------------------------------------
// Minimal Mailosaur REST client. Swap this object out for a different
// provider's equivalent calls if you're not using Mailosaur — nothing
// else in this file needs to change.
// ---------------------------------------------------------------------
const mailosaur = {
  testAddress: SANDBOX_MODE ? process.env.SANDBOX_TEST_RECIPIENT : `${Math.random().toString(36).slice(2, 10)}@${process.env.MAILOSAUR_SERVER_ID}.mailosaur.net`,

  request(method, urlPath) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'mailosaur.com',
        path: `/api${urlPath}`,
        method,
        auth: `${process.env.MAILOSAUR_API_KEY}:`,
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch { resolve(null); }
          } else {
            reject(new Error(`Mailosaur API ${method} ${urlPath} -> HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  },

  /** Polls GET /api/messages (the real, documented Mailosaur search endpoint) until a message arrives or the timeout elapses. Mailosaur's own official client libraries do exactly this polling internally inside their messages.get() method — there is no separate server-side "await" endpoint, which an earlier version of this script incorrectly assumed, producing a 400 error (confirmed by checking Mailosaur's actual API docs). */
  async awaitMessage(sentTo, timeoutSeconds = 30) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      const result = await this.request('GET', `/messages?server=${process.env.MAILOSAUR_SERVER_ID}&sentTo=${encodeURIComponent(sentTo)}`);
      const items = (result && result.items) || [];
      if (items.length > 0) {
        // Fetch the full message (the search endpoint only returns
        // summaries — no html/text body content), matching what the
        // official client libraries' .get() method returns.
        return this.request('GET', `/messages/${items[0].id}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`No matching message arrived within ${timeoutSeconds}s`);
  },

  /** Lists ALL messages for this address — used for the duplicate check. */
  async listMessages(sentTo) {
    const result = await this.request('GET', `/messages?server=${process.env.MAILOSAUR_SERVER_ID}&sentTo=${encodeURIComponent(sentTo)}`);
    return (result && result.items) || [];
  },
};

// ---------------------------------------------------------------------
// Start the real server against a throwaway DB, on a dedicated port,
// WITHOUT overriding RESEND_API_KEY/FROM_EMAIL — this is the one
// deliberate difference from tests/run.js, since we need real Resend
// delivery to actually happen this time.
// ---------------------------------------------------------------------
const TEST_DB = path.join(__dirname, '..', 'tests', '.tmp-resend-test-db.json');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.HADAM_DB_PATH = TEST_DB;
process.env.HADAM_TEST_MODE = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'resend-test-secret';
const TEST_PORT = 3988;

function call(host, urlPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = require('http').request({
      hostname: 'localhost', port: TEST_PORT, path: urlPath, method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', Host: `${host}:${TEST_PORT}`, ...(opts.headers || {}) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: {} }); } });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function uniq() { return Math.random().toString(36).slice(2, 9); }

let failed = false;
function assertEqual(actual, expected, label) {
  if (actual !== expected) { console.log(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed = true; }
  else console.log(`  OK: ${label}`);
}
function assertTrue(cond, label) {
  if (!cond) { console.log(`  FAIL: ${label}`); failed = true; }
  else console.log(`  OK: ${label}`);
}

(async () => {
  console.log('='.repeat(60));
  console.log('Resend live delivery integration test');
  console.log('='.repeat(60));
  console.log(`Test mailbox: ${mailosaur.testAddress}\n`);

  const { server, initDb } = require('../server');
  await initDb();
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  try {
    const sub = 'resendtest-' + uniq();
    const testSubject = `Resend integration test ${uniq()}`;
    const testMessage = `Live delivery test body ${uniq()}`;

    // Steps 2-3: fresh admin (Arabic) and fresh customer (English).
    // The admin's REAL email is the Mailosaur test address, so the
    // actual delivered email can be inspected.
    console.log('Step 2: creating admin with the Mailosaur test address...');
    const { body: tenant } = await call('localhost', '/api/platform/tenants', { method: 'POST', body: JSON.stringify({ subdomain: sub, storeName: 'Resend Test Store', adminName: 'Test Admin', adminEmail: mailosaur.testAddress, adminPassword: 'password123', plan: 'store' }) });
    // Teach the admin's Arabic preference via an authenticated request.
    await call(`${sub}.localhost`, '/api/admin/categories', { method: 'POST', headers: { Authorization: `Bearer ${tenant.token}`, 'X-Lang': 'ar' }, body: JSON.stringify({ name: 'General', group: 'store', fulfillment: 'manual' }) });

    console.log('Step 3: creating customer (English)...');
    const { body: reg } = await call(`${sub}.localhost`, '/api/auth/register', { method: 'POST', headers: { 'X-Lang': 'en' }, body: JSON.stringify({ name: 'Resend Test Customer', email: `resendtest-client-${uniq()}@test.dev`, password: 'password123' }) });

    // Step 4: submit the Store Contact form.
    console.log('Step 4: submitting the Store Contact form...');
    const { status: submitStatus, body: submitBody } = await call(`${sub}.localhost`, '/api/support/messages', { method: 'POST', headers: { Authorization: `Bearer ${reg.token}`, 'X-Lang': 'en' }, body: JSON.stringify({ subject: testSubject, message: testMessage }) });

    // Step 5: verify 201.
    assertEqual(submitStatus, 201, 'submission returned 201');

    // Step 6: verify the support_messages record.
    assertEqual(submitBody.message && submitBody.message.subject, testSubject, 'support_messages record has correct subject');
    assertEqual(submitBody.message && submitBody.message.message, testMessage, 'support_messages record has correct body');

    // Step 7: verify exactly one contact_message_received notification.
    const { body: notes } = await call(`${sub}.localhost`, '/api/admin/notifications', { headers: { Authorization: `Bearer ${tenant.token}` } });
    const matches = notes.notifications.filter(n => n.type === 'contact_message_received' && n.subject.includes(testSubject));
    assertEqual(matches.length, 1, 'exactly one contact_message_received notification recorded');

    // Step 8: verify it's rendered in Arabic.
    const notification = matches[0];
    assertTrue(notification && notification.subject.includes('رسالة جديدة من عميل'), 'notification subject is in Arabic (admin\'s stored language)');

    // Steps 9-12: the real sendRealEmail() call is fire-and-forget from the
    // HTTP handler's perspective (matching every other notification in this
    // app — email must never block or fail the customer's submission). This
    // means the actual HTTPS request to Resend's API may STILL be in flight
    // at this point, even though the notification record above already
    // exists (that part happens synchronously, before the network call).
    // Give it real time to complete before this script closes the server
    // and exits — otherwise the in-flight request gets aborted mid-send,
    // which would produce exactly the symptom of "steps 1-8 pass but no
    // email ever arrives" without there being any actual delivery problem.
    console.log('\nWaiting 5s for the fire-and-forget email send to actually complete over the network...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (SANDBOX_MODE) {
      console.log('\nSANDBOX MODE — automated verification stops here (steps 1-8 above are fully');
      console.log('automated and already passed). Resend has been asked to send the real email to:');
      console.log(`  ${mailosaur.testAddress}`);
      console.log('\nPlease check that inbox now and confirm, by eye, all of the following:');
      console.log('  [ ] the email actually arrived');
      console.log(`  [ ] sender matches your configured FROM_EMAIL (${process.env.FROM_EMAIL})`);
      console.log('  [ ] subject is in Arabic and reads: رسالة جديدة من عميل — ' + testSubject);
      console.log(`  [ ] body contains this exact test subject text: "${testSubject}"`);
      console.log(`  [ ] body contains this exact test message text: "${testMessage}"`);
      console.log('  [ ] only ONE copy arrived (no duplicates)');
      console.log('\nThis manual step exists ONLY because of the onboarding@resend.dev sandbox');
      console.log('restriction — once a real domain is verified in Resend, switch to');
      console.log('MAILOSAUR_API_KEY/MAILOSAUR_SERVER_ID instead of SANDBOX_TEST_RECIPIENT and');
      console.log('this entire confirmation becomes automated too.');
    } else {
      console.log('\nStep 9-10: waiting for the real email to arrive at the test mailbox (up to 30s)...');
      let received;
      try {
        received = await mailosaur.awaitMessage(mailosaur.testAddress, 30);
      } catch (e) {
        console.log(`  FAIL: no email arrived within the timeout — ${e.message}`);
        failed = true;
      }

      if (received) {
        // Step 11: verify sender, recipient, subject, body.
        const actualFrom = received.from && received.from[0] && received.from[0].email;
        const actualTo = received.to && received.to[0] && received.to[0].email;
        const actualSubject = received.subject;
        const actualBodyText = (received.text && received.text.body) || '';

        assertEqual(actualFrom, process.env.FROM_EMAIL, 'sender matches configured FROM_EMAIL');
        assertEqual(actualTo, mailosaur.testAddress, 'recipient matches the test mailbox');
        assertTrue(actualSubject && actualSubject.includes('رسالة جديدة من عميل'), 'delivered email subject is in Arabic');
        assertTrue(actualBodyText.includes(testSubject), "delivered email body contains the customer's original subject text");
        assertTrue(actualBodyText.includes(testMessage), "delivered email body contains the customer's original message text");

        // Step 12: fail on zero or duplicate emails.
        const all = await mailosaur.listMessages(mailosaur.testAddress);
        assertEqual(all.length, 1, 'exactly one email received at the test mailbox (no duplicates)');
      }
    }

  } catch (err) {
    console.error('\nTest run crashed unexpectedly:', err);
    failed = true;
  } finally {
    server.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  }

  console.log('\n' + '='.repeat(60));
  console.log(failed ? 'RESULT: FAILED' : 'RESULT: PASSED');
  console.log('='.repeat(60));
  process.exit(failed ? 1 : 0);
})();
