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
      state.restoreStatus = d.restore_status || 'active';
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

  function render() {
    var t = state.tenants;
    var byStatus = {};
    t.forEach(function (x) { byStatus[x.status] = (byStatus[x.status] || 0) + 1; });
    var withM = t.filter(function (x) { return x.has_marketplace; }).length;

    var tiles = [{ key: '', n: t.length, l: 'All stores' }];
    Object.keys(byStatus).sort().forEach(function (s) { tiles.push({ key: 'status:' + s, n: byStatus[s], l: s, del: s === 'deleted' }); });
    if (state.marketplace.available) {
      tiles.push({ key: 'm:yes', n: withM, l: 'With marketplace' });
      tiles.push({ key: 'm:no', n: t.length - withM, l: 'Without marketplace' });
    }
    $('tiles').innerHTML = tiles.map(function (x) {
      return '<div class="tile' + (x.del ? ' del' : '') + (state.tile === x.key ? ' active' : '') + '" data-key="' + esc(x.key) + '">' +
        '<div class="n">' + x.n + '</div><div class="l">' + esc(x.l) + '</div></div>';
    }).join('');

    var sel = $('fStatus'), cur = sel.value;
    sel.innerHTML = '<option value="">All statuses</option>' + Object.keys(byStatus).sort().map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + ' (' + byStatus[s] + ')</option>';
    }).join('');
    sel.value = cur;
    $('fMarket').disabled = !state.marketplace.available;

    $('marketNote').textContent = state.marketplace.available
      ? 'Marketplace listings read from table "' + state.marketplace.table + '" (' + state.marketplace.total + ' listings).'
      : 'Marketplace report unavailable: marketplace listing table not found (set SA_MARKETPLACE_TABLE on the server).';
    renderRows();
  }

  function renderRows() {
    var q = $('q').value.trim().toLowerCase();
    var st = $('fStatus').value;
    var mk = $('fMarket').value;
    var list = state.tenants.filter(function (x) {
      if (st && x.status !== st) return false;
      if (mk === 'yes' && !x.has_marketplace) return false;
      if (mk === 'no' && x.has_marketplace) return false;
      if (!q) return true;
      return [x.name, x.subdomain, x.owner_email, x.id].some(function (v) { return v && String(v).toLowerCase().indexOf(q) !== -1; });
    });
    $('count').textContent = 'Showing ' + list.length + ' of ' + state.tenants.length + ' stores';
    if (!list.length) { $('rows').innerHTML = '<tr><td colspan="6" class="small">No stores match.</td></tr>'; return; }
    $('rows').innerHTML = list.map(function (x) {
      var m = x.has_marketplace
        ? x.marketplace.map(function (l) { return '<span class="badge">' + esc(l.status || 'listed') + '</span>'; }).join(' ')
        : '<span class="small">—</span>';
      var del = x.status === 'deleted'
        ? '<div class="small">Deleted ' + esc(fmtDate(x.deleted_at)) + (x.deleted_by_email ? ' by ' + esc(x.deleted_by_email) : '') + '</div>'
        : '';
      var action = x.status === 'deleted'
        ? '<button class="restore" data-id="' + esc(x.id) + '" data-name="' + esc(x.name) + '">Restore</button>'
        : '';
      return '<tr><td><strong>' + esc(x.name) + '</strong><div class="small">' + esc(x.subdomain || '') + '</div></td>' +
        '<td><span class="badge ' + esc(x.status) + '">' + esc(x.status) + '</span>' + del + '</td>' +
        '<td>' + esc(x.owner_email || '') + '</td><td>' + m + '</td>' +
        '<td>' + esc(fmtDate(x.created_at)) + '</td><td>' + action + '</td></tr>';
    }).join('');
  }

  async function restore(btn) {
    var name = btn.getAttribute('data-name');
    if (!confirm('Restore "' + name + '"?\n\nIt will be set back to "' + state.restoreStatus + '" and its store address will work again.')) return;
    btn.disabled = true; btn.textContent = 'Restoring…';
    try {
      await api('/api/sa-stores/tenants/' + encodeURIComponent(btn.getAttribute('data-id')) + '/restore', { method: 'POST' });
      $('appMsg').className = 'msg ok';
      $('appMsg').textContent = '"' + name + '" restored.';
      await load(true);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Restore';
      $('appMsg').className = 'msg err';
      $('appMsg').textContent = 'Restore failed: ' + e.message + (e.detail ? ' — ' + e.detail : '');
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
