/* Hadam — "Stores admin" item next to the superadmin "Dashboard" link.
 * Shown only while the Dashboard link is shown (the app only shows it to a logged-in superadmin),
 * hidden again the moment the superadmin logs out. The server re-checks superadmin on every request.
 * Opens the Stores screen inside the same page (overlay) and reuses the dashboard login.
 * Loaded by public-platform/index.html:  <script src="/superadmin/stores/nav.js" defer></script>
 */
(function () {
  'use strict';
  var LABELS = { en: 'Stores admin', ar: 'إدارة المتاجر', fr: 'Gestion des boutiques' };
  var CLOSE = { en: 'Close', ar: 'إغلاق', fr: 'Fermer' };
  var checkedToken = null;
  var rejected = false; // server said: this login is NOT a superadmin

  function lang() {
    try { return (localStorage.getItem('hadam_lang') || document.documentElement.lang || 'en').slice(0, 2); } catch (_) { return 'en'; }
  }
  // Dashboard login token: app.js keeps it in its global `state` (and sometimes localStorage).
  function mainToken() {
    try { if (typeof state !== 'undefined' && state && state.token) return state.token; } catch (_) {}
    try { return localStorage.getItem('hadam_super_token'); } catch (_) { return null; }
  }
  window.hadamSaGetToken = mainToken;

  function dash() { return document.getElementById('dashboardNavLink'); }
  function dashboardVisible() {
    var d = dash();
    if (!d || !d.isConnected) return false;
    return d.style.display !== 'none' && getComputedStyle(d).display !== 'none' && d.offsetParent !== null;
  }

  function ensureLink() {
    var d = dash();
    if (!d || !d.parentNode) return null;
    var a = document.getElementById('navSaStores');
    if (!a) {
      a = document.createElement(d.tagName === 'BUTTON' ? 'button' : 'a');
      a.id = 'navSaStores';
      if (a.tagName === 'A') a.href = '#stores-admin';
      a.className = d.className;
      a.style.cssText = (d.getAttribute('style') || '').replace(/display\s*:\s*[^;]+;?/gi, '');
      a.style.marginLeft = '14px';
      a.style.display = 'none';
      a.addEventListener('click', function (ev) { ev.preventDefault(); openPanel(); });
    }
    if (a.previousSibling !== d) d.parentNode.insertBefore(a, d.nextSibling);
    var label = LABELS[lang()] || LABELS.en;
    if (a.textContent !== label) a.textContent = label;
    return a;
  }

  function verify(t) {
    if (t === checkedToken) return;
    checkedToken = t;
    rejected = false;
    if (!t) return;
    fetch('/api/sa-stores/whoami', { headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (b) { if (checkedToken === t) { rejected = b.reason === 'not_superadmin'; update(); } })
      .catch(function () {});
  }

  function update() {
    var a = ensureLink();
    var show = dashboardVisible() && !rejected;
    verify(mainToken());
    var want = show ? '' : 'none';
    if (a && a.style.display !== want) a.style.display = want;
    if (!show && document.getElementById('saStoresPanel')) closePanel();
  }

  // ---- In-page panel -------------------------------------------------------
  function openPanel() {
    var p = document.getElementById('saStoresPanel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'saStoresPanel';
      p.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,14,28,.55);display:flex;';
      var box = document.createElement('div');
      box.style.cssText = 'position:relative;margin:auto;width:min(1200px,100%);height:100%;max-height:100vh;background:#f6f7fb;display:flex;flex-direction:column;';
      var bar = document.createElement('div');
      bar.style.cssText = 'display:flex;justify-content:flex-end;padding:6px 10px;background:#1c2541;';
      var x = document.createElement('button');
      x.textContent = '✕ ' + (CLOSE[lang()] || CLOSE.en);
      x.style.cssText = 'background:#f5a623;color:#1c2541;border:0;border-radius:6px;padding:6px 12px;font-weight:600;cursor:pointer;';
      x.addEventListener('click', closePanel);
      bar.appendChild(x);
      var f = document.createElement('iframe');
      f.src = '/superadmin/stores?embedded=1';
      f.title = 'Stores admin';
      f.style.cssText = 'flex:1;border:0;width:100%;';
      box.appendChild(bar); box.appendChild(f); p.appendChild(box);
      p.addEventListener('click', function (ev) { if (ev.target === p) closePanel(); });
      document.body.appendChild(p);
    }
    p.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
  }
  function closePanel() {
    var p = document.getElementById('saStoresPanel');
    if (p) p.remove();
    document.documentElement.style.overflow = '';
  }
  window.hadamSaClose = closePanel;
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closePanel(); });

  function start() {
    update();
    if (window.MutationObserver) new MutationObserver(function () { update(); }).observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['style', 'class', 'hidden'] });
    window.addEventListener('storage', update);
    setInterval(update, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
