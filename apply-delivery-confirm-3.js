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

applyPatches('server.js', [
  { label: 'make delivery-confirmation email send observable (log recipient + real error instead of swallowing it)', expect: 1,
    find: "    db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'delivery_confirmation_requested', to: order.clientEmail, subject, body: text, sentAt: Date.now() });\n    try { await sendRealEmail({ to: order.clientEmail, subject, text }); } catch { /* best-effort */ }",
    replace: "    db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'delivery_confirmation_requested', to: order.clientEmail, subject, body: text, sentAt: Date.now() });\n    console.log('[delivery-link] recipient resolved to:', order.clientEmail);\n    try {\n      await sendRealEmail({ to: order.clientEmail, subject, text });\n      console.log('[delivery-link] sendRealEmail resolved OK');\n    } catch (e) {\n      console.error('[delivery-link] sendRealEmail FAILED:', e && (e.stack || e.message || e));\n    }" },
]);

console.log('\nDone.');
