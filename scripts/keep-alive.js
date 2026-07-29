/**
 * Keep-alive script for Supabase's free tier, which pauses a project after
 * 7 days with no database activity. This script does one small, genuinely
 * real read query — not just an HTTP ping to an unrelated URL, since the
 * pause is specifically about DATABASE inactivity — so Supabase counts it
 * as real activity and the 7-day clock resets.
 *
 * Meant to run on a schedule well under 7 days (see the GitHub Actions
 * workflow in .github/workflows/keep-alive.yml, which runs this every 3
 * days) so a missed run or two still leaves margin before any real risk
 * of pausing.
 *
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY as environment variables —
 * the same ones used everywhere else in this project.
 */
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_ANON_KEY must be set.');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const { error } = await supabase.from('tenants').select('id').limit(1);
  if (error) {
    console.error('Keep-alive query failed:', error.message);
    process.exit(1);
  }
  console.log(`Keep-alive successful at ${new Date().toISOString()} — database is active.`);
}

main();
