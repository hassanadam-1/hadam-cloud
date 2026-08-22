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

applyPatches('server.js', [
  { label: 'add the automatic Resend delivery-check helper before the order-status route', expect: 1,
    find: "route('PATCH', '/api/employee/orders/:orderId/items/:productId', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {",
    replace: HELPER_FN + "route('PATCH', '/api/employee/orders/:orderId/items/:productId', { hostScope: 'tenant', auth: true, roles: ['employee', 'admin'] }, async (req, res, params, body, query, user, tenant) => {" },
  { label: 'wire the automatic check into the shipped-email send', expect: 1,
    find: "            const emailRes = await sendRealEmail({ to: clientUser.user.email, subject, text });\n            console.log('[shipped-notify] sendRealEmail resolved OK');\n            notificationResult = { type: 'shipped', attempted: true, sent: !!(emailRes && emailRes.sent), to: clientUser.user.email, reason: emailRes && emailRes.reason };",
    replace: "            const emailRes = await sendRealEmail({ to: clientUser.user.email, subject, text });\n            console.log('[shipped-notify] sendRealEmail resolved OK');\n            notificationResult = { type: 'shipped', attempted: true, sent: !!(emailRes && emailRes.sent), to: clientUser.user.email, reason: emailRes && emailRes.reason };\n            if (emailRes && emailRes.sent) scheduleResendDeliveryCheck('[shipped-notify]', emailRes.id, clientUser.user.email);" },
  { label: 'wire the automatic check into the delivered-email send', expect: 1,
    find: "            const emailRes = await sendRealEmail({ to: clientUser.user.email, subject, text });\n            console.log('[delivery-link] sendRealEmail resolved OK');\n            notificationResult = { type: 'delivered', attempted: true, sent: !!(emailRes && emailRes.sent), to: clientUser.user.email, reason: emailRes && emailRes.reason };",
    replace: "            const emailRes = await sendRealEmail({ to: clientUser.user.email, subject, text });\n            console.log('[delivery-link] sendRealEmail resolved OK');\n            notificationResult = { type: 'delivered', attempted: true, sent: !!(emailRes && emailRes.sent), to: clientUser.user.email, reason: emailRes && emailRes.reason };\n            if (emailRes && emailRes.sent) scheduleResendDeliveryCheck('[delivery-link]', emailRes.id, clientUser.user.email);" },
]);

console.log('\nDone.');
