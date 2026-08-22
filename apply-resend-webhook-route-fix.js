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
  { label: 'intercept Resend webhook POSTs before tenant/host routing (retry, shorter anchor)', expect: 1,
    find: "  const match = matchRoute(req.method, url.pathname);",
    replace: "  if (req.method === 'POST' && url.pathname === '/api/webhooks/resend') {\n    try {\n      const whBody = await readBody(req);\n      return await handleResendWebhook(req, res, whBody);\n    } catch (err) {\n      console.error('[resend-webhook] handler error:', err && (err.stack || err.message || err));\n      return send(res, 500, { error: 'Webhook handler error.' });\n    }\n  }\n  const match = matchRoute(req.method, url.pathname);" },
]);

console.log('\nDone.');
