/**
 * Standalone test for lib/auth.js — run this against your REAL Supabase
 * project to verify registration/login/session-checking actually works,
 * before we touch server.js at all.
 *
 * Setup (do this once):
 *   1. npm install
 *   2. Set three environment variables (get these from your Supabase
 *      project's Settings → API page):
 *        SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *      On Windows (Git Bash), you can set them just for this one run:
 *        SUPABASE_URL="https://xxxxx.supabase.co" SUPABASE_ANON_KEY="..." SUPABASE_SERVICE_ROLE_KEY="..." node lib/test-auth.js
 *
 * Run it:
 *   node lib/test-auth.js
 *
 * What it does, step by step, printing the result of each:
 *   1. Registers a brand-new test account
 *   2. Logs in with that same account
 *   3. Verifies the session token is valid (getUserFromToken)
 *   4. Changes that account's password
 *   5. Logs in again with the NEW password, to confirm the change worked
 *   6. Deletes the test account, cleaning up after itself
 */
const auth = require('./auth');

const testEmail = `hadam-test-${Date.now()}@mailinator.com`; // a real, valid domain — example.com is reserved for documentation and some validators (including Supabase's) correctly reject it as fake
const testPassword = 'TestPassword123!';
const newPassword = 'NewTestPassword456!';

async function main() {
  console.log(`Using test email: ${testEmail}\n`);

  console.log('1. Registering...');
  const { user } = await auth.register(testEmail, testPassword, 'Test User');
  console.log(`   OK — created user id: ${user.id}\n`);

  console.log('2. Logging in...');
  const { session } = await auth.login(testEmail, testPassword);
  if (!session) {
    console.log('   No session returned — this usually means "Confirm email" is turned on in your');
    console.log('   Supabase Auth settings, so the account needs email confirmation before it can log in.');
    console.log('   Either confirm the test email manually, or turn off email confirmation for testing.');
    process.exitCode = 1;
    return;
  }
  console.log(`   OK — got an access token\n`);

  console.log('3. Verifying the session token...');
  const verifiedUser = await auth.getUserFromToken(session.access_token);
  console.log(`   OK — token belongs to: ${verifiedUser.email}\n`);

  console.log('4. Changing password...');
  await auth.updatePassword(session.access_token, newPassword);
  console.log('   OK\n');

  console.log('5. Logging in again with the NEW password...');
  const { session: newSession } = await auth.login(testEmail, newPassword);
  console.log(`   OK — new password works, got a fresh session\n`);

  console.log('6. Cleaning up — deleting the test account...');
  await auth.deleteAccount(user.id);
  console.log('   OK — test account removed\n');

  console.log('ALL CHECKS PASSED.');
}

main().catch(err => {
  console.error('\nFAILED:', err.message);
  process.exitCode = 1;
});
