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

const HELPER_FN = [
"// Automatic, unattended delivery verification. Resend accepting a message",
"// (the API call succeeding) only means it entered their sending pipeline —",
"// it does NOT mean the recipient's inbox actually received it (could still",
"// bounce, get flagged as spam by the receiving server, etc). This checks",
"// back with Resend's own event history a short while after sending and logs",
"// a loud, unmissable warning if the message did not actually deliver — no",
"// human has to remember to check Gmail or the Resend dashboard for this.",
"function scheduleResendDeliveryCheck(tag, emailId, to) {",
"  if (!emailId) return;",
"  setTimeout(async () => {",
"    try {",
"      const apiKey = process.env.RESEND_API_KEY;",
"      if (!apiKey) { console.error(tag + ' automatic delivery check skipped — RESEND_API_KEY not set.'); return; }",
"      const res = await fetch('https://api.resend.com/emails/' + emailId, { headers: { Authorization: 'Bearer ' + apiKey } });",
"      const data = await res.json().catch(() => ({}));",
"      if (!res.ok) {",
"        console.error(tag + ' AUTOMATIC DELIVERY CHECK FAILED to query Resend for ' + to + ':', res.status, data.message || JSON.stringify(data));",
"        return;",
"      }",
"      const status = data.last_event || 'unknown';",
"      if (status === 'bounced' || status === 'complained') {",
"        console.error(tag + ' AUTOMATIC DELIVERY CHECK: email to ' + to + ' was NOT delivered (status: ' + status + '). The customer almost certainly did not receive it — this needs attention.');",
"      } else if (status === 'unknown') {",
"        console.error(tag + ' AUTOMATIC DELIVERY CHECK: Resend has no event status yet for the email to ' + to + ' (checked 20s after sending). Treat as unconfirmed — will not auto-retry.');",
"      } else {",
"        console.log(tag + ' automatic delivery check: email to ' + to + ' status = ' + status + ' — looks fine.');",
"      }",
"    } catch (e) {",
"      console.error(tag + ' automatic delivery check errored:', e && (e.message || e));",
"    }",
"  }, 20000);",
"}",
"",
].join('\n');

const SHIPPED_CALL = "            if (emailRes && emailRes.sent) scheduleResendDeliveryCheck('[shipped-notify]', emailRes.id, clientUser.user.email);";
const DELIVERED_CALL = "            if (emailRes && emailRes.sent) scheduleResendDeliveryCheck('[delivery-link]', emailRes.id, clientUser.user.email);";

applyPatches('server.js', [
  { label: 'collapse the 3 duplicate helper function copies back to 1', expect: 1,
    find: HELPER_FN + HELPER_FN + HELPER_FN,
    replace: HELPER_FN },
  { label: 'collapse the 3 duplicate shipped-notify calls back to 1', expect: 1,
    find: SHIPPED_CALL + "\n" + SHIPPED_CALL + "\n" + SHIPPED_CALL,
    replace: SHIPPED_CALL },
  { label: 'collapse the 3 duplicate delivery-link calls back to 1', expect: 1,
    find: DELIVERED_CALL + "\n" + DELIVERED_CALL + "\n" + DELIVERED_CALL,
    replace: DELIVERED_CALL },
]);

console.log('\nDone.');
