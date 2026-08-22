'use strict';
const fs = require('fs');
const path = require('path');

function applyPatches(filePath, patches) {
  const full = path.resolve(filePath);
  let content = fs.readFileSync(full, 'utf8');
  for (const p of patches) {
    const count = content.split(p.find).length - 1;
    if (count === 0) { console.log(`SKIP (already applied or not found) [${filePath}] ${p.label}`); continue; }
    if (p.expect && count !== p.expect) throw new Error(`"${p.label}" in ${filePath} matched ${count}x, expected ${p.expect}. Aborting — check manually.`);
    content = content.split(p.find).join(p.replace);
    console.log(`OK [${filePath}] ${p.label} (${count}x)`);
  }
  fs.writeFileSync(full, content, 'utf8');
}

const STARTUP_CHECK = [
"",
"// Automatic, unattended check of the Resend API key's actual permission",
"// level, run once at startup — so a restricted key is caught the moment",
"// the server comes up, not discovered later during a real customer order.",
"(async () => {",
"  const apiKey = process.env.RESEND_API_KEY;",
"  if (!apiKey) {",
"    console.warn('[email-key-check] RESEND_API_KEY is not set \\u2014 real email delivery is disabled.');",
"    return;",
"  }",
"  try {",
"    const res = await fetch('https://api.resend.com/emails?limit=1', { headers: { Authorization: `Bearer ${apiKey}` } });",
"    const data = await res.json().catch(() => ({}));",
"    if (res.status === 401 && data && /restricted to only send emails/i.test(data.message || '')) {",
"      console.error('==================================================================');",
"      console.error('[email-key-check] WARNING: RESEND_API_KEY is a \"Sending access\" key.');",
"      console.error('[email-key-check] Automatic delivery-status verification is DISABLED');",
"      console.error('[email-key-check] until this key is switched to \"Full access\" at');",
"      console.error('[email-key-check] resend.com/api-keys. Emails can still SEND with this');",
"      console.error('[email-key-check] key \\u2014 only the automatic delivery check is blocked.');",
"      console.error('==================================================================');",
"    } else if (!res.ok) {",
"      console.error(`[email-key-check] Could not verify RESEND_API_KEY (unexpected response ${res.status}): ${data.message || JSON.stringify(data)}`);",
"    } else {",
"      console.log('[email-key-check] RESEND_API_KEY has full access \\u2014 automatic delivery verification is ACTIVE.');",
"    }",
"  } catch (e) {",
"    console.error('[email-key-check] Could not reach Resend to verify the API key:', e && (e.message || e));",
"  }",
"})();",
].join('\n');

applyPatches('server.js', [
  { label: 'add automatic startup check of the Resend API key permission level', expect: 1,
    find: "    server.listen(PORT, () => console.log(`Hadam platform listening on http://localhost:${PORT} (base domain: ${BASE_DOMAIN}, db driver: ${process.env.HADAM_DB_DRIVER || 'file'})`));",
    replace: "    server.listen(PORT, () => console.log(`Hadam platform listening on http://localhost:${PORT} (base domain: ${BASE_DOMAIN}, db driver: ${process.env.HADAM_DB_DRIVER || 'file'})`));" + STARTUP_CHECK },
]);

console.log('\nDone.');
