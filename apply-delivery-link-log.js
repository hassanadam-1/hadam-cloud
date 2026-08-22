'use strict';
const fs = require('fs');
const path = require('path');
function applyPatches(filePath, patches) {
  const full = path.resolve(filePath);
  let content = fs.readFileSync(full, 'utf8');
  for (const p of patches) {
    const count = content.split(p.find).length - 1;
    if (count === 0) { console.log(`SKIP (already applied or not found) [${filePath}] ${p.label}`); continue; }
    if (p.expect && count !== p.expect) throw new Error(`"${p.label}" in ${filePath} matched ${count}x, expected ${p.expect}. Aborting.`);
    content = content.split(p.find).join(p.replace);
    console.log(`OK [${filePath}] ${p.label} (${count}x)`);
  }
  fs.writeFileSync(full, content, 'utf8');
}
applyPatches('server.js', [
  { label: 'log delivery link (Supabase path)', expect: 1,
    find: "            const orderUrl = 'https://' + tenant.subdomain + '.' + BASE_DOMAIN + '/api/public/delivery-response?token=' + encodeURIComponent(deliveryToken);",
    replace: "            const orderUrl = 'https://' + tenant.subdomain + '.' + BASE_DOMAIN + '/api/public/delivery-response?token=' + encodeURIComponent(deliveryToken);\n            console.log('[delivery-link]', orderUrl);" },
  { label: 'log delivery link (file-driver path)', expect: 1,
    find: "    const orderUrl = 'https://' + tenant.subdomain + '.' + BASE_DOMAIN + '/api/public/delivery-response?token=' + encodeURIComponent(deliveryToken);",
    replace: "    const orderUrl = 'https://' + tenant.subdomain + '.' + BASE_DOMAIN + '/api/public/delivery-response?token=' + encodeURIComponent(deliveryToken);\n    console.log('[delivery-link]', orderUrl);" },
]);
console.log('\nDone.');
