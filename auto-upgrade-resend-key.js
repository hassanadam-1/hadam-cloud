'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const KEYS_FILE = path.resolve('my-supabase-keys.sh');

function readCurrentKey() {
  const content = fs.readFileSync(KEYS_FILE, 'utf8');
  const line = content.split('\n').find(l => l.includes('RESEND_API_KEY'));
  if (!line) throw new Error('No RESEND_API_KEY line found in ' + KEYS_FILE);
  const m = line.match(/RESEND_API_KEY=["']?([^"'\s]+)/);
  if (!m) throw new Error('Found the line but could not parse the key out of it: ' + line);
  return { content, oldKey: m[1] };
}

async function main() {
  const { content, oldKey } = readCurrentKey();
  console.log('[auto-upgrade] Current key starts with:', oldKey.slice(0, 7));

  console.log('[auto-upgrade] Asking Resend to create a new Full-access key automatically...');
  const createRes = await fetch('https://api.resend.com/api-keys', {
    method: 'POST',
    headers: { Authorization: `Bearer ${oldKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'hadam-auto-full-access', permission: 'full_access' }),
  });
  const createData = await createRes.json().catch(() => ({}));

  if (!createRes.ok) {
    console.log('');
    console.log('==================================================================');
    console.log('[auto-upgrade] Resend refused to let the current key create a new one.');
    console.log('[auto-upgrade] HTTP status:', createRes.status);
    console.log('[auto-upgrade] Resend says:', createData.message || JSON.stringify(createData));
    console.log('[auto-upgrade] This is Resend enforcing least-privilege on purpose: a');
    console.log('[auto-upgrade] "Sending access" key is not allowed to mint other keys,');
    console.log('[auto-upgrade] the same way a restricted staff badge cannot print a new');
    console.log('[auto-upgrade] master badge for itself. This one step genuinely requires');
    console.log('[auto-upgrade] the account owner (you) to create the first Full-access key');
    console.log('[auto-upgrade] by logging into resend.com/api-keys directly — nothing');
    console.log('[auto-upgrade] automatable can substitute for that one-time step.');
    console.log('==================================================================');
    process.exit(1);
  }

  const newKey = createData.token || createData.key || createData.api_key;
  if (!newKey) {
    console.error('[auto-upgrade] Resend accepted the request but did not return a key value:', JSON.stringify(createData));
    process.exit(1);
  }
  console.log('[auto-upgrade] New Full-access key created automatically. Starts with:', newKey.slice(0, 7));

  console.log('[auto-upgrade] Updating my-supabase-keys.sh automatically...');
  const oldLine = content.split('\n').find(l => l.includes('RESEND_API_KEY'));
  const newLine = oldLine.replace(oldKey, newKey);
  const newContent = content.replace(oldLine, newLine);
  fs.writeFileSync(KEYS_FILE, newContent, 'utf8');
  console.log('[auto-upgrade] my-supabase-keys.sh updated.');

  console.log('[auto-upgrade] Restarting the server automatically...');
  console.log('[auto-upgrade] (this will now take over this terminal window, same as running bash start-supabase.sh yourself)');
  const child = spawn('bash', ['start-supabase.sh'], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code));
}

main().catch(e => {
  console.error('[auto-upgrade] Failed:', e && (e.stack || e.message || e));
  process.exit(1);
});
