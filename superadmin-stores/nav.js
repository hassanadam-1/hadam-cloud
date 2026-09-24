/* Hadam — adds a "Stores" item to the platform main menu (#mainNav) for superadmins only.
 * Visible only while the superadmin Dashboard link is visible (i.e. a superadmin is logged in)
 * and the server confirms the logged-in account is a superadmin. Hidden again on logout.
 * Loaded by public-platform/index.html:  <script src="/superadmin/stores/nav.js" defer></script>
 */
(function () {
  'use strict';
  var LABELS = { en: 'Stores', ar: 'المتاجر', fr: 'Boutiques' };
  var checkedToken = null;
  var tokenIsSuperadmin = false;   // server said yes
  var tokenRejected = false;       // server said: signed in, but NOT a superadmin
  var answered = false;            // server has replied for the current token

  function lang() {
    try { return localStorage.getItem('hadam_lang') || document.documentElement.lang || 'en'; } catch (_) { return 'en'; }
  }
  function token() {
    try { return localStorage.getItem('hadam_super_token'); } catch (_) { return null; }
  }
  function dashboardVisible() {
    var d = document.getElementById('dashboardNavLink');
    if (!d) return false;
    return d.style.display !== 'none' && getComputedStyle(d).display !== 'none';
  }

  function ensureLink() {
    var nav = document.getElementById('mainNav');
    if (!nav) return null;
    var a = document.getElementById('navSaStores');
    if (!a) {
      a = document.createElement('a');
      a.id = 'navSaStores';
      a.href = '/superadmin/stores';
      a.target = '_blank';
      a.rel = 'opener';
      a.style.display = 'none';
      var dash = document.getElementById('dashboardNavLink');
      if (dash && dash.parentNode === nav) nav.insertBefore(a, dash.nextSibling);
      else nav.appendChild(a);
    }
    var l = lang().slice(0, 2);
    a.textContent = LABELS[l] || LABELS.en;
    return a;
  }

  function verify(t) {
    if (t === checkedToken) return;
    checkedToken = t;
    tokenIsSuperadmin = false; tokenRejected = false; answered = false;
    if (!t) return update();
    fetch('/api/sa-stores/whoami', { headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (b) { if (checkedToken === t) { tokenIsSuperadmin = b.superadmin === true; tokenRejected = b.reason === 'not_superadmin'; answered = true; update(); } })
      .catch(function () { /* network error: stay hidden */ });
  }

  function update() {
    var a = ensureLink();
    if (!a) return;
    var t = token();
    if (t !== checkedToken) verify(t);
    // Superadmin Dashboard link visible + token present, and the server has not said "not a superadmin".
    // (If the server cannot read this token type, the Dashboard link — which the app only shows to
    //  superadmins — decides. The Stores page itself always re-checks on the server.)
    var show = !!t && dashboardVisible() && answered && !tokenRejected && t === checkedToken;
    a.style.display = show ? '' : 'none';
  }

  function start() {
    update();
    var dash = document.getElementById('dashboardNavLink');
    if (dash && window.MutationObserver) {
      new MutationObserver(update).observe(dash, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    }
    window.addEventListener('storage', update);   // login/logout in another tab
    setInterval(update, 1500);                     // login/logout in this tab (localStorage has no same-tab event)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
