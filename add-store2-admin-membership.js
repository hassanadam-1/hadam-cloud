'use strict';
// One-off, targeted fix: grants hassan.adam2@gmail.com an 'admin' role at
// the 'store2' tenant specifically. This ONLY inserts one new row into
// tenant_memberships for this exact user_id + tenant_id pair — it never
// updates or deletes any other row, so no other store's memberships or
// permissions, and no other user's memberships, are touched in any way.
// Safe to re-run: checks for an existing row first and does nothing if
// one's already there, rather than creating a duplicate.
const { supabaseAdmin } = require('./lib/supabaseClient');

const USER_ID = 'b9d81148-1289-43e4-9312-e877c6b23e38'; // hassan.adam2@gmail.com
const TENANT_ID = '4211e992-3781-4116-b924-4123d4a047e3'; // store2
const ROLE = 'admin';

async function main() {
  const admin = supabaseAdmin();

  const { data: existing, error: findErr } = await admin
    .from('tenant_memberships')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('tenant_id', TENANT_ID);
  if (findErr) {
    console.error('[add-store2-admin-membership] Error checking for existing row:', findErr);
    process.exit(1);
  }
  if (existing.length > 0) {
    console.log('[add-store2-admin-membership] Already exists, nothing to do:', JSON.stringify(existing, null, 2));
    return;
  }

  const { data: inserted, error: insertErr } = await admin
    .from('tenant_memberships')
    .insert({ user_id: USER_ID, tenant_id: TENANT_ID, role: ROLE })
    .select();
  if (insertErr) {
    console.error('[add-store2-admin-membership] Insert failed:', insertErr);
    process.exit(1);
  }
  console.log('[add-store2-admin-membership] Inserted successfully:', JSON.stringify(inserted, null, 2));
}

main();
