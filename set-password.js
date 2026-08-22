// Run this with: node set-password.js
// Reads your existing Supabase credentials from my-supabase-keys.sh (must be sourced first, or edit directly below).

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — make sure you ran: source my-supabase-keys.sh');
  process.exit(1);
}

const USER_ID = 'b9d81148-1289-43e4-9312-e877c6b23e38'; // hassan.adam2@gmail.com
const NEW_PASSWORD = 'HadamAdmin2026!'; // change this to whatever you want, must be 6+ characters

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await admin.auth.admin.updateUserById(USER_ID, { password: NEW_PASSWORD });
  if (error) {
    console.error('FAILED:', error.message);
    return;
  }
  console.log('Password set successfully for:', data.user.email);
  console.log('New password is:', NEW_PASSWORD);
}

main();
