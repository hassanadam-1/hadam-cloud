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

applyPatches('public/app.js', [
  { label: 'show the admin a clear sent/failed indicator for the notification email after Save', expect: 1,
    find: "  try {\n    await api(`/api/employee/orders/${orderId}/items/${productId}`, { method: 'PATCH', body: JSON.stringify(body) });\n    renderEmployeeTab();\n  } catch (e) { alert(e.message); }\n}",
    replace: "  try {\n    const res = await api(`/api/employee/orders/${orderId}/items/${productId}`, { method: 'PATCH', body: JSON.stringify(body) });\n    if (res && res.notification && res.notification.attempted) {\n      if (res.notification.sent) {\n        alert(`Saved. Notification email sent to ${res.notification.to}.`);\n      } else {\n        alert(`Saved \\u2014 but the notification email failed to send (${res.notification.error || res.notification.reason || 'unknown error'}). The status change itself was saved; only the email failed.`);\n      }\n    }\n    renderEmployeeTab();\n  } catch (e) { alert(e.message); }\n}" },
]);

console.log('\nDone.');
