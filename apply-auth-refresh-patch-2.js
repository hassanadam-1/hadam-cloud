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

applyPatches('lib/auth.js', [
  { label: 'add refresh() after login()', expect: 1,
    find: `  return { user: data.user, session: data.session, mfaRequired: false };\n}\n\n/** Starts an MFA challenge for a factor, using the temporary aal1 token from login(). */`,
    replace: `  return { user: data.user, session: data.session, mfaRequired: false };\n}\n\n/** Exchanges a refresh token for a fresh session (new access_token + rotated refresh_token), without needing the password again. */\nasync function refresh(refreshToken) {\n  const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });\n  if (error) throw new Error('Session expired — please log in again.');\n  return { user: data.user, session: data.session };\n}\n\n/** Starts an MFA challenge for a factor, using the temporary aal1 token from login(). */` },
]);

applyPatches('server.js', [
  { label: 'add POST /api/auth/refresh route', expect: 1,
    find: `  send(res, 200, { user: publicUser(found), token: signToken({ sub: found.id, role: found.role, tenantId: found.tenantId }), mfaRequired: false });\n});\n\nroute('POST', '/api/auth/mfa/login-verify', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {`,
    replace: `  send(res, 200, { user: publicUser(found), token: signToken({ sub: found.id, role: found.role, tenantId: found.tenantId }), mfaRequired: false });\n});\n\nroute('POST', '/api/auth/refresh', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {\n  const { refreshToken } = body;\n  if (!refreshToken) return send(res, 400, { error: 'refreshToken is required.' });\n  try {\n    const result = await authSupabase.refresh(refreshToken);\n    const built = await buildSupabaseLoginResponse(result.user, result.session, hostCtx, tenant);\n    if (!built) return send(res, 401, { error: 'Log in required.' });\n    return send(res, 200, built);\n  } catch (e) {\n    return send(res, 401, { error: e.message || 'Log in required.' });\n  }\n});\n\nroute('POST', '/api/auth/mfa/login-verify', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {` },
]);

console.log('\nDone.');