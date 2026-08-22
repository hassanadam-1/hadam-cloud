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

async function getLatest(apiKey) {
  const res = await fetch('https://api.resend.com/emails?limit=1', { headers: { Authorization: `Bearer ${apiKey}` } });
  const data = await res.json().catch(() => ({}));
  return (data.data && data.data[0]) || data[0] || null;
}

async function main() {
  const apiKey = readVar('RESEND_API_KEY');
  const webhookSecret = readVar('RESEND_WEBHOOK_SECRET');

  const baseline = await getLatest(apiKey);
  const baselineId = baseline ? baseline.id : null;
  console.log('[watch] Baseline email id:', baselineId || '(none yet)');
  console.log('[watch] Take your time going to the browser and clicking Save. Checking every 3s for up to 5 minutes...');

  const deadline = Date.now() + 300000;
  let ticks = 0;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    ticks++;
    if (ticks % 10 === 0) console.log('[watch] Still waiting... (' + Math.round((Date.now() - (deadline - 300000)) / 1000) + 's elapsed)');
    const latest = await getLatest(apiKey);
    if (latest && latest.id !== baselineId) {
      console.log('[watch] New email detected:', latest.id, 'to:', latest.to);
      const svixId = 'msg_test_' + Date.now();
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: latest.id, id: latest.id, to: latest.to, created_at: new Date().toISOString() } });
      const signature = signPayload(webhookSecret, svixId, svixTimestamp, rawBody);
      const res = await fetch('http://localhost:3000/api/webhooks/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': signature },
        body: rawBody,
      });
      const data = await res.json().catch(() => ({}));
      console.log('[watch] Sent simulated webhook. Server responded:', res.status, JSON.stringify(data));
      console.log('[watch] Done — check the SERVER terminal window now.');
      return;
    }
  }
  console.log('[watch] Timed out after 5 minutes without seeing a new email. Did the Save go through?');
}

main().catch(e => { console.error('[watch] Failed:', e && (e.stack || e.message || e)); process.exit(1); });
