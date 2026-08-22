#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function applyPatches(filePath, patches) {
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) throw new Error(`File not found: ${filePath}`);
  let content = fs.readFileSync(full, 'utf8');
  const backupPath = full + '.bak-authrefresh';
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, content, 'utf8');
  for (const p of patches) {
    const count = content.split(p.find).length - 1;
    if (count === 0) { console.log(`SKIP (already applied or not found) [${filePath}] ${p.label}`); continue; }
    if (p.expect && count !== p.expect) throw new Error(`"${p.label}" in ${filePath} matched ${count}x, expected ${p.expect}. Aborting — check manually.`);
    content = content.split(p.find).join(p.replace);
    console.log(`OK [${filePath}] ${p.label} (${count}x)`);
  }
  fs.writeFileSync(full, content, 'utf8');
}

applyPatches('lib/auth.js', [
  { label: 'add refresh() after login()', expect: 1,
    find: `  return { user: data.user, session: data.session };\n}\n/** Starts an MFA challenge for a factor, using the temporary aal1 token from login(). */`,
    replace: `  return { user: data.user, session: data.session };\n}\n/** Exchanges a refresh token for a fresh session (new access_token + rotated refresh_token), without needing the password again. */\nasync function refresh(refreshToken) {\n  const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });\n  if (error) throw new Error('Session expired — please log in again.');\n  return { user: data.user, session: data.session };\n}\n/** Starts an MFA challenge for a factor, using the temporary aal1 token from login(). */` },
  { label: 'export refresh', expect: 1,
    find: `module.exports = {\n  register, login, getUserFromToken, getMembership, isSuperadmin, getProfile,`,
    replace: `module.exports = {\n  register, login, refresh, getUserFromToken, getMembership, isSuperadmin, getProfile,` },
]);

applyPatches('server.js', [
  { label: 'refreshToken in platform login response', expect: 1,
    find: `return { user: { id: supaUser.id, name: profile.full_name || email, email, role: 'superadmin', tenantId: null }, token: session.access_token };`,
    replace: `return { user: { id: supaUser.id, name: profile.full_name || email, email, role: 'superadmin', tenantId: null }, token: session.access_token, refreshToken: session.refresh_token };` },
  { label: 'refreshToken in tenant login response', expect: 1,
    find: `return { user: { id: supaUser.id, name: profile.full_name || email, email, role, tenantId: tenant.id }, token: session.access_token, mfaSetupRequired };`,
    replace: `return { user: { id: supaUser.id, name: profile.full_name || email, email, role, tenantId: tenant.id }, token: session.access_token, refreshToken: session.refresh_token, mfaSetupRequired };` },
  { label: 'add POST /api/auth/refresh route', expect: 1,
    find: `  send(res, 200, { user: publicUser(found), token: signToken({ sub: found.id, role: found.role, tenantId: found.tenantId }), mfaRequired: false });\n});\nroute('POST', '/api/auth/mfa/login-verify', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {`,
    replace: `  send(res, 200, { user: publicUser(found), token: signToken({ sub: found.id, role: found.role, tenantId: found.tenantId }), mfaRequired: false });\n});\nroute('POST', '/api/auth/refresh', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {\n  const { refreshToken } = body;\n  if (!refreshToken) return send(res, 400, { error: 'refreshToken is required.' });\n  try {\n    const result = await authSupabase.refresh(refreshToken);\n    const built = await buildSupabaseLoginResponse(result.user, result.session, hostCtx, tenant);\n    if (!built) return send(res, 401, { error: 'Log in required.' });\n    return send(res, 200, built);\n  } catch (e) {\n    return send(res, 401, { error: e.message || 'Log in required.' });\n  }\n});\nroute('POST', '/api/auth/mfa/login-verify', { hostScope: 'any' }, async (req, res, params, body, query, user, tenant, hostCtx) => {` },
]);

applyPatches('public/app.js', [
  { label: 'load refreshToken into state', expect: 1,
    find: `  token: localStorage.getItem('hadam_token') || null,`,
    replace: `  token: localStorage.getItem('hadam_token') || null,\n  refreshToken: localStorage.getItem('hadam_refresh_token') || null,` },
  { label: 'rewrite api() with auto-refresh + add tryRefreshToken()', expect: 1,
    find: `async function api(path, opts = {}) {\n  const headers = { 'Content-Type': 'application/json' };\n  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;\n  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });\n  if (res.status === 401) {\n    console.log('[401 debug]', { path, hasToken: !!state.token, tokenPreview: state.token ? state.token.slice(0, 20) + '...' : null, localStorageToken: !!localStorage.getItem('hadam_token') });\n  }\n  if (res.headers.get('content-type')?.includes('application/json')) {\n    const data = await res.json();\n    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });\n    return data;\n  }\n  if (!res.ok) throw Object.assign(new Error('Request failed'), { status: res.status });\n  return res;\n}`,
    replace: `async function api(path, opts = {}) {\n  const headers = { 'Content-Type': 'application/json' };\n  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;\n  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });\n  if (res.status === 401 && !opts._retried && state.refreshToken) {\n    if (await tryRefreshToken()) return api(path, { ...opts, _retried: true });\n  }\n  if (res.status === 401) {\n    console.log('[401 debug]', { path, hasToken: !!state.token, tokenPreview: state.token ? state.token.slice(0, 20) + '...' : null, localStorageToken: !!localStorage.getItem('hadam_token') });\n  }\n  if (res.headers.get('content-type')?.includes('application/json')) {\n    const data = await res.json();\n    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });\n    return data;\n  }\n  if (!res.ok) throw Object.assign(new Error('Request failed'), { status: res.status });\n  return res;\n}\nlet _refreshInFlight = null;\nasync function tryRefreshToken() {\n  if (!state.refreshToken) return false;\n  if (_refreshInFlight) return _refreshInFlight;\n  _refreshInFlight = (async () => {\n    try {\n      const res = await fetch(API + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: state.refreshToken }) });\n      if (!res.ok) throw new Error('refresh failed');\n      const data = await res.json();\n      state.token = data.token; state.refreshToken = data.refreshToken;\n      localStorage.setItem('hadam_token', data.token); localStorage.setItem('hadam_refresh_token', data.refreshToken);\n      return true;\n    } catch {\n      state.token = null; state.refreshToken = null;\n      localStorage.removeItem('hadam_token'); localStorage.removeItem('hadam_refresh_token');\n      return false;\n    } finally {\n      _refreshInFlight = null;\n    }\n  })();\n  return _refreshInFlight;\n}` },
  { label: 'clear refreshToken in stale-session catch', expect: 1,
    find: `catch { state.token = null; localStorage.removeItem('hadam_token'); }`,
    replace: `catch { state.token = null; state.refreshToken = null; localStorage.removeItem('hadam_token'); localStorage.removeItem('hadam_refresh_token'); }` },
  { label: 'store refreshToken after login (both flows)', expect: 2,
    find: `state.user = result.user; state.token = result.token; localStorage.setItem('hadam_token', result.token);`,
    replace: `state.user = result.user; state.token = result.token; state.refreshToken = result.refreshToken; localStorage.setItem('hadam_token', result.token); localStorage.setItem('hadam_refresh_token', result.refreshToken);` },
  { label: 'clear refreshToken on logout', expect: 1,
    find: `function logout() { state.user = null; state.token = null; localStorage.removeItem('hadam_token'); closeModal('accountOverlay'); go('welcome'); }`,
    replace: `function logout() { state.user = null; state.token = null; state.refreshToken = null; localStorage.removeItem('hadam_token'); localStorage.removeItem('hadam_refresh_token'); closeModal('accountOverlay'); go('welcome'); }` },
]);

console.log('\nDone. Backups saved as *.bak-authrefresh. Restart the server and hard-refresh the browser.');