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
  { label: 'track whether the item was already "shipped" before this save, alongside the existing delivered tracking', expect: 1,
    find: "  const wasAlreadyDelivered = item.status === 'delivered';",
    replace: "  const wasAlreadyDelivered = item.status === 'delivered';\n  const wasAlreadyShipped = item.status === 'shipped';" },
  { label: 'send a "your order has shipped" email on the fresh pending/processing -> shipped transition', expect: 1,
    find: "  if (item.status === 'delivered' && !wasAlreadyDelivered) {\n    const deliveryToken = signToken(",
    replace: "  if (item.status === 'shipped' && !wasAlreadyShipped) {\n    const subject = `Your order from ${tenant.name} has shipped`;\n    const text = `Hi,\\n\\nYour order is on its way!\\n\\nItem: ${item.name}` + (item.trackingNote ? `\\nTracking: ${item.trackingNote}` : '') + `\\n\\nWe'll email you again once it's marked as delivered.\\n\\n— ${tenant.name}`;\n    db.notifications.push({ id: newId('notif'), tenantId: tenant.id, type: 'shipment_notice', to: order.clientEmail, subject, body: text, sentAt: Date.now() });\n    console.log('[shipped-notify] recipient resolved to:', order.clientEmail);\n    try {\n      await sendRealEmail({ to: order.clientEmail, subject, text });\n      console.log('[shipped-notify] sendRealEmail resolved OK');\n    } catch (e) {\n      console.error('[shipped-notify] sendRealEmail FAILED:', e && (e.stack || e.message || e));\n    }\n  }\n  if (item.status === 'delivered' && !wasAlreadyDelivered) {\n    const deliveryToken = signToken(" },
]);

console.log('\nDone.');
