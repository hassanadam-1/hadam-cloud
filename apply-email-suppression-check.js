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

applyPatches('lib/email.js', [
  { label: 'add suppression-list check before sending', expect: 1,
    find: "async function sendEmail({ to, subject, text }) {\n  const apiKey = process.env.RESEND_API_KEY;",
    replace: "function isSuppressed(email) {\n  try {\n    const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'suppressed-recipients.json'), 'utf8'));\n    return !!(email && list[email.toLowerCase()]);\n  } catch { return false; }\n}\n\nasync function sendEmail({ to, subject, text }) {\n  if (isSuppressed(to)) {\n    console.warn(`[email] Skipping send to ${to} — this address is on the suppression list (previous bounce/complaint).`);\n    return { sent: false, reason: 'suppressed' };\n  }\n  const apiKey = process.env.RESEND_API_KEY;" },
]);

console.log('\nDone.');
