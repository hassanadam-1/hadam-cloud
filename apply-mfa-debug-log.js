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
  { label: 'log the platform/superadmin branch decision (buildSupabaseLoginResponse only)', expect: 1,
    find: "  const email = supaUser.email;\n  if (hostCtx.isPlatform) {\n    if (!profile.is_superadmin) return null;",
    replace: "  const email = supaUser.email;\n  if (hostCtx.isPlatform) {\n    console.log('[mfa-debug] platform branch:', { userId: supaUser.id, isSuperadmin: profile.is_superadmin });\n    if (!profile.is_superadmin) return null;" },
  { label: 'log the tenant membership role lookup (buildSupabaseLoginResponse only)', expect: 1,
    find: "  const role = await authSupabase.getMembership(session.access_token, tenant.id);\n  if (!role) return null; // authenticated identity, but no account at THIS store",
    replace: "  const role = await authSupabase.getMembership(session.access_token, tenant.id);\n  console.log('[mfa-debug] tenant membership lookup:', { userId: supaUser.id, tenantId: tenant.id, tenantName: tenant.name, role, tokenPrefix: String(session.access_token || '').slice(0, 12) });\n  if (!role) return null; // authenticated identity, but no account at THIS store" },
]);

console.log('\nDone.');
