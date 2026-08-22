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
  { label: 'fix webhookAlreadyReported to match Resend\'s actual "email.X" event type strings', expect: 1,
    find: "  return timeline.find(e => ['delivered', 'bounced', 'complained'].includes(e.type)) || null;",
    replace: "  return timeline.find(e => ['email.delivered', 'email.bounced', 'email.complained'].includes(e.type)) || null;" },
]);

console.log('\nDone.');
