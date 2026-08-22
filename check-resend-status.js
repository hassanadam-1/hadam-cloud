'use strict';
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('RESEND_API_KEY is not set in this shell.');
  console.error('Run:  source my-supabase-keys.sh   first, then re-run this script.');
  process.exit(1);
}

(async () => {
  const res = await fetch('https://api.resend.com/emails?limit=10', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Resend API error:', res.status, JSON.stringify(data));
    process.exit(1);
  }
  const list = data.data || data.emails || (Array.isArray(data) ? data : []);
  if (!list.length) {
    console.log('No sent emails found in your Resend account.');
    return;
  }
  console.log('Most recent Resend sends (newest first):\n');
  for (const e of list) {
    const to = Array.isArray(e.to) ? e.to.join(', ') : e.to;
    console.log(`[${e.last_event || 'unknown'}]  ${e.created_at}  to=${to}  subject="${e.subject}"`);
  }
})();
