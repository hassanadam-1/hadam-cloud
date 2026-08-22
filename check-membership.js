'use strict';
// One-off diagnostic — uses the SAME service-role Supabase admin client
// your running server already uses (via lib/supabaseClient.js and whatever
// env vars it already reads), so no new credentials are needed. Bypasses
// RLS entirely (service role), so this shows the raw truth of what's in
// the table, regardless of any policy.
const { supabaseAdmin } = require('./lib/supabaseClient');

async function main() {
  const admin = supabaseAdmin();
  const userId = 'b9d81148-1289-43e4-9312-e877c6b23e38';
  const tenantId = '4211e992-3781-4116-b924-4123d4a047e3';
  const { data, error } = await admin
    .from('tenant_memberships')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);
  if (error) {
    console.error('[check-membership] Query error:', error);
    process.exit(1);
  }
  console.log('[check-membership] Rows found:', data.length);
  console.log(JSON.stringify(data, null, 2));
}

main();
