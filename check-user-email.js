'use strict';
// One-off diagnostic — looks up which email address this user ID belongs
// to, using the same service-role admin client your server already uses.
const { supabaseAdmin } = require('./lib/supabaseClient');

async function main() {
  const admin = supabaseAdmin();
  const userId = 'b9d81148-1289-43e4-9312-e877c6b23e38';
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error('[check-user-email] Error:', error);
    process.exit(1);
  }
  console.log('[check-user-email] Email:', data.user.email);
}

main();
