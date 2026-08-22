'use strict';
const fs = require('fs');
const path = require('path');

const KEYS_FILE = path.resolve('my-supabase-keys.sh');
const TUNNEL_URL = 'https://quiet-lights-stare.loca.lt';
const WEBHOOK_URL = TUNNEL_URL + '/api/webhooks/resend';

function readCurrentKey() {
  const content = fs.readFileSync(KEYS_FILE, 'utf8');
  const line = content.split('\n').find(l => l.includes('RESEND_API_KEY'));
  if (!line) throw new Error('No RESEND_API_KEY line found in ' + KEYS_FILE);
  const m = line.match(/RESEND_API_KEY=["']?([^"'\s]+)/);
  if (!m) throw new Error('Could not parse the key out of: ' + line);
  return m[1];
}

function writeWebhookSecret(secret) {
  const content = fs.readFileSync(KEYS_FILE, 'utf8');
  const line = content.split('\n').find(l => l.includes('RESEND_WEBHOOK_SECRET'));
  if (line) {
    fs.writeFileSync(KEYS_FILE, content.replace(line, `export RESEND_WEBHOOK_SECRET="${secret}"`), 'utf8');
  } else {
    fs.writeFileSync(KEYS_FILE, content.trimEnd() + `\nexport RESEND_WEBHOOK_SECRET="${secret}"\n`, 'utf8');
  }
}

async function main() {
  const apiKey = readCurrentKey();
  console.log('[register-webhook] Using tunnel URL:', WEBHOOK_URL);

  console.log('[register-webhook] Checking for old tunnel webhooks to clean up...');
  try {
    const listRes = await fetch('https://api.resend.com/webhooks', { headers: { Authorization: `Bearer ${apiKey}` } });
    const listData = await listRes.json().catch(() => ({}));
    const existing = listData.data || listData.webhooks || [];
    for (const wh of existing) {
      if (wh.endpoint && (wh.endpoint.includes('trycloudflare.com') || wh.endpoint.includes('.loca.lt'))) {
        console.log('[register-webhook] Removing stale tunnel webhook:', wh.endpoint);
        await fetch(`https://api.resend.com/webhooks/${wh.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } });
      }
    }
  } catch (e) {
    console.warn('[register-webhook] Cleanup step failed (non-fatal):', e.message);
  }

  console.log('[register-webhook] Creating new webhook...');
  const createRes = await fetch('https://api.resend.com/webhooks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: WEBHOOK_URL,
      events: ['email.delivered', 'email.bounced', 'email.complained', 'email.delivery_delayed', 'email.opened', 'email.clicked'],
    }),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    console.error('[register-webhook] FAILED:', createRes.status, createData.message || JSON.stringify(createData));
    process.exit(1);
  }

  const secret = createData.signing_secret || createData.secret;
  if (!secret) {
    console.error('[register-webhook] Webhook created but no signing secret was returned:', JSON.stringify(createData));
    process.exit(1);
  }
  writeWebhookSecret(secret);
  console.log('[register-webhook] SUCCESS. Webhook registered and RESEND_WEBHOOK_SECRET saved to my-supabase-keys.sh.');
  console.log('[register-webhook] Restart the server now (Ctrl+C then bash start-supabase.sh in the server window) to load the new secret.');
}

main().catch(e => {
  console.error('[register-webhook] Failed:', e && (e.stack || e.message || e));
  process.exit(1);
});
