'use strict';
const fs = require('fs');
const crypto = require('crypto');

function readVar(name) {
  const content = fs.readFileSync('my-supabase-keys.sh', 'utf8');
  const line = content.split('\n').find(l => l.includes(name));
  if (!line) throw new Error('No ' + name + ' line found in my-supabase-keys.sh');
  const m = line.match(new RegExp(name + '=["\']?([^"\'\\s]+)'));
  if (!m) throw new Error('Could not parse ' + name);
  return m[1];
}

function signPayload(secret, svixId, svixTimestamp, rawBody) {
  const secretBytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sig = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  return `v1,${sig}`;
}

async function main() {
  const apiKey = readVar('RESEND_API_KEY');
  const webhookSecret = readVar('RESEND_WEBHOOK_SECRET');

  console.log('[test] Fetching the most recently sent email from Resend...');
  const listRes = await fetch('https://api.resend.com/emails?limit=1', { headers: { Authorization: `Bearer ${apiKey}` } });
  const listData = await listRes.json().catch(() => ({}));
  const recent = (listData.data && listData.data[0]) || listData[0];
  if (!recent || !recent.id) {
    console.error('[test] Could not find a recent email. Did you click Save within the last few seconds?');
    process.exit(1);
  }
  console.log('[test] Using real email id:', recent.id, 'to:', recent.to);

  const svixId = 'msg_test_' + Date.now();
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const bodyObj = { type: 'email.delivered', data: { email_id: recent.id, id: recent.id, to: recent.to, created_at: new Date().toISOString() } };
  const rawBody = JSON.stringify(bodyObj);
  const signature = signPayload(webhookSecret, svixId, svixTimestamp, rawBody);

  console.log('[test] Sending simulated webhook event to your local server...');
  const res = await fetch('http://localhost:3000/api/webhooks/resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': signature },
    body: rawBody,
  });
  const data = await res.json().catch(() => ({}));
  console.log('[test] Server responded:', res.status, JSON.stringify(data));
  console.log('[test] Now check the SERVER terminal window for a [resend-webhook] verified event line, and wait ~20s for the fallback check to defer to it.');
}

main().catch(e => { console.error('[test] Failed:', e && (e.stack || e.message || e)); process.exit(1); });
