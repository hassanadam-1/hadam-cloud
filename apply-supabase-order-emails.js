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
  { label: 'add the missing "your order has shipped" email to the real Supabase order-status route', expect: 1,
    find: "    if (patch.status === 'delivered' && item.status !== 'delivered') {\n      try {\n        const { data: orderRow } = await admin.from('orders').select('client_id').eq('id', params.orderId).maybeSingle();",
    replace: "    if (patch.status === 'shipped' && item.status !== 'shipped') {\n      try {\n        const { data: orderRow } = await admin.from('orders').select('client_id').eq('id', params.orderId).maybeSingle();\n        if (orderRow) {\n          const { data: clientUser } = await admin.auth.admin.getUserById(orderRow.client_id);\n          if (clientUser && clientUser.user) {\n            const subject = `Your order from ${tenant.name} has shipped`;\n            const text = `Hi,\\n\\nYour order is on its way!\\n\\nItem: ${updated.name}` + (updated.tracking_note ? `\\nTracking: ${updated.tracking_note}` : '') + `\\n\\nWe'll email you again once it's marked as delivered.\\n\\n— ${tenant.name}`;\n            await admin.from('notifications').insert({ tenant_id: tenant.id, type: 'shipment_notice', to_email: clientUser.user.email, subject, body: text });\n            console.log('[shipped-notify] recipient resolved to:', clientUser.user.email);\n            await sendRealEmail({ to: clientUser.user.email, subject, text });\n            console.log('[shipped-notify] sendRealEmail resolved OK');\n          }\n        }\n      } catch (e) { console.error('[shipped-notify] sendRealEmail FAILED:', e && (e.stack || e.message || e)); }\n    }\n    if (patch.status === 'delivered' && item.status !== 'delivered') {\n      try {\n        const { data: orderRow } = await admin.from('orders').select('client_id').eq('id', params.orderId).maybeSingle();" },
  { label: 'make the real delivered-email send observable (log recipient + success, not just failure)', expect: 1,
    find: "            await admin.from('notifications').insert({ tenant_id: tenant.id, type: 'delivery_confirmation_requested', to_email: clientUser.user.email, subject, body: text });\n            await sendRealEmail({ to: clientUser.user.email, subject, text });\n          }\n        }\n      } catch (e) { console.error('[delivery-notify] failed:', e.message); }",
    replace: "            await admin.from('notifications').insert({ tenant_id: tenant.id, type: 'delivery_confirmation_requested', to_email: clientUser.user.email, subject, body: text });\n            console.log('[delivery-link] recipient resolved to:', clientUser.user.email);\n            await sendRealEmail({ to: clientUser.user.email, subject, text });\n            console.log('[delivery-link] sendRealEmail resolved OK');\n          }\n        }\n      } catch (e) { console.error('[delivery-link] sendRealEmail FAILED:', e && (e.stack || e.message || e)); }" },
]);

console.log('\nDone.');
