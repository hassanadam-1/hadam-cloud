(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var sb = null;
  var state = { tenants: [], marketplace: {}, restoreStatus: 'active', tile: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(d) {
    if (!d) return '';
    var x = new Date(d);
    return isNaN(x) ? '' : x.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function show(id) {
    ['boot', 'login', 'mfa', 'app'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
    $('signout').classList.toggle('hidden', id === 'boot' || id === 'login');
  }

  // Main-dashboard login (localStorage 'hadam_super_token') is reused so no second sign-in is needed.
  var EMBEDDED = /[?&]embedded=1/.test(location.search) && window.parent !== window;
  function mainToken() {
    try {
      if (sessionStorage.getItem('saIgnoreMain') === '1') return null;
      var t = null;
      try { if (EMBEDDED && window.parent.hadamSaGetToken) t = window.parent.hadamSaGetToken(); } catch (_) {}
      t = t || localStorage.getItem('hadam_super_token');
      return t && t.split('.').length === 3 ? t : null;
    } catch (_) { return null; }
  }
  async function getToken() {
    var s = await sb.auth.getSession();
    return (s.data.session && s.data.session.access_token) || mainToken();
  }

  async function api(path, opts) {
    var token = await getToken();
    opts = opts || {};
    var pass = null; try { pass = sessionStorage.getItem('saVerifyPass'); } catch (_) {}
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, pass ? { 'X-SA-Verify': pass } : {}, opts.headers || {});
    var r = await fetch(path, opts);
    var body = {};
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) { var e = new Error(body.error || ('HTTP ' + r.status)); e.code = body.error; e.detail = body.detail; throw e; }
    return body;
  }

  function clearLoginForm() {
    ['email', 'password', 'code'].forEach(function (id) { var el = $(id); if (el) { el.value = ''; el.setAttribute('readonly', 'readonly'); } });
    $('loginMsg').textContent = ''; $('mfaMsg').textContent = '';
    // Browsers autofill a little after the page shows — wipe again shortly after.
    setTimeout(function () { ['email', 'password'].forEach(function (id) { $(id).value = ''; }); }, 150);
    setTimeout(function () { ['email', 'password'].forEach(function (id) { $(id).value = ''; }); }, 600);
  }
  async function signOutHere() {
    try { sessionStorage.removeItem('saVerifyPass'); sessionStorage.setItem('saIgnoreMain', '1'); } catch (_) {}
    try { await sb.auth.signOut({ scope: 'local' }); } catch (_) {}
    state.tenants = [];
    $('rows').innerHTML = ''; $('tiles').innerHTML = '';
    clearLoginForm();
  }

  async function route() {
    if (!(await getToken())) { show('login'); clearLoginForm(); return; }
    await load();
  }

  async function sendEmailCode() {
    show('mfa');
    $('mfaMsg').className = 'msg err'; $('mfaMsg').textContent = '';
    $('mfaInfo').textContent = 'Sending a 6-digit code to your superadmin email…';
    try {
      var r = await api('/api/sa-stores/email-code/send', { method: 'POST' });
      $('mfaInfo').textContent = 'We emailed a 6-digit code to ' + r.to + '. It expires in 10 minutes.';
    } catch (e) {
      if (e.code === 'wait_before_resend') {
        $('mfaInfo').textContent = 'A code was sent recently. Check your email, or wait a minute to send a new one.';
      } else if (e.code === 'not_superadmin') {
        $('mfaInfo').textContent = '';
        $('mfaMsg').textContent = 'This account is not a superadmin.';
      } else {
        $('mfaInfo').textContent = '';
        $('mfaMsg').textContent = 'Could not send the code: ' + e.message + (e.detail ? ' — ' + e.detail : '');
      }
    }
    $('code').focus();
  }

  async function load(keepMsg) {
    show('app');
    if (!keepMsg) $('appMsg').textContent = '';
    $('rows').innerHTML = '<tr><td colspan="6" class="small">Loading stores…</td></tr>';
    try {
      var d = await api('/api/sa-stores/tenants');
      state.tenants = d.tenants || [];
      state.marketplace = d.marketplace || {};
      state.reactivatable = d.reactivatable || [];
      render();
    } catch (e) {
      if (e.code === 'not_superadmin') {
        $('rows').innerHTML = '<tr><td colspan="6" class="err">This account is not a superadmin.</td></tr>';
      } else if (e.code === 'verification_required') {
        try { sessionStorage.removeItem('saVerifyPass'); } catch (_) {}
        return sendEmailCode();
      } else if (e.code === 'not_signed_in' || e.code === 'invalid_session') {
        await signOutHere(); return route();
      } else {
        $('rows').innerHTML = '<tr><td colspan="6" class="err">Could not load stores: ' + esc(e.message) + (e.detail ? ' — ' + esc(e.detail) : '') + '</td></tr>';
      }
    }
  }

  function mStatus(x) {
    if (x.directory) return x.directory.listed ? 'listed' : (x.marketplace && x.marketplace.status === 'active' ? 'member only' : 'not listed');
    return x.marketplace ? (x.marketplace.status || 'unknown') : 'none';
  }
  function sStatus(x) { return x.kind === 'member' ? 'no store' : x.status; }
  function canStore(x) { return x.kind === 'store' && x.status !== 'active'; }
  function featuredLapsed(m) { return m && m.plan === 'featured' && m.expires_at && new Date(m.expires_at) < new Date(); }
  function memberFixable(m) { return !!m && m.status !== 'active' && (state.reactivatable || []).indexOf(m.status) !== -1 && !featuredLapsed(m); }
  function dirFixable(x) { var d = x.directory; return !!d && !d.expired && (d.reason === 'plan_store_only' || (d.reason === 'store_not_active' && ['marketplace', 'both'].indexOf(d.plan) === -1)); }
  function canMarket(x) {
    if (x.kind === 'member') return memberFixable(x.marketplace);
    var d = x.directory || {};
    if (d.expired) return false;
    return dirFixable(x) || memberFixable(x.marketplace);
  }
  var DIR_TEXT = { store_not_active: 'store not active', plan_store_only: 'plan is "store" (not listed)', subscription_expired: 'subscription expired' };

  function render() {
    var t = state.tenants;
    var stores = t.filter(function (x) { return x.kind === 'store'; });
    var byStatus = {}, byM = {};
    stores.forEach(function (x) { byStatus[x.status] = (byStatus[x.status] || 0) + 1; });
    t.forEach(function (x) { var k = mStatus(x); byM[k] = (byM[k] || 0) + 1; });
    var memberOnly = t.length - stores.length;

    var tiles = [{ key: '', n: stores.length, l: 'All stores' }];
    Object.keys(byStatus).sort().forEach(function (s) { tiles.push({ key: 'status:' + s, n: byStatus[s], l: 'Store ' + s, del: s === 'deleted' }); });
    if (state.marketplace.available) {
      Object.keys(byM).sort().forEach(function (s) {
        if (s === 'none') return;
        tiles.push({ key: 'm:' + s, n: byM[s], l: (s === 'listed' || s === 'not listed' || s === 'member only' ? 'Directory: ' : 'Marketplace ') + s, del: s === 'deleted' || s === 'suspended' || s === 'not listed' });
      });
      if (byM.none) tiles.push({ key: 'm:none', n: byM.none, l: 'No marketplace' });
      if (memberOnly) tiles.push({ key: 'status:no store', n: memberOnly, l: 'Marketplace only (no store)' });
    }
    $('tiles').innerHTML = tiles.map(function (x) {
      return '<div class="tile' + (x.del ? ' del' : '') + (state.tile === x.key ? ' active' : '') + '" data-key="' + esc(x.key) + '">' +
        '<div class="n">' + x.n + '</div><div class="l">' + esc(x.l) + '</div></div>';
    }).join('');

    var sel = $('fStatus'), cur = sel.value;
    var sOpts = Object.keys(byStatus).sort();
    if (memberOnly) sOpts.push('no store');
    sel.innerHTML = '<option value="">Store: any status</option>' + sOpts.map(function (s) {
      return '<option value="' + esc(s) + '">Store: ' + esc(s) + ' (' + (s === 'no store' ? memberOnly : byStatus[s]) + ')</option>';
    }).join('');
    sel.value = cur;
    var ms = $('fMarket'), mcur = ms.value;
    ms.innerHTML = '<option value="">Marketplace: any</option>' + Object.keys(byM).sort().map(function (s) {
      return '<option value="' + esc(s) + '">Marketplace: ' + esc(s === 'none' ? 'none (not listed)' : s) + ' (' + byM[s] + ')</option>';
    }).join('');
    ms.value = mcur;
    ms.disabled = !state.marketplace.available;

    $('marketNote').textContent = state.marketplace.available
      ? 'Marketplace memberships: ' + state.marketplace.total + ' (linked to a store by upgrade or by the same owner email). Pending / rejected listings are approved through the normal Marketplace approvals.'
      : 'Marketplace data unavailable: ' + (state.marketplace.error || 'table not found');
    renderRows();
  }

  function renderRows() {
    var q = $('q').value.trim().toLowerCase();
    var st = $('fStatus').value;
    var mk = $('fMarket').value;
    var list = state.tenants.filter(function (x) {
      if (st && sStatus(x) !== st) return false;
      if (mk && mStatus(x) !== mk) return false;
      if (!q) return true;
      var m = x.marketplace || {};
      return [x.name, x.subdomain, x.owner_email, x.id, sStatus(x), m.business_name, m.email, m.status, m.plan].some(function (v) {
        return v && String(v).toLowerCase().indexOf(q) !== -1;
      });
    });
    $('count').textContent = 'Showing ' + list.length + ' of ' + state.tenants.length + ' entries';
    if (!list.length) { $('rows').innerHTML = '<tr><td colspan="6" class="small">Nothing matches.</td></tr>'; return; }
    $('rows').innerHTML = list.map(function (x) {
      var m = x.marketplace;
      var mCell = m
        ? '<span class="badge ' + esc(m.status) + '">' + esc(m.status || '?') + '</span>' +
          '<div class="small">' + esc(m.business_name || '') + (m.plan ? ' · ' + esc(m.plan) : '') +
          (m.expires_at ? ' · until ' + esc(fmtDate(m.expires_at)) : '') + '</div>'
        : '<span class="badge">none</span>' + (x.store_plan && /market|both/.test(x.store_plan) ? '<div class="small">store plan: ' + esc(x.store_plan) + '</div>' : '');
      if (x.directory) {
        var d = x.directory;
        mCell = '<div><span class="badge ' + (d.listed ? 'active' : 'deleted') + '">' + (d.listed ? 'Listed' : 'Not listed') + '</span>' +
          '<div class="small">Public directory' + (d.listed ? '' : ': ' + esc(DIR_TEXT[d.reason] || d.reason)) +
          ' · plan ' + esc(d.plan || '?') + (d.expiry ? ' · sub until ' + esc(fmtDate(d.expiry)) : '') + '</div></div>' +
          (m ? '<div style="margin-top:6px"><span class="badge ' + esc(m.status) + '">' + esc(m.status) + '</span><div class="small">Member listing: ' + esc(m.business_name || '') + (m.plan ? ' · ' + esc(m.plan) : '') + '</div></div>' : '');
      }
      var sCell = x.kind === 'member'
        ? '<span class="small">— marketplace only —</span>'
        : '<span class="badge ' + esc(x.status) + '">' + esc(x.status) + '</span>' +
          (x.status === 'deleted' ? '<div class="small">Deleted ' + esc(fmtDate(x.deleted_at)) + (x.deleted_by_email ? ' by ' + esc(x.deleted_by_email) : '') + '</div>' : '');
      var btns = [];
      var cs = canStore(x), cm = canMarket(x);
      var data = ' data-tid="' + (x.kind === 'store' ? esc(x.id) : '') + '" data-mid="' + (m ? esc(m.id) : '') + '" data-name="' + esc(x.name) + '"';
      if (cs) btns.push('<button class="restore" data-what="store"' + data + '>Activate store</button>');
      if (cm) btns.push('<button class="restore" data-what="marketplace"' + data + '>Activate marketplace</button>');
      if (cs && cm) btns.push('<button class="restore both" data-what="both"' + data + '>Activate both</button>');
      if (x.directory && x.directory.expired) btns.push('<div class="small">Subscription ended ' + esc(fmtDate(x.directory.expiry)) + ' — renew to list it</div>');
      else if (m && m.status !== 'active' && !memberFixable(m) && x.kind === 'member') btns.push('<div class="small">' + (featuredLapsed(m)
        ? 'Marketplace: Featured period ended — use Renew'
        : 'Marketplace: approve via Marketplace approvals') + '</div>');
      return '<tr><td><strong>' + esc(x.name) + '</strong><div class="small">' + esc(x.subdomain || '') + '</div></td>' +
        '<td>' + sCell + '</td><td>' + mCell + '</td>' +
        '<td>' + esc(x.owner_email || '') + '</td>' +
        '<td>' + esc(fmtDate(x.created_at)) + '</td><td class="acts">' + btns.join('') + '</td></tr>';
    }).join('');
  }

  var WHAT_TEXT = { store: 'the store', marketplace: 'the marketplace listing (public directory + member listing)', both: 'the store AND its marketplace listing' };
  async function restore(btn) {
    var name = btn.getAttribute('data-name'), what = btn.getAttribute('data-what');
    if (!confirm('Activate ' + WHAT_TEXT[what] + ' for "' + name + '"?')) return;
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Working…';
    try {
      var r = await api('/api/sa-stores/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ what: what, tenant_id: btn.getAttribute('data-tid') || null, member_id: btn.getAttribute('data-mid') || null }),
      });
      $('appMsg').className = 'msg ok';
      var done = [];
      if (r.store) done.push('store activated');
      if (r.directory) done.push('listed in the public Marketplace & Stores directory (plan ' + r.directory.plan + ')');
      if (r.marketplace) done.push('member listing activated');
      $('appMsg').textContent = '"' + name + '": ' + (done.join('; ') || 'done') + '.' + (r.notes && r.notes.length ? ' Note: ' + r.notes.join(' ') : '');
      await load(true);
    } catch (e) {
      btn.disabled = false; btn.textContent = label;
      $('appMsg').className = 'msg err';
      $('appMsg').textContent = 'Activation failed: ' + (e.detail || e.message);
    }
  }


  function wire() {
    ['email', 'password', 'code'].forEach(function (id) {
      $(id).addEventListener('focus', function () { this.removeAttribute('readonly'); });
    });
    $('loginForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      $('loginMsg').textContent = '';
      var r = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
      if (r.error) { $('loginMsg').textContent = r.error.message; $('password').value = ''; return; }
      $('email').value = ''; $('password').value = '';
      route();
    });
    $('mfaForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      $('mfaMsg').className = 'msg err'; $('mfaMsg').textContent = '';
      try {
        var r = await api('/api/sa-stores/email-code/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: $('code').value.trim() }),
        });
        try { sessionStorage.setItem('saVerifyPass', r.pass); } catch (_) {}
        state.pass = r.pass;
        $('code').value = '';
        load();
      } catch (e) {
        var m = { wrong_code: 'That code is not right.', code_expired: 'That code has expired — send a new one.', too_many_attempts: 'Too many wrong tries — send a new code.' };
        $('mfaMsg').textContent = m[e.code] || ('Verification failed: ' + e.message);
      }
    });
    $('resend').addEventListener('click', sendEmailCode);
    $('signout').addEventListener('click', async function () { await signOutHere(); show('login'); });
    if (EMBEDDED) { var hd = document.querySelector('header'); if (hd) hd.style.display = 'none'; }
    $('backLink').addEventListener('click', function (ev) {
      if (EMBEDDED && window.parent.hadamSaClose) { ev.preventDefault(); window.parent.hadamSaClose(); return; }
      if (window.opener && !window.opener.closed) { ev.preventDefault(); try { window.opener.focus(); } catch (_) {} window.close(); }
    });
    $('q').addEventListener('input', renderRows);
    $('fStatus').addEventListener('change', function () { state.tile = ''; render(); });
    $('fMarket').addEventListener('change', function () { state.tile = ''; render(); });
    $('tiles').addEventListener('click', function (ev) {
      var el = ev.target.closest('.tile'); if (!el) return;
      var key = el.getAttribute('data-key');
      state.tile = key;
      $('fStatus').value = key.indexOf('status:') === 0 ? key.slice(7) : '';
      $('fMarket').value = key.indexOf('m:') === 0 ? key.slice(2) : '';
      if ($('fStatus').value !== (key.indexOf('status:') === 0 ? key.slice(7) : '')) $('fStatus').value = '';
      render();
    });
    $('rows').addEventListener('click', function (ev) {
      var b = ev.target.closest('button.restore'); if (b) restore(b);
    });
  }

  (async function init() {
    try {
      var cfg = await (await fetch('/api/sa-stores/config')).json();
      if (!cfg.anonKey) throw new Error('SUPABASE_ANON_KEY is not set on the server');
      if (!window.supabase || !window.supabase.createClient) throw new Error('Supabase library did not load');
      sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { storageKey: 'hadam-sa-stores-auth', storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      wire();
      await route();
    } catch (e) {
      $('boot').innerHTML = '<span class="err">Could not start: ' + esc(e.message) + '</span>';
    }
  })();
})();
