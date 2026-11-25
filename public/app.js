/* ============================================================
   WATCH & EARN PRO — app.js
   Plain-JS SPA. Hash routing. Talks to the /api backend.
   Token in localStorage. No build step, no dependencies.
   ============================================================ */
'use strict';

/* ---------------- State ---------------- */
var state = {
  token: localStorage.getItem('wep_token') || null,
  adminToken: localStorage.getItem('wep_admin_token') || null,
  user: null, me: null, wallet: null,
  lang: localStorage.getItem('wep_lang') || 'en',
  theme: localStorage.getItem('wep_theme') || 'dark',
  sound: localStorage.getItem('wep_sound') !== '0',
  config: { googleClientId: null, appName: 'Watch & Earn Pro' },
  adsStatus: null, ad: null, gameCleanup: null,
  notifCount: 0
};

/* ---------------- Tiny helpers ---------------- */
function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function t(key, vars) {
  var dict = (window.LOCALES && (window.LOCALES[state.lang] || window.LOCALES.en)) || {};
  var s = dict[key] || (window.LOCALES && window.LOCALES.en[key]) || key;
  if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
  return s;
}
function fmt(n) { return (Number(n) || 0).toLocaleString('en-IN'); }
function fmtDate(s) {
  if (!s) return '';
  var d = new Date(s);
  return isNaN(d) ? String(s) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}
function coinIc() { return '<span class="coin-ic" aria-hidden="true">₹</span>'; }

var toastTimer = null;
function toast(msg) {
  var box = el('toast');
  box.textContent = msg; box.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { box.classList.add('hidden'); }, 3400);
}
function spin(on) { el('spinner').classList.toggle('hidden', !on); }

function confirmModal(title, body, okLabel) {
  return new Promise(function (resolve) {
    el('modal-title').textContent = title;
    el('modal-body').textContent = body;
    el('modal-ok').textContent = okLabel || 'OK';
    el('modal-cancel').textContent = t('cancel');
    el('modal').classList.remove('hidden');
    function done(v) {
      el('modal').classList.add('hidden');
      el('modal-ok').onclick = el('modal-cancel').onclick = null;
      resolve(v);
    }
    el('modal-ok').onclick = function () { done(true); };
    el('modal-cancel').onclick = function () { done(false); };
  });
}

/* ---------------- API layer ---------------- */
function api(path, opts) {
  opts = opts || {};
  var headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (opts.headers) Object.assign(headers, opts.headers);
  spin(true);
  return fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (res) {
    return res.text().then(function (txt) {
      var data = {};
      try { data = txt ? JSON.parse(txt) : {}; } catch (e) { data = { message: txt }; }
      if (res.status === 401 && state.token && path !== '/auth/login-password') {
        logout(false);
        throw new Error(data.message || 'Session expired. Please login again.');
      }
      if (!res.ok) {
        var err = new Error(data.message || data.error || ('Request failed (' + res.status + ')'));
        err.status = res.status; err.code = data.error || data.code; err.data = data;
        throw err;
      }
      return data;
    });
  }).finally(function () { spin(false); });
}
function adminApi(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {});
  if (state.adminToken) opts.headers.Authorization = 'Bearer ' + state.adminToken;
  var saved = state.token; state.token = null; // avoid user-token 401 handler mixups
  return api(path, opts).catch(function (e) {
    if (e.status === 401) { state.adminToken = null; localStorage.removeItem('wep_admin_token'); }
    throw e;
  }).finally(function () { state.token = saved; });
}
function errMsg(e) { return (e && e.message) || t('error'); }

/* ---------------- Session ---------------- */
function setSession(token, user) {
  state.token = token; state.user = user || null;
  if (token) localStorage.setItem('wep_token', token);
  else localStorage.removeItem('wep_token');
  syncChrome();
}
function logout(notify) {
  setSession(null, null); state.me = null; state.wallet = null;
  if (location.hash !== '#/login') location.hash = '#/login';
  if (notify !== false) route();
}
function refreshMe() {
  if (!state.token) return Promise.resolve(null);
  return api('/me').then(function (res) {
    state.me = res; state.user = res.user || state.user;
    renderAnnouncement(); refreshNotifBadge(); syncChrome();
    return res;
  }).catch(function () { return null; });
}
function renderAnnouncement() {
  var box = el('announcement');
  var a = state.me && state.me.announcement;
  if (a && (a.text || a.title || typeof a === 'string')) {
    var txt = typeof a === 'string' ? a : [a.title, a.text || a.body].filter(Boolean).join(' — ');
    box.innerHTML = '<b>' + esc(t('announcement')) + ':</b> ' + esc(txt);
    box.classList.remove('hidden');
  } else box.classList.add('hidden');
}
function refreshNotifBadge() {
  if (!state.token) return;
  api('/notifications').then(function (res) {
    var list = asArray(res, 'notifications');
    state.notifCount = list.filter(function (n) { return !(n.read || n.isRead); }).length;
    var b = el('bell-badge');
    b.textContent = state.notifCount; b.classList.toggle('hidden', !state.notifCount);
  }).catch(function () { /* badge is best-effort */ });
}

/* ---------------- Chrome (nav / theme / lang) ---------------- */
function syncChrome() {
  var logged = !!state.token;
  el('bottomnav').classList.toggle('hidden', !logged || location.hash.indexOf('#/admin') === 0);
  el('btn-bell').classList.toggle('hidden', !logged);
  document.querySelectorAll('#bottomnav a').forEach(function (a) {
    a.classList.toggle('active', location.hash === '#/' + a.getAttribute('data-nav'));
  });
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  el('icon-sun').classList.toggle('hidden', state.theme !== 'dark');
  el('icon-moon').classList.toggle('hidden', state.theme === 'dark');
}
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(function (n) {
    n.textContent = t(n.getAttribute('data-i18n'));
  });
  document.documentElement.lang = state.lang === 'en' ? 'en' : state.lang;
}
function initChrome() {
  var sel = el('lang-select');
  (window.LANGS || [{ code: 'en', label: 'English' }]).forEach(function (l) {
    var o = document.createElement('option');
    o.value = l.code; o.textContent = l.label; sel.appendChild(o);
  });
  sel.value = state.lang;
  sel.addEventListener('change', function () {
    state.lang = sel.value; localStorage.setItem('wep_lang', state.lang);
    applyLang(); route();
  });
  el('btn-theme').addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('wep_theme', state.theme); applyTheme();
  });
  el('btn-bell').addEventListener('click', function () { location.hash = '#/notifications'; });
  window.addEventListener('hashchange', route);
  applyTheme(); applyLang();
}

/* ---------------- Config + Google ---------------- */
function loadConfig() {
  var meta = document.querySelector('meta[name="google-client-id"]');
  if (meta && meta.content) state.config.googleClientId = meta.content;
  return fetch('/api/config').then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (cfg) {
        if (cfg.googleClientId) state.config.googleClientId = cfg.googleClientId;
        if (cfg.appName) state.config.appName = cfg.appName;
      }
    }).catch(function () { /* config is optional */ });
}
var gisLoaded = null;
function loadGIS() {
  if (window.google && google.accounts) return Promise.resolve();
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return gisLoaded;
}
function googleSignIn() {
  if (!state.config.googleClientId) { toast(t('google_not_configured')); return; }
  loadGIS().then(function () {
    google.accounts.id.initialize({
      client_id: state.config.googleClientId,
      callback: function (resp) {
        api('/auth/google', { method: 'POST', body: { credential: resp.credential } })
          .then(function (res) {
            setSession(res.token, res.user);
            toast(t('success'));
            location.hash = '#/home'; refreshMe();
          })
          .catch(function (e) {
            if (e.status === 501 || e.code === 'google_not_configured') toast(t('google_not_configured'));
            else toast(errMsg(e));
          });
      }
    });
    google.accounts.id.prompt();
  }).catch(function () { toast(t('google_not_configured')); });
}

/* ============================================================
   VIEWS
   ============================================================ */
function view(html) { el('view').innerHTML = html; window.scrollTo(0, 0); syncChrome(); }

/* ---------- 1. Login / Register ---------- */
function vLogin() {
  var ref = new URLSearchParams(location.search).get('ref') ||
            sessionStorage.getItem('wep_ref') || '';
  if (ref) sessionStorage.setItem('wep_ref', ref);
  view(
    '<div class="hero center">' +
      '<div style="font-size:3rem">🪙</div>' +
      '<h1>' + esc(t('appName')) + '</h1>' +
      '<p class="muted">' + esc(t('tagline')) + '</p>' +
    '</div>' +
    '<div class="card">' +
      '<h2>' + esc(t('login_title')) + '</h2>' +
      '<p class="muted">' + esc(t('login_sub')) + '</p>' +
      '<div id="auth-step-mobile">' +
        '<div class="field"><label for="f-mobile">' + esc(t('mobile_label')) + '</label>' +
        '<input id="f-mobile" inputmode="numeric" autocomplete="tel" maxlength="10" placeholder="9876543210"></div>' +
        '<div id="auth-err" class="error-text hidden"></div>' +
        '<button id="btn-otp" class="btn btn-gold btn-big">' + esc(t('send_otp')) + '</button>' +
      '</div>' +
      '<div id="auth-step-otp" class="hidden">' +
        '<div id="dev-box" class="dev-box hidden"><div>' + esc(t('dev_otp_box')) + '</div><div class="otp" id="dev-otp"></div></div>' +
        '<div class="field"><label>' + esc(t('otp_label')) + '</label>' +
        '<div class="otp-row">' +
          '<input maxlength="1" inputmode="numeric"><input maxlength="1" inputmode="numeric">' +
          '<input maxlength="1" inputmode="numeric"><input maxlength="1" inputmode="numeric">' +
          '<input maxlength="1" inputmode="numeric"><input maxlength="1" inputmode="numeric">' +
        '</div></div>' +
        '<div class="field" id="f-name-wrap"><label for="f-name">' + esc(t('name_label')) + '</label>' +
        '<input id="f-name" autocomplete="name" placeholder="e.g. Rahul Kumar"></div>' +
        '<div class="field"><label for="f-ref">' + esc(t('referral_optional')) + '</label>' +
        '<input id="f-ref" value="' + esc(ref) + '" placeholder="ABCD12"></div>' +
        '<div id="otp-err" class="error-text hidden"></div>' +
        '<button id="btn-verify" class="btn btn-gold btn-big">' + esc(t('verify_otp')) + '</button>' +
        '<button id="btn-change-mobile" class="link-btn">' + esc(t('back_to_login')) + '</button>' +
      '</div>' +
      '<div class="divider">' + esc(t('or')) + '</div>' +
      '<button id="btn-google" class="btn btn-google btn-big">' +
        '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>' +
        esc(t('google_btn')) + '</button>' +
      '<div class="center" style="margin-top:14px">' +
        '<button id="btn-pw-toggle" class="link-btn">' + esc(t('password_login')) + '</button>' +
      '</div>' +
      '<div id="pw-box" class="hidden">' +
        '<div class="field"><label for="f-pw-mobile">' + esc(t('mobile_label')) + '</label>' +
        '<input id="f-pw-mobile" inputmode="numeric" maxlength="10"></div>' +
        '<div class="field"><label for="f-pw">' + esc(t('password_label')) + '</label>' +
        '<input id="f-pw" type="password" autocomplete="current-password"></div>' +
        '<div id="pw-err" class="error-text hidden"></div>' +
        '<button id="btn-pw-login" class="btn btn-big">' + esc(t('login_btn')) + '</button>' +
        '<div class="center"><button id="btn-forgot" class="link-btn">' + esc(t('forgot_password')) + '</button></div>' +
      '</div>' +
      '<div id="reset-box" class="hidden">' +
        '<h3>' + esc(t('reset_title')) + '</h3>' +
        '<div class="field"><label for="f-rs-mobile">' + esc(t('mobile_label')) + '</label>' +
        '<input id="f-rs-mobile" inputmode="numeric" maxlength="10"></div>' +
        '<button id="btn-rs-otp" class="btn btn-big">' + esc(t('send_otp')) + '</button>' +
        '<div id="rs-dev" class="dev-box hidden" style="margin-top:12px"><div>' + esc(t('dev_otp_box')) + '</div><div class="otp" id="rs-dev-otp"></div></div>' +
        '<div class="field" style="margin-top:12px"><label for="f-rs-otp">' + esc(t('otp_label')) + '</label>' +
        '<input id="f-rs-otp" inputmode="numeric" maxlength="6"></div>' +
        '<div class="field"><label for="f-rs-pw">' + esc(t('new_password')) + '</label>' +
        '<input id="f-rs-pw" type="password" autocomplete="new-password"></div>' +
        '<div id="rs-err" class="error-text hidden"></div>' +
        '<button id="btn-rs-submit" class="btn btn-gold btn-big">' + esc(t('reset_btn')) + '</button>' +
      '</div>' +
    '</div>'
  );

  function showErr(id, e) { var n = el(id); n.textContent = errMsg(e); n.classList.remove('hidden'); }
  function validMobile(v) { return /^[6-9]\d{9}$/.test(v); }

  el('btn-otp').addEventListener('click', function () {
    var mobile = el('f-mobile').value.trim();
    if (!validMobile(mobile)) { showErr('auth-err', new Error('Please enter a valid 10-digit Indian mobile number.')); return; }
    api('/auth/request-otp', { method: 'POST', body: { mobile: mobile } }).then(function (res) {
      el('auth-step-mobile').classList.add('hidden');
      el('auth-step-otp').classList.remove('hidden');
      if (res.devMode && res.devOtp) {
        el('dev-otp').textContent = res.devOtp;
        el('dev-box').classList.remove('hidden');
      }
      var first = document.querySelector('.otp-row input'); if (first) first.focus();
    }).catch(function (e) { showErr('auth-err', e); });
  });
  document.querySelectorAll('.otp-row input').forEach(function (inp, i, all) {
    inp.addEventListener('input', function () {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      if (inp.value && i < all.length - 1) all[i + 1].focus();
    });
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'Backspace' && !inp.value && i > 0) all[i - 1].focus();
    });
  });
  el('btn-change-mobile').addEventListener('click', function () {
    el('auth-step-otp').classList.add('hidden');
    el('auth-step-mobile').classList.remove('hidden');
  });
  el('btn-verify').addEventListener('click', function () {
    var otp = Array.prototype.map.call(document.querySelectorAll('.otp-row input'), function (i) { return i.value; }).join('');
    var body = { mobile: el('f-mobile').value.trim(), otp: otp };
    var name = el('f-name').value.trim(); if (name) body.name = name;
    var rc = el('f-ref').value.trim(); if (rc) body.referralCode = rc;
    if (otp.length < 4) { showErr('otp-err', new Error('Please enter the full OTP.')); return; }
    api('/auth/verify-otp', { method: 'POST', body: body }).then(function (res) {
      setSession(res.token, res.user);
      sessionStorage.removeItem('wep_ref');
      toast(t('success'));
      location.hash = '#/home'; refreshMe();
    }).catch(function (e) { showErr('otp-err', e); });
  });
  el('btn-google').addEventListener('click', googleSignIn);
  el('btn-pw-toggle').addEventListener('click', function () { el('pw-box').classList.toggle('hidden'); });
  el('btn-pw-login').addEventListener('click', function () {
    api('/auth/login-password', { method: 'POST', body: {
      mobile: el('f-pw-mobile').value.trim(), password: el('f-pw').value
    }}).then(function (res) {
      setSession(res.token, res.user); toast(t('success'));
      location.hash = '#/home'; refreshMe();
    }).catch(function (e) { showErr('pw-err', e); });
  });
  el('btn-forgot').addEventListener('click', function () { el('reset-box').classList.toggle('hidden'); });
  el('btn-rs-otp').addEventListener('click', function () {
    var mobile = el('f-rs-mobile').value.trim();
    if (!validMobile(mobile)) { showErr('rs-err', new Error('Please enter a valid 10-digit mobile number.')); return; }
    api('/auth/request-otp', { method: 'POST', body: { mobile: mobile, purpose: 'reset' } }).then(function (res) {
      if (res.devMode && res.devOtp) {
        el('rs-dev-otp').textContent = res.devOtp;
        el('rs-dev').classList.remove('hidden');
      }
      toast(t('success'));
    }).catch(function (e) { showErr('rs-err', e); });
  });
  el('btn-rs-submit').addEventListener('click', function () {
    api('/auth/reset-password', { method: 'POST', body: {
      mobile: el('f-rs-mobile').value.trim(),
      otp: el('f-rs-otp').value.trim(),
      newPassword: el('f-rs-pw').value
    }}).then(function () {
      toast(t('success') + ' ' + t('password_login'));
      el('reset-box').classList.add('hidden');
    }).catch(function (e) { showErr('rs-err', e); });
  });
}

/* ---------- 2. Home Dashboard ---------- */
function coinCard(label, value, wide) {
  return '<div class="coin-card' + (wide ? ' wide' : '') + '"><div class="label">' + coinIc() + ' ' +
    esc(label) + '</div><div class="value">' + fmt(value) + '</div></div>';
}
function vHome() {
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  refreshMe().then(function (res) {
    if (!res) { if (!state.token) location.hash = '#/login'; return; }
    var u = res.user || {}, w = res.wallet || {};
    var initial = esc((u.name || 'U').trim().charAt(0).toUpperCase());
    view(
      '<div class="hero"><div class="profile-chip">' +
        '<div class="avatar">' + initial + '</div>' +
        '<div><div class="muted" style="color:#d9ccff">' + esc(t('welcome')) + ',</div>' +
        '<h1 style="margin:0">' + esc(u.name || u.mobile || '') + '</h1>' +
        '<div class="small" style="color:#d9ccff">' + esc(t('user_id')) + ': ' + esc(u.userId || u.id || '') + '</div></div>' +
      '</div></div>' +
      '<div class="coin-grid">' +
        coinCard(t('total_coins'), w.totalCoins, true) +
        coinCard(t('available_coins'), w.availableCoins) +
        coinCard(t('pending_coins'), w.pendingCoins) +
        coinCard(t('today_earned'), res.todayEarned) +
        coinCard(t('approved_coins'), w.approvedCoins) +
      '</div>' +
      '<div class="action-grid">' +
        '<a class="action-btn primary" href="#/ads"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></svg>' + esc(t('watch_ads_btn')) + '</a>' +
        '<a class="action-btn" href="#/games"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><path d="M17.3 5H6.7a4.7 4.7 0 0 0-4.6 5.6l1.2 5.6A3 3 0 0 0 7.6 18L9 15.5h5l1.4 2.5a3 3 0 0 0 4.3-1.8l1.2-5.6A4.7 4.7 0 0 0 17.3 5z"/></svg>' + esc(t('mini_games_btn')) + '</a>' +
        '<a class="action-btn" href="#/wallet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>' + esc(t('wallet_btn')) + '</a>' +
        '<a class="action-btn" href="#/refer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>' + esc(t('refer_btn')) + '</a>' +
      '</div>' +
      '<div class="card"><h3>🪙 ' + esc(t('ads_title')) + '</h3>' +
      '<p class="muted">' + esc(t('ad_finished_watch')) + '</p>' +
      '<a class="btn btn-gold btn-big" href="#/ads">' + esc(t('watch_ad_now')) + '</a></div>'
    );
  });
}

/* ---------- 3. Watch Ads ---------- */
function vAds() {
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  api('/ads/status').then(function (s) {
    state.adsStatus = s;
    var remaining = s.remainingToday != null ? s.remainingToday : Math.max(0, (s.dailyLimit || 0) - (s.watchedToday || 0));
    var canWatch = s.adsEnabled && remaining > 0;
    view(
      '<h1>📺 ' + esc(t('ads_title')) + '</h1>' +
      (s.sandboxMode ? '<p><span class="chip chip-gold">' + esc(t('test_mode_badge')) + '</span></p>' : '') +
      '<div class="card">' +
        '<div class="kv"><span>' + esc(t('provider')) + '</span><b>' + esc(s.provider || '—') + '</b></div>' +
        '<div class="kv"><span>' + esc(t('coins_per_ad')) + '</span><b>' + coinIc() + ' ' + fmt(s.coinsPerAd) + '</b></div>' +
        '<div class="kv"><span>' + esc(t('watched_today')) + '</span><b>' + fmt(s.watchedToday) + ' / ' + fmt(s.dailyLimit) + '</b></div>' +
        '<div class="kv"><span>' + esc(t('remaining_today')) + '</span><b>' + fmt(remaining) + '</b></div>' +
        (s.message ? '<p class="muted" style="margin-top:10px">' + esc(s.message) + '</p>' : '') +
        (!s.adsEnabled ? '<p class="error-text">' + esc(t('ads_not_live')) + ' ' + esc(s.message || '') + '</p>' : '') +
        '<button id="btn-watch" class="btn btn-gold btn-big" ' + (canWatch ? '' : 'disabled') + ' style="margin-top:12px">▶ ' +
          esc(t('watch_ad_now')) + ' • ' + coinIc() + ' ' + fmt(s.coinsPerAd) + '</button>' +
      '</div>'
    );
    var btn = el('btn-watch');
    if (btn) btn.addEventListener('click', startAd);
  }).catch(function (e) { view('<div class="card"><p class="error-text">' + esc(errMsg(e)) + '</p></div>'); });
}

function startAd() {
  api('/ads/session', { method: 'POST', body: {} }).then(function (sess) {
    state.ad = {
      sessionId: sess.sessionId, token: sess.token, creative: sess.creative || {},
      coins: (state.adsStatus && state.adsStatus.coinsPerAd) || 2,
      startedAt: Date.now(), ended: false, claimed: false, timer: null
    };
    openAdPlayer();
  }).catch(function (e) { toast(errMsg(e)); });
}

function openAdPlayer() {
  var ad = state.ad, c = ad.creative;
  el('ad-title').textContent = c.title || t('ads_title');
  el('ad-test-badge').classList.toggle('hidden', !(state.adsStatus && state.adsStatus.sandboxMode));
  if (state.adsStatus && state.adsStatus.sandboxMode) el('ad-test-badge').textContent = t('test_mode_badge');
  var claim = el('ad-claim');
  claim.classList.add('hidden');
  claim.textContent = t('claim_coins', { n: ad.coins });
  claim.disabled = false;
  el('ad-progress').style.width = '0%';
  el('ad-status').textContent = t('ad_finished_watch');
  el('coin-burst').classList.add('hidden');
  var video = el('ad-video');
  video.src = c.mediaUrl || '';
  video.currentTime = 0;
  el('ad-modal').classList.remove('hidden');

  var dur = Number(c.durationSec) || 0;
  function elapsed() { return (Date.now() - ad.startedAt) / 1000; }
  function maybeEnableClaim() {
    if (ad.ended && elapsed() >= dur) {
      claim.classList.remove('hidden');
      el('ad-status').textContent = t('success') + ' ' + t('claim_coins', { n: ad.coins });
    }
  }
  video.ontimeupdate = function () {
    if (video.duration) el('ad-progress').style.width = Math.min(100, video.currentTime / video.duration * 100) + '%';
  };
  video.onended = function () {
    ad.ended = true;
    el('ad-progress').style.width = '100%';
    maybeEnableClaim();
    if (!ad.ended || elapsed() < dur) { /* still waiting for minimum watch time */ }
    if (elapsed() < dur) {
      el('ad-status').textContent = t('ad_finished_watch');
      ad.timer = setInterval(function () {
        if (!state.ad) { clearInterval(ad.timer); return; }
        if (elapsed() >= dur) { clearInterval(ad.timer); maybeEnableClaim(); }
      }, 400);
    }
  };
  video.onerror = function () { el('ad-status').textContent = t('error'); };
  var p = video.play();
  if (p && p.catch) p.catch(function () { /* autoplay with sound may be blocked; user can tap the video */ });
}

function closeAdPlayer(fromClaim) {
  var video = el('ad-video');
  try { video.pause(); } catch (e) {}
  video.removeAttribute('src'); video.load();
  el('ad-modal').classList.add('hidden');
  if (state.ad && state.ad.timer) clearInterval(state.ad.timer);
  if (state.ad && !state.ad.claimed && !fromClaim) toast(t('ad_incomplete'));
  state.ad = null;
}

function coinBurst() {
  var wrap = el('coin-burst');
  wrap.innerHTML = '';
  for (var i = 0; i < 14; i++) {
    var s = document.createElement('span');
    s.textContent = '₹';
    s.style.left = (8 + Math.random() * 84) + '%';
    s.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    s.style.animationDelay = (Math.random() * 0.25) + 's';
    wrap.appendChild(s);
  }
  wrap.classList.remove('hidden');
}

function initAdModal() {
  el('ad-close').addEventListener('click', function () { closeAdPlayer(false); });
  el('ad-claim').addEventListener('click', function () {
    var ad = state.ad; if (!ad) return;
    el('ad-claim').disabled = true;
    api('/ads/complete', { method: 'POST', body: { sessionId: ad.sessionId, token: ad.token } })
      .then(function (res) {
        ad.claimed = true;
        coinBurst();
        el('ad-status').textContent = '🎉 ' + t('coins_credited') +
          (res.availableCoins != null ? ' (' + t('available_coins') + ': ' + fmt(res.availableCoins) + ')' : '');
        el('ad-claim').classList.add('hidden');
        refreshMe();
        setTimeout(function () { closeAdPlayer(true); if (location.hash === '#/ads') vAds(); }, 1700);
      })
      .catch(function (e) {
        el('ad-claim').disabled = false;
        toast(errMsg(e)); // e.g. 409 already rewarded / 400 too early — server message shown as-is
      });
  });
}

/* ---------- 5/6. Wallet + Withdraw ---------- */
function statusChip(st) {
  var k = String(st || 'pending').toLowerCase();
  var key = { pending: 'status_pending', approved: 'status_approved', rejected: 'status_rejected',
              paid: 'status_paid', credited: 'status_credited', completed: 'status_credited' }[k];
  return '<span class="chip chip-' + esc(k) + '">' + esc(key ? t(key) : st) + '</span>';
}
function balanceCards(w) {
  return '<div class="coin-grid">' +
    coinCard(t('total_coins'), w.totalCoins, true) +
    coinCard(t('available_coins'), w.availableCoins) +
    coinCard(t('pending_coins'), w.pendingCoins) +
    coinCard(t('approved_coins'), w.approvedCoins) +
    coinCard(t('redeemed_coins'), w.redeemedCoins) +
  '</div>';
}
function conversionNote(walletRes) {
  var rate = walletRes && walletRes.conversionCoinsPerRupee;
  if (rate && Number(rate) > 0) {
    var per1000 = 1000 / Number(rate);
    return '<p class="ok-text">💰 ' + esc(t('conversion_note', { x: per1000.toFixed(2) })) + '</p>';
  }
  return '<p class="muted">' + esc(t('conversion_pending')) + '</p>';
}
function vWallet() {
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  api('/wallet').then(function (res) {
    state.wallet = res;
    var txs = asArray(res, 'transactions');
    var rows = txs.length ? txs.map(function (tx) {
      var amt = Number(tx.coins != null ? tx.coins : tx.amount) || 0;
      return '<div class="list-item"><div><div>' + esc(tx.title || tx.type || tx.description || 'Transaction') + '</div>' +
        '<div class="small muted">' + esc(fmtDate(tx.createdAt || tx.date)) + '</div></div>' +
        '<div style="text-align:right"><div class="amt" style="color:' + (amt < 0 ? 'var(--danger)' : 'var(--ok)') + '">' +
        (amt > 0 ? '+' : '') + fmt(amt) + ' ' + coinIc() + '</div>' + statusChip(tx.status) + '</div></div>';
    }).join('') : '<p class="muted">' + esc(t('no_transactions')) + '</p>';
    view(
      '<h1>👛 ' + esc(t('wallet_title')) + '</h1>' +
      balanceCards(res) +
      '<div class="card">' + conversionNote(res) +
      '<a class="btn btn-gold btn-big" href="#/withdraw">' + esc(t('withdraw_title')) + '</a></div>' +
      '<div class="card"><h2>' + esc(t('transactions')) + '</h2>' + rows + '</div>'
    );
  }).catch(function (e) { view('<div class="card"><p class="error-text">' + esc(errMsg(e)) + '</p></div>'); });
}

function vWithdraw() {
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  Promise.all([
    api('/wallet').catch(function () { return null; }),
    api('/withdrawals').catch(function () { return []; })
  ]).then(function (r) {
    var w = r[0] || {};
    var list = asArray(r[1], 'withdrawals');
    var rate = w.conversionCoinsPerRupee ? Number(w.conversionCoinsPerRupee) : 0;
    var minW = w.minWithdrawalCoins != null ? Number(w.minWithdrawalCoins) : null;
    var hist = list.length ? list.map(function (wd) {
      return '<div class="list-item"><div><div>' + coinIc() + ' <b>' + fmt(wd.coins) + '</b> → ' + esc(wd.upiId || '') + '</div>' +
        '<div class="small muted">' + esc(fmtDate(wd.createdAt)) +
        (wd.txnRef ? ' • Ref: ' + esc(wd.txnRef) : '') + '</div></div>' + statusChip(wd.status) + '</div>';
    }).join('') : '<p class="muted">' + esc(t('no_transactions')) + '</p>';
    view(
      '<h1>🏦 ' + esc(t('withdraw_title')) + '</h1>' +
      balanceCards(w) +
      '<div class="card">' +
        (minW != null ? '<p class="muted">' + esc(t('min_withdrawal')) + ': <b>' + fmt(minW) + ' ' + coinIc() + '</b></p>' : '') +
        '<div class="field"><label for="f-upi">' + esc(t('upi_label')) + '</label>' +
        '<input id="f-upi" placeholder="yourname@okhdfcbank" autocomplete="off">' +
        '<div class="small muted">' + esc(t('upi_hint')) + '</div></div>' +
        '<div class="field"><label for="f-coins">' + esc(t('coins_amount')) + '</label>' +
        '<input id="f-coins" type="number" min="1" inputmode="numeric"></div>' +
        '<p id="wd-estimate" class="ok-text"></p>' +
        '<div id="wd-err" class="error-text hidden"></div>' +
        '<button id="btn-withdraw" class="btn btn-gold btn-big">' + esc(t('withdraw_btn')) + '</button>' +
      '</div>' +
      '<div class="card"><h2>' + esc(t('withdraw_history')) + '</h2>' + hist + '</div>'
    );
    var est = el('wd-estimate');
    function updateEst() {
      var coins = Number(el('f-coins').value) || 0;
      if (!coins) { est.textContent = ''; return; }
      est.textContent = rate > 0
        ? t('rupee_estimate') + ' ₹' + (coins / rate).toFixed(2)
        : t('conversion_announced');
    }
    el('f-coins').addEventListener('input', updateEst);
    el('btn-withdraw').addEventListener('click', function () {
      var upi = el('f-upi').value.trim();
      var coins = Number(el('f-coins').value) || 0;
      var err = el('wd-err');
      function fail(m) { err.textContent = m; err.classList.remove('hidden'); }
      if (!/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}/.test(upi)) return fail('Please enter a valid UPI ID (e.g. name@okhdfcbank).');
      if (!coins || coins <= 0) return fail('Please enter how many coins to withdraw.');
      if (minW != null && coins < minW) return fail(t('min_withdrawal') + ': ' + fmt(minW));
      if (w.availableCoins != null && coins > Number(w.availableCoins)) return fail('Not enough available coins.');
      api('/withdrawals', { method: 'POST', body: { coins: coins, upiId: upi } })
        .then(function () { toast(t('success')); vWithdraw(); refreshMe(); })
        .catch(function (e) { fail(errMsg(e)); });
    });
  });
}

/* ---------- 7. Refer & Earn ---------- */
function vRefer() {
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  api('/referrals').then(function (res) {
    var code = res.code || (state.user && state.user.referralCode) || '';
    var link = res.link || (location.origin + location.pathname + '?ref=' + encodeURIComponent(code));
    var text = encodeURIComponent(t('share_text', { code: code }) + ' ' + link);
    var refs = asArray(res, 'referrals');
    view(
      '<h1>🎁 ' + esc(t('refer_title')) + '</h1>' +
      '<div class="card center"><div class="muted">' + esc(t('your_code')) + '</div>' +
        '<div class="refer-code">' + esc(code) + '</div>' +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button id="btn-copy-code" class="btn">📋 ' + esc(t('copy')) + '</button>' +
          '<button id="btn-copy-link" class="btn">🔗 ' + esc(t('share_link')) + '</button>' +
        '</div>' +
        '<p class="small muted" style="word-break:break-all">' + esc(link) + '</p>' +
        '<div class="share-row">' +
          '<a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + text + '">' + esc(t('share_whatsapp')) + '</a>' +
          '<a class="btn btn-tg" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + text + '">' + esc(t('share_telegram')) + '</a>' +
        '</div></div>' +
      '<div class="coin-grid">' +
        coinCard(t('friends_joined'), res.totalReferrals) +
        coinCard(t('referral_earned'), res.earnedCoins) +
      '</div>' +
      (refs.length ? '<div class="card"><h2>' + esc(t('friends_joined')) + '</h2>' + refs.map(function (r) {
        return '<div class="list-item"><div>' + esc(r.name || r.mobile || 'Friend') + '</div>' +
          '<div class="small muted">' + esc(fmtDate(r.createdAt || r.joinedAt)) + '</div></div>';
      }).join('') + '</div>' : '') +
      '<div class="card"><p class="muted">⚠️ ' + esc(t('referral_note')) + '</p></div>'
    );
    function copy(txt) {
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast(t('copied')); });
      else toast(txt);
    }
    el('btn-copy-code').addEventListener('click', function () { copy(code); });
    el('btn-copy-link').addEventListener('click', function () { copy(link); });
  }).catch(function (e) { view('<div class="card"><p class="error-text">' + esc(errMsg(e)) + '</p></div>'); });
}

/* ---------- 8. Notifications ---------- */
function vNotifications() {
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  api('/notifications').then(function (res) {
    var list = asArray(res, 'notifications');
    view(
      '<h1>🔔 ' + esc(t('notifications_title')) + '</h1>' +
      '<button id="btn-read-all" class="btn" style="margin-bottom:14px">' + esc(t('mark_all_read')) + '</button>' +
      '<div class="card">' +
      (list.length ? list.map(function (n) {
        return '<div class="notif-item' + (!(n.read || n.isRead) ? ' unread' : '') + '">' +
          '<div><b>' + esc(n.title || '') + '</b></div><div>' + esc(n.body || n.message || '') + '</div>' +
          '<div class="time">' + esc(fmtDate(n.createdAt)) + '</div></div>';
      }).join('') : '<p class="muted">' + esc(t('no_notifications')) + '</p>') +
      '</div>'
    );
    el('btn-read-all').addEventListener('click', function () {
      api('/notifications/read-all', { method: 'POST', body: {} })
        .then(function () { state.notifCount = 0; refreshNotifBadge(); vNotifications(); })
        .catch(function (e) { toast(errMsg(e)); });
    });
  }).catch(function (e) { view('<div class="card"><p class="error-text">' + esc(errMsg(e)) + '</p></div>'); });
}

/* ---------- 4. Mini Games ---------- */
var GAME_DEFS = [
  { id: 'tic-tac-toe', name: 'Tic Tac Toe', icon: '❌' },
  { id: 'memory-match', name: 'Memory Matching', icon: '🃏' },
  { id: 'number-puzzle', name: 'Number Puzzle', icon: '🔢' },
  { id: 'snake', name: 'Snake Game', icon: '🐍' },
  { id: 'bubble-shooter', name: 'Bubble Shooter', icon: '🫧' },
  { id: 'tap-challenge', name: 'Tap Challenge', icon: '👆' },
  { id: 'color-match', name: 'Color Matching', icon: '🎨' },
  { id: 'quick-math', name: 'Quick Math Challenge', icon: '➕' },
  { id: 'word-puzzle', name: 'Word Puzzle', icon: '🔤' },
  { id: 'block-puzzle', name: 'Block Puzzle', icon: '🧩' }
];
function gameList() {
  if (window.MiniGames && Array.isArray(window.MiniGames.list) && window.MiniGames.list.length) {
    return GAME_DEFS.map(function (d) {
      var g = window.MiniGames.list.filter(function (x) { return x.id === d.id; })[0];
      return g ? { id: d.id, name: g.name || d.name, icon: g.icon || d.icon } : d;
    });
  }
  return GAME_DEFS;
}
function cleanupGame() {
  if (state.gameCleanup) { try { state.gameCleanup(); } catch (e) {} state.gameCleanup = null; }
}
function vGames() {
  cleanupGame();
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  api('/games/scores').then(function (res) {
    var scores = asArray(res, 'scores');
    var best = {};
    scores.forEach(function (s) { best[s.gameId] = s.best != null ? s.best : s.score; });
    view(
      '<h1>🎮 ' + esc(t('games_title')) + '</h1>' +
      '<p class="muted">' + esc(t('game_rewards_off')) + '</p>' +
      '<div class="game-grid">' + gameList().map(function (g) {
        return '<button class="game-card" data-game="' + esc(g.id) + '">' +
          '<div class="g-icon">' + esc(g.icon) + '</div>' +
          '<div class="g-name">' + esc(g.name) + '</div>' +
          '<div class="g-best">' + esc(t('best_score')) + ': ' + (best[g.id] != null ? fmt(best[g.id]) : '—') + '</div>' +
        '</button>';
      }).join('') + '</div>'
    );
    document.querySelectorAll('.game-card').forEach(function (b) {
      b.addEventListener('click', function () { location.hash = '#/game/' + b.getAttribute('data-game'); });
    });
  }).catch(function (e) { view('<div class="card"><p class="error-text">' + esc(errMsg(e)) + '</p></div>'); });
}
function vGame(id) {
  cleanupGame();
  var def = gameList().filter(function (g) { return g.id === id; })[0] || { id: id, name: id, icon: '🎮' };
  view(
    '<div class="game-toolbar">' +
      '<a class="btn" href="#/games">← ' + esc(t('back')) + '</a>' +
      '<h1 style="flex:1;margin:0;font-size:1.3rem">' + esc(def.icon) + ' ' + esc(def.name) + '</h1>' +
      '<span class="chip chip-gold">' + esc(t('best_score')) + ': <span id="game-best">—</span></span>' +
      '<label class="switch" title="' + esc(t('sound')) + '"><input type="checkbox" id="game-sound" ' + (state.sound ? 'checked' : '') + '><span class="track"></span></label>' +
      '<span class="small muted">' + esc(t('sound')) + '</span>' +
    '</div>' +
    '<div id="game-stage"></div>'
  );
  function loadBest() {
    api('/games/scores').then(function (res) {
      var s = asArray(res, 'scores').filter(function (x) { return x.gameId === id; })[0];
      if (s) el('game-best').textContent = fmt(s.best != null ? s.best : s.score);
    }).catch(function () {});
  }
  loadBest();
  el('game-sound').addEventListener('change', function (ev) {
    state.sound = ev.target.checked;
    localStorage.setItem('wep_sound', state.sound ? '1' : '0');
    mountGame(); // remount so the game picks up the new sound setting
  });
  function mountGame() {
    cleanupGame();
    var stage = el('game-stage'); if (!stage) return;
    stage.innerHTML = '';
    if (window.MiniGames && typeof window.MiniGames.mount === 'function') {
      try {
        var ret = window.MiniGames.mount(id, stage, {
          soundOn: state.sound,
          reportScore: function (score) {
            api('/games/score', { method: 'POST', body: { gameId: id, score: score } })
              .then(function () { loadBest(); })
              .catch(function () { /* score saving is best-effort */ });
          }
        });
        if (typeof ret === 'function') state.gameCleanup = ret;
        else if (ret && typeof ret.destroy === 'function') state.gameCleanup = function () { ret.destroy(); };
        else if (ret && typeof ret.unmount === 'function') state.gameCleanup = function () { ret.unmount(); };
        if (stage.innerHTML === '') stage.innerHTML = '<p class="muted center">' + esc(t('game_loading')) + '</p>';
      } catch (e) {
        stage.innerHTML = '<p class="error-text center">' + esc(t('error')) + '</p>';
      }
    } else {
      stage.innerHTML = '<p class="muted center">⏳ ' + esc(t('game_loading')) + '</p>';
    }
  }
  mountGame();
}

/* ---------- 9. Support ---------- */
var FAQS = [
  ['How do I earn coins?', 'Watch a full rewarded ad from the Watch Ads section. When the ad finishes and is verified by our server, exactly 2 coins are credited to your wallet. Skipped or incomplete ads earn nothing.'],
  ['Why did I not get coins for an ad?', 'Coins are credited only after the ad plays to the end and the server verification succeeds. Closing the ad early, losing internet, or watching the same ad reward twice will not credit coins.'],
  ['How many ads can I watch per day?', 'There is a daily limit set by the admin. Your Watch Ads page shows how many you have watched today and how many remain.'],
  ['When will ads be live?', 'Ads go live only after an advertising provider that allows this reward model approves the app. Until then the Watch Ads page shows an availability message and no fake ads are shown.'],
  ['How do I withdraw my coins?', 'Go to Wallet → Withdraw, enter your UPI ID and the number of coins. The admin reviews every request manually. Approved requests are paid to your UPI ID and marked Paid with a transaction reference.'],
  ['What is the value of my coins?', 'The coin-to-rupee rate is set by the admin and is not fixed in advance. When a rate is announced, your Wallet and Withdraw pages will show "1000 Coins = ₹X" and an estimate for your withdrawal.'],
  ['How does Refer & Earn work?', 'Share your referral code or link. When a real new user joins with your code and is verified, the referral reward set by the admin is credited. Fake, duplicate or self-referrals earn nothing.'],
  ['Do mini games give coins?', 'Game rewards are off by default. Games are for fun and high scores unless the admin enables a funded, approved game reward system. This is shown on the Games page.'],
  ['Why is my withdrawal rejected?', 'Withdrawals can be rejected if the UPI ID is wrong, the coins came from unverified or fraudulent activity, or the request breaks the Reward or Withdrawal Policy. Contact support with your request details.'],
  ['How do I delete my account?', 'Open Profile → Delete Account. Deletion is permanent: your profile, coins and history are removed and cannot be restored.']
];
function vSupport() {
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  api('/support/tickets').then(function (res) {
    var tickets = asArray(res, 'tickets');
    view(
      '<h1>🛟 ' + esc(t('support_title')) + '</h1>' +
      '<h2>' + esc(t('faq_title')) + '</h2>' +
      FAQS.map(function (f, i) {
        return '<div class="faq-item"><button class="faq-q" data-faq="' + i + '">' + esc(f[0]) +
          '<span>▾</span></button><div class="faq-a hidden">' + esc(f[1]) + '</div></div>';
      }).join('') +
      '<div class="card"><h2>' + esc(t('contact_support')) + ' / ' + esc(t('report_problem')) + '</h2>' +
        '<div class="field"><label for="tk-type">' + esc(t('subject')) + '</label>' +
        '<select id="tk-type"><option value="question">' + esc(t('type_question')) + '</option>' +
        '<option value="problem">' + esc(t('type_problem')) + '</option></select></div>' +
        '<div class="field"><label for="tk-subject">' + esc(t('subject')) + '</label><input id="tk-subject"></div>' +
        '<div class="field"><label for="tk-msg">' + esc(t('message')) + '</label><textarea id="tk-msg"></textarea></div>' +
        '<div id="tk-err" class="error-text hidden"></div>' +
        '<button id="btn-ticket" class="btn btn-gold btn-big">' + esc(t('send')) + '</button></div>' +
      (tickets.length ? '<div class="card"><h2>' + esc(t('my_tickets')) + '</h2>' + tickets.map(function (tk) {
        return '<div class="list-item"><div><div><b>' + esc(tk.subject || '') + '</b></div>' +
          '<div class="small muted">' + esc(fmtDate(tk.createdAt)) + '</div></div>' + statusChip(tk.status || 'pending') + '</div>';
      }).join('') + '</div>' : '') +
      '<div class="card"><h2>' + esc(t('policies')) + '</h2>' +
        ['terms', 'privacy', 'reward', 'withdrawal', 'disclosure'].map(function (p) {
          var key = { terms: 'terms', privacy: 'privacy', reward: 'reward_policy', withdrawal: 'withdrawal_policy', disclosure: 'ad_disclosure' }[p];
          return '<div class="list-item"><a href="#/policy/' + p + '">' + esc(t(key)) + '</a><span>→</span></div>';
        }).join('') + '</div>'
    );
    document.querySelectorAll('.faq-q').forEach(function (b) {
      b.addEventListener('click', function () {
        b.nextElementSibling.classList.toggle('hidden');
      });
    });
    el('btn-ticket').addEventListener('click', function () {
      var body = { subject: el('tk-subject').value.trim(), message: el('tk-msg').value.trim(), type: el('tk-type').value };
      if (!body.subject || !body.message) {
        var e = el('tk-err'); e.textContent = 'Please fill subject and message.'; e.classList.remove('hidden'); return;
      }
      api('/support/tickets', { method: 'POST', body: body })
        .then(function () { toast(t('success')); vSupport(); })
        .catch(function (e2) { var n = el('tk-err'); n.textContent = errMsg(e2); n.classList.remove('hidden'); });
    });
  }).catch(function (e) { view('<div class="card"><p class="error-text">' + esc(errMsg(e)) + '</p></div>'); });
}

/* ---------- 10. Policies ---------- */
var POLICIES = {
  terms: { titleKey: 'terms', body:
'<h3>Terms & Conditions — Watch & Earn Pro</h3>\nLast updated: November 2026.\n\n1. Acceptance. By creating an account or using Watch & Earn Pro ("the App"), you agree to these Terms, our Privacy Policy, Reward Policy, Withdrawal Policy and Advertising Disclosure.\n\n2. Eligibility. You must be at least 13 years old (18 for withdrawals where required by law) and a resident of India. One person may hold only ONE account. Duplicate accounts, fake accounts and accounts created with another person\'s mobile number are prohibited and may be suspended without notice.\n\n3. Accounts. You log in with an Indian mobile number verified by OTP, and may additionally link a Google account. You are responsible for activity on your account. We may suspend or delete accounts that violate these Terms or our fraud rules.\n\n4. Coins. Coins are in-app reward points with no cash value until a conversion rate is announced by the admin and a withdrawal is approved and paid under the Withdrawal Policy. Coins cannot be transferred, sold or exchanged outside the App.\n\n5. No guaranteed income. The App does not guarantee any earnings. Rewards depend on advertiser availability, successful verification and admin-configured limits, and may change or pause at any time.\n\n6. Fair use. You must not use bots, VPNs, emulators, auto-clickers, modified apps or any method to fake ad views, game scores or referrals. Fraudulent activity leads to removal of coins, rejection of withdrawals and account suspension.\n\n7. Availability. We may modify, suspend or discontinue any feature, including the ads programme and games, at any time. Ad availability depends on third-party providers outside our control.\n\n8. Liability. The App is provided "as is". To the maximum extent permitted by law, we are not liable for indirect losses, lost rewards or third-party provider failures.\n\n9. Changes. We may update these Terms; continued use after an update means you accept the new Terms.\n\n10. Contact. Questions: use the Help Center inside the App.' },
  privacy: { titleKey: 'privacy', body:
'<h3>Privacy Policy — Watch & Earn Pro</h3>\nLast updated: November 2026.\n\n1. Data we collect. (a) Mobile number and, if you choose, your name, email address and Google account identity, used to create and secure your account. (b) Your UPI ID, only when you request a withdrawal, used solely to pay you. (c) App activity needed to run the rewards system: verified ad completions, coin transactions, game scores, referrals, notifications and support tickets. (d) Basic device and log data used for security and fraud prevention.\n\n2. How we use data. To operate the App, verify ad rewards on our server, prevent duplicate accounts and fraud, process admin-approved withdrawals, send notifications and answer support requests.\n\n3. What we never do. We never sell your personal data. We never expose secret API keys or payment credentials in the App. OTPs are used only for verification and are never shared.\n\n4. Sharing. Data is shared only with: the advertising provider (in the limited, usually anonymised form needed to verify a rewarded ad), payment processors when paying an approved withdrawal, and authorities when legally required.\n\n5. Storage and security. Data is stored on secure servers with access controls and audit logs. UPI IDs are treated as sensitive data and are visible only to authorised admins processing your withdrawal.\n\n6. Your rights. You can view your profile in the App, and you can delete your account permanently from Profile → Delete Account, which removes your profile and reward history. You may also contact support for data questions.\n\n7. Children. The App is not directed at children under 13. If you believe a child has provided data, contact support and we will remove it.\n\n8. Changes. We will announce material changes to this policy inside the App.' },
  reward: { titleKey: 'reward_policy', body:
'<h3>Reward Policy — Watch & Earn Pro</h3>\nLast updated: November 2026.\n\n1. How coins are earned. Exactly 2 coins are credited for ONE fully watched, server-verified rewarded advertisement. The number of coins per ad can be changed by the admin for future ads; the rate shown on the Watch Ads page at the time you watch is the rate that applies.\n\n2. Verification. Every reward is verified on our server with the advertising provider\'s verification system. No coins are given for: skipped ads, ads closed early, incomplete playback, repeat claims for the same ad session, or views that fail verification for any reason.\n\n3. Limits. A daily ad limit set by the admin applies to every account. The Watch Ads page shows your watched count and remaining count for today.\n\n4. Pending coins. Coins may first appear as Pending while verification and fraud checks complete, and later move to Approved / Available. Only Available coins can be withdrawn.\n\n5. Games. Mini-game rewards are DISABLED by default. Games are for entertainment and high scores unless the admin enables a properly funded, approved game reward system, in which case the Games page will state the reward rules before you play.\n\n6. Referrals. Referral rewards are credited only for genuine new users who verify their mobile number and are not duplicates of existing users. Self-referrals, fake referrals and referral rings earn nothing and may cause suspension.\n\n7. Fraud. Coins earned through bots, VPNs, emulators, tampered apps or any deception may be removed, related withdrawals rejected, and the account suspended. Fraud decisions are logged for audit.\n\n8. Coin value. Coins have no fixed cash value. The coin-to-rupee conversion rate is set by the admin and announced in the Wallet. Until a rate is announced, no rupee value is promised for any coin balance.' },
  withdrawal: { titleKey: 'withdrawal_policy', body:
'<h3>Withdrawal Policy — Watch & Earn Pro</h3>\nLast updated: November 2026.\n\n1. Who can withdraw. Any verified user whose Available coin balance meets the minimum withdrawal amount set by the admin (shown on the Withdraw page).\n\n2. How it works. Enter the number of coins and your own UPI ID, then submit the request. Requests are reviewed MANUALLY by the admin. Statuses are: Pending → Approved → Paid, or Rejected. When paid, the payment transaction reference is shown in your withdrawal history.\n\n3. No automatic payments. Payments are not automatic. We do not claim instant or automatic UPI payments; every payment is approved and processed by the admin, normally within 7 working days of approval.\n\n4. Value. The rupee amount is calculated from the admin-configured conversion rate in force when the request is approved. If no rate is configured, withdrawals in rupees cannot be processed and the Withdraw page will say the rate will be announced.\n\n5. Rejections. A request may be rejected if the UPI ID is invalid or belongs to someone else, the coins are Pending or disputed, the coins came from unverified or fraudulent activity, or the request violates the Reward Policy. Rejected requests return the coins to your Available balance unless the coins themselves were removed for fraud.\n\n6. Responsibility. Please double-check your UPI ID. We are not responsible for payments sent to a wrong UPI ID that you entered.\n\n7. Taxes. You are responsible for any taxes that apply to rewards you receive under Indian law.' },
  disclosure: { titleKey: 'ad_disclosure', body:
'<h3>Advertising Disclosure — Watch & Earn Pro</h3>\nLast updated: November 2026.\n\n1. How ads fund rewards. Watch & Earn Pro shows rewarded video advertisements. Advertisers pay the App for verified ad views, and a share of that actual, verified revenue funds user coin rewards under the revenue-sharing settings configured by the admin.\n\n2. Approved providers only. Rewarded ads are shown ONLY through advertising providers that explicitly permit cash-redeemable / incentivised rewards for this exact model and have approved this App. Standard non-incentivised ad placements are never used for coin rewards.\n\n3. No fake ads. If no approved provider is live, the Watch Ads section shows an availability message instead of ads. The App never shows fake or house-made ads as if they were paid advertisements, and never promises revenue for views that were not verified.\n\n4. Test mode. During development and review, the App may run in sandbox / test mode with clearly labelled sample ads. Coins earned in test mode are test coins for trying the App and may be reset before public launch; test-mode rewards are not a promise of real-money earnings.\n\n5. Revenue honesty. Not every ad generates the same revenue. Revenue share calculations use only actual, verified and eligible advertising revenue after provider deductions and rules — never assumed or fixed per-ad amounts.\n\n6. Your data and ads. Ad providers may process limited device and advertising identifiers to deliver and verify ads, as described in the Privacy Policy.' }
};
function vPolicy(id) {
  var p = POLICIES[id] || POLICIES.terms;
  view(
    '<a class="btn" href="#/support">← ' + esc(t('back')) + '</a>' +
    '<div class="card" style="margin-top:14px"><div class="policy-text">' + p.body + '</div></div>'
  );
}

/* ---------- 11. Profile ---------- */
function vProfile() {
  view('<div class="card center"><p class="muted">' + esc(t('loading')) + '</p></div>');
  refreshMe().then(function (res) {
    var u = (res && res.user) || state.user || {};
    view(
      '<h1>👤 ' + esc(t('profile_title')) + '</h1>' +
      '<div class="card">' +
        '<div class="profile-chip" style="margin-bottom:10px"><div class="avatar">' + esc((u.name || 'U').charAt(0).toUpperCase()) + '</div>' +
        '<div><b style="font-size:1.15rem">' + esc(u.name || '') + '</b><div class="muted small">' + esc(u.mobile || '') + '</div></div></div>' +
        '<div class="kv"><span>' + esc(t('user_id')) + '</span><b>' + esc(u.userId || u.id || '') + '</b></div>' +
        '<div class="kv"><span>' + esc(t('mobile_label')) + '</span><b>' + esc(u.mobile || '') + '</b></div>' +
        '<div class="kv"><span>' + esc(t('email')) + '</span><b>' + esc(u.email || '—') + '</b></div>' +
        '<div class="kv"><span>' + esc(t('your_code')) + '</span><b>' + esc(u.referralCode || '') + '</b></div>' +
      '</div>' +
      '<div class="card"><h2>' + esc(t('set_password')) + '</h2>' +
        '<div class="field"><label for="pf-cur">' + esc(t('current_password')) + '</label><input id="pf-cur" type="password"></div>' +
        '<div class="field"><label for="pf-new">' + esc(t('new_password')) + '</label><input id="pf-new" type="password"></div>' +
        '<div id="pf-err" class="error-text hidden"></div>' +
        '<button id="btn-pf-save" class="btn btn-gold btn-big">' + esc(t('save')) + '</button></div>' +
      '<div class="card">' +
        '<a class="btn btn-big" href="#/support" style="width:100%">' + esc(t('support_title')) + '</a>' +
        '<button id="btn-logout" class="btn btn-big" style="width:100%;margin-top:10px">' + esc(t('logout')) + '</button>' +
        '<button id="btn-delete" class="btn btn-danger btn-big" style="margin-top:10px">' + esc(t('delete_account')) + '</button>' +
      '</div>'
    );
    el('btn-pf-save').addEventListener('click', function () {
      api('/me/password', { method: 'POST', body: {
        currentPassword: el('pf-cur').value, newPassword: el('pf-new').value
      }}).then(function () { toast(t('success')); })
        .catch(function (e) { var n = el('pf-err'); n.textContent = errMsg(e); n.classList.remove('hidden'); });
    });
    el('btn-logout').addEventListener('click', function () { logout(true); });
    el('btn-delete').addEventListener('click', function () {
      confirmModal(t('delete_account'), t('delete_confirm'), t('delete_btn')).then(function (ok) {
        if (!ok) return;
        api('/me', { method: 'DELETE' }).then(function () { logout(true); })
          .catch(function (e) { toast(errMsg(e)); });
      });
    });
  });
}

/* ---------- 12. Admin Panel ---------- */
function vAdmin() {
  if (!state.adminToken) {
    view(
      '<div class="card" style="max-width:440px;margin:30px auto">' +
      '<h1>🔐 ' + esc(t('admin_login')) + '</h1>' +
      '<div class="field"><label for="a-user">' + esc(t('username')) + '</label><input id="a-user" autocomplete="username"></div>' +
      '<div class="field"><label for="a-pass">' + esc(t('password_label')) + '</label><input id="a-pass" type="password" autocomplete="current-password"></div>' +
      '<div id="a-err" class="error-text hidden"></div>' +
      '<button id="btn-a-login" class="btn btn-gold btn-big">' + esc(t('login_btn')) + '</button></div>'
    );
    el('btn-a-login').addEventListener('click', function () {
      fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: el('a-user').value.trim(), password: el('a-pass').value }) })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.message || 'Login failed'); return d; }); })
        .then(function (d) {
          state.adminToken = d.token; localStorage.setItem('wep_admin_token', d.token); vAdmin();
        })
        .catch(function (e) { var n = el('a-err'); n.textContent = errMsg(e); n.classList.remove('hidden'); });
    });
    return;
  }
  view(
    '<h1>🛠️ ' + esc(t('admin_title')) + '</h1>' +
    '<div class="admin-tabs" id="a-tabs">' +
      ['dashboard', 'settings', 'users', 'withdrawals', 'revenue', 'fraud', 'announce'].map(function (tab) {
        var key = { dashboard: 'admin_dashboard', settings: 'settings', users: 'users', withdrawals: 'withdrawals',
                    revenue: 'revenue', fraud: 'fraud', announce: 'announce' }[tab];
        return '<button class="btn" data-atab="' + tab + '">' + esc(t(key)) + '</button>';
      }).join('') +
      '<button class="btn" id="a-export">' + esc(t('export_csv')) + '</button>' +
      '<button class="btn btn-ghost" id="a-logout">' + esc(t('logout')) + '</button>' +
    '</div>' +
    '<div id="a-body"><p class="muted">' + esc(t('loading')) + '</p></div>'
  );
  document.querySelectorAll('[data-atab]').forEach(function (b) {
    b.addEventListener('click', function () { adminTab(b.getAttribute('data-atab')); });
  });
  el('a-logout').addEventListener('click', function () {
    state.adminToken = null; localStorage.removeItem('wep_admin_token'); vAdmin();
  });
  el('a-export').addEventListener('click', function () {
    spin(true);
    fetch('/api/admin/export.csv', { headers: { Authorization: 'Bearer ' + state.adminToken } })
      .then(function (r) { if (!r.ok) throw new Error('Export failed (' + r.status + ')'); return r.blob(); })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'watch-earn-pro-export.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      })
      .catch(function (e) { toast(errMsg(e)); })
      .finally(function () { spin(false); });
  });
  adminTab('dashboard');
}
function adminTab(tab) {
  document.querySelectorAll('[data-atab]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-atab') === tab);
  });
  var body = el('a-body'); if (!body) return;
  body.innerHTML = '<p class="muted">' + esc(t('loading')) + '</p>';
  if (tab === 'dashboard') {
    adminApi('/admin/stats').then(function (s) {
      function card(l, v) { return '<div class="stat-card"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div></div>'; }
      function rupees(paise) { return paise == null ? '—' : '₹' + (Number(paise) / 100).toFixed(2); }
      body.innerHTML = '<div class="stat-grid">' +
        card(t('total_users'), fmt(s.totalUsers)) +
        card(t('active_users'), fmt(s.activeUsers)) +
        card('Verified Mobile', fmt(s.verifiedMobile != null ? s.verifiedMobile : s.totalUsers)) +
        card('Google Accounts', fmt(s.googleUsers || 0)) +
        card(t('total_ad_views'), fmt(s.totalAdViews)) +
        card(t('total_revenue'), rupees(s.totalRevenuePaise)) +
        card(t('coins_distributed'), fmt(s.totalCoinsDistributed)) +
        card(t('pending_rewards'), fmt(s.pendingRewards)) +
        card(t('withdrawals') + ' • ' + t('status_pending'), fmt(s.pendingWithdrawals)) +
        card(t('withdrawals') + ' • ' + t('status_paid'), fmt(s.paidWithdrawals)) +
        card(t('withdrawals') + ' • ' + t('status_rejected'), fmt(s.rejectedWithdrawals)) +
        card(t('fraud'), fmt(s.fraudAlerts || 0)) +
      '</div>';
    }).catch(function (e) { body.innerHTML = '<p class="error-text">' + esc(errMsg(e)) + '</p>'; });
  }
  if (tab === 'settings') {
    adminApi('/admin/settings').then(function (res) {
      var s = res.settings || res || {};
      function num(key, label) {
        return '<div class="field"><label for="s-' + key + '">' + label + '</label>' +
          '<input id="s-' + key + '" type="number" step="any" value="' + (s[key] == null ? '' : esc(s[key])) + '"></div>';
      }
      function chk(key, label) {
        return '<div class="field"><label><input type="checkbox" id="s-' + key + '" ' + (s[key] ? 'checked' : '') +
          ' style="width:22px;height:22px;vertical-align:-4px"> ' + label + '</label></div>';
      }
      body.innerHTML = '<div class="card">' +
        num('coinsPerAd', t('coins_per_ad')) +
        num('conversionCoinsPerRupee', 'Conversion: Coins per ₹1 (blank = not set)') +
        num('minWithdrawalCoins', t('min_withdrawal') + ' (coins)') +
        num('dailyAdLimit', 'Daily Ad Limit') +
        num('adminSharePct', 'Admin Share % (user gets the rest)') +
        num('referralRewardCoins', 'Referral Reward Coins') +
        chk('adsEnabled', 'Ads Enabled') +
        chk('sandboxMode', 'Sandbox / Test Mode') +
        num('sandboxRevenuePaise', 'Sandbox Revenue (paise)') +
        chk('gameRewardsEnabled', 'Game Rewards Enabled') +
        num('gameRewardCoins', 'Game Reward Coins') +
        num('gameRewardDailyCap', 'Game Reward Daily Cap') +
        '<div class="field"><label for="s-announcement">' + t('announcement') + '</label>' +
        '<input id="s-announcement" value="' + esc(s.announcement || '') + '"></div>' +
        '<button id="btn-a-settings" class="btn btn-gold btn-big">' + esc(t('save')) + '</button></div>';
      el('btn-a-settings').addEventListener('click', function () {
        function n(key) { var v = el('s-' + key).value; return v === '' ? null : Number(v); }
        function c(key) { return el('s-' + key).checked; }
        var payload = {
          coinsPerAd: n('coinsPerAd'), conversionCoinsPerRupee: n('conversionCoinsPerRupee'),
          minWithdrawalCoins: n('minWithdrawalCoins'), dailyAdLimit: n('dailyAdLimit'),
          adminSharePct: n('adminSharePct'), referralRewardCoins: n('referralRewardCoins'),
          adsEnabled: c('adsEnabled'), sandboxMode: c('sandboxMode'),
          sandboxRevenuePaise: n('sandboxRevenuePaise'),
          gameRewardsEnabled: c('gameRewardsEnabled'), gameRewardCoins: n('gameRewardCoins'),
          gameRewardDailyCap: n('gameRewardDailyCap'),
          announcement: el('s-announcement').value
        };
        adminApi('/admin/settings', { method: 'PUT', body: payload })
          .then(function () { toast(t('success')); refreshMe(); })
          .catch(function (e) { toast(errMsg(e)); });
      });
    }).catch(function (e) { body.innerHTML = '<p class="error-text">' + esc(errMsg(e)) + '</p>'; });
  }
  if (tab === 'users') {
    adminApi('/admin/users').then(function (res) {
      var users = asArray(res, 'users');
      body.innerHTML = '<div class="card table-wrap"><table><thead><tr><th>User</th><th>Mobile</th><th>Email</th><th>Coins</th><th>Status</th><th></th></tr></thead><tbody>' +
        users.map(function (u) {
          var suspended = u.suspended || u.status === 'suspended';
          return '<tr><td><b>' + esc(u.name || '') + '</b><br><span class="small muted">' + esc(u.userId || u.id || '') + '</span></td>' +
            '<td>' + esc(u.mobile || '') + '</td><td>' + esc(u.email || '—') + '</td>' +
            '<td>' + fmt(u.availableCoins != null ? u.availableCoins : (u.wallet && u.wallet.availableCoins)) + '</td>' +
            '<td>' + (suspended ? statusChip('rejected').replace(t('status_rejected'), 'Suspended') : statusChip('approved').replace(t('status_approved'), 'Active')) + '</td>' +
            '<td><button class="btn" data-suspend="' + esc(u.id) + '" data-state="' + (suspended ? '1' : '0') + '">' +
              esc(suspended ? t('activate') : t('suspend')) + '</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      body.querySelectorAll('[data-suspend]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-suspend');
          var target = b.getAttribute('data-state') !== '1';
          adminApi('/admin/users/' + encodeURIComponent(id) + '/suspend', { method: 'POST', body: { suspended: target } })
            .then(function () { toast(t('success')); adminTab('users'); })
            .catch(function (e) { toast(errMsg(e)); });
        });
      });
    }).catch(function (e) { body.innerHTML = '<p class="error-text">' + esc(errMsg(e)) + '</p>'; });
  }
  if (tab === 'withdrawals') {
    adminApi('/admin/withdrawals').then(function (res) {
      var list = asArray(res, 'withdrawals');
      body.innerHTML = '<div class="card table-wrap"><table><thead><tr><th>User</th><th>Coins</th><th>UPI</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        (list.length ? list.map(function (w) {
          var acts = '';
          if (String(w.status).toLowerCase() === 'pending') {
            acts = '<button class="btn" data-act="approve" data-id="' + esc(w.id) + '">' + esc(t('approve')) + '</button> ' +
                   '<button class="btn" data-act="reject" data-id="' + esc(w.id) + '">' + esc(t('reject')) + '</button>';
          } else if (String(w.status).toLowerCase() === 'approved') {
            acts = '<button class="btn btn-gold" data-act="paid" data-id="' + esc(w.id) + '">' + esc(t('mark_paid')) + '</button>';
          }
          return '<tr><td>' + esc(w.userName || w.userId || w.user || '') + '<br><span class="small muted">' + esc(w.mobile || '') + '</span></td>' +
            '<td><b>' + fmt(w.coins) + '</b></td><td>' + esc(w.upiId || '') + '</td>' +
            '<td>' + esc(fmtDate(w.createdAt)) + '</td><td>' + statusChip(w.status) +
            (w.txnRef ? '<br><span class="small muted">Ref: ' + esc(w.txnRef) + '</span>' : '') + '</td><td>' + acts + '</td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted">' + esc(t('no_transactions')) + '</td></tr>') +
        '</tbody></table></div>';
      body.querySelectorAll('[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
          var payload = {};
          if (act === 'paid') {
            var ref = prompt(t('enter_txn_ref'));
            if (!ref) return;
            payload.txnRef = ref;
          }
          adminApi('/admin/withdrawals/' + encodeURIComponent(id) + '/' + act, { method: 'POST', body: payload })
            .then(function () { toast(t('success')); adminTab('withdrawals'); })
            .catch(function (e) { toast(errMsg(e)); });
        });
      });
    }).catch(function (e) { body.innerHTML = '<p class="error-text">' + esc(errMsg(e)) + '</p>'; });
  }
  if (tab === 'revenue') {
    adminApi('/admin/revenue').then(function (r) {
      function row(l, v) { return '<div class="kv"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; }
      function rupees(p) { return p == null ? '—' : '₹' + (Number(p) / 100).toFixed(2); }
      var userShare = r.userSharePct != null ? r.userSharePct : (r.adminSharePct != null ? 100 - Number(r.adminSharePct) : null);
      body.innerHTML = '<div class="card"><h2>' + esc(t('revenue')) + '</h2>' +
        row(t('total_revenue'), rupees(r.totalRevenuePaise)) +
        row('Admin Share' + (r.adminSharePct != null ? ' (' + r.adminSharePct + '%)' : ''), rupees(r.adminSharePaise)) +
        row('User Reward Share' + (userShare != null ? ' (' + userShare + '%)' : ''), rupees(r.userSharePaise)) +
        row('User Reward Liability', rupees(r.userRewardLiabilityPaise)) +
        row(t('pending_rewards'), fmt(r.pendingRewards)) +
        row('Total Paid Rewards', rupees(r.totalPaidPaise)) +
        row('Net Available Revenue', rupees(r.netAvailablePaise)) +
        '<p class="small muted">Calculated only from actual, verified and eligible advertising revenue after provider deductions.</p></div>';
    }).catch(function (e) { body.innerHTML = '<p class="error-text">' + esc(errMsg(e)) + '</p>'; });
  }
  if (tab === 'fraud') {
    adminApi('/admin/fraud').then(function (res) {
      var list = asArray(res, 'fraud') || asArray(res, 'alerts') || asArray(res, 'logs');
      body.innerHTML = '<div class="card"><h2>' + esc(t('fraud')) + '</h2>' +
        (list.length ? list.map(function (f) {
          return '<div class="list-item"><div><div><b>' + esc(f.type || f.reason || 'Alert') + '</b></div>' +
            '<div class="small muted">' + esc(f.detail || f.message || '') + ' • ' + esc(f.userId || f.user || '') + '</div></div>' +
            '<div class="small muted">' + esc(fmtDate(f.createdAt)) + '</div></div>';
        }).join('') : '<p class="muted">No fraud alerts. ✅</p>') + '</div>';
    }).catch(function (e) { body.innerHTML = '<p class="error-text">' + esc(errMsg(e)) + '</p>'; });
  }
  if (tab === 'announce') {
    body.innerHTML = '<div class="card"><h2>' + esc(t('announce')) + '</h2>' +
      '<div class="field"><label for="an-title">' + esc(t('subject')) + '</label><input id="an-title"></div>' +
      '<div class="field"><label for="an-body">' + esc(t('message')) + '</label><textarea id="an-body"></textarea></div>' +
      '<button id="btn-announce" class="btn btn-gold btn-big">' + esc(t('send')) + '</button></div>';
    el('btn-announce').addEventListener('click', function () {
      adminApi('/admin/announce', { method: 'POST', body: {
        title: el('an-title').value.trim(), body: el('an-body').value.trim()
      }}).then(function () { toast(t('success')); el('an-title').value = ''; el('an-body').value = ''; })
        .catch(function (e) { toast(errMsg(e)); });
    });
  }
}

/* ============================================================
   ROUTER + BOOT
   ============================================================ */
function route() {
  var hash = location.hash || '#/home';
  var parts = hash.replace(/^#\//, '').split('/');
  var page = parts[0] || 'home';
  if (page !== 'game') cleanupGame();
  if (page === 'admin') { syncChrome(); vAdmin(); return; }
  if (!state.token) {
    if (page !== 'login') { location.hash = '#/login'; return; }
    vLogin(); syncChrome(); return;
  }
  if (page === 'login' || page === '') { location.hash = '#/home'; return; }
  var routes = {
    home: vHome, ads: vAds, games: vGames, wallet: vWallet, withdraw: vWithdraw,
    refer: vRefer, notifications: vNotifications, support: vSupport, profile: vProfile
  };
  if (page === 'game') vGame(parts[1] || '');
  else if (page === 'policy') vPolicy(parts[1] || 'terms');
  else if (routes[page]) routes[page]();
  else vHome();
  syncChrome();
}

function boot() {
  initChrome();
  initAdModal();
  // Prefill referral from ?ref=
  var ref = new URLSearchParams(location.search).get('ref');
  if (ref) sessionStorage.setItem('wep_ref', ref);
  loadConfig().then(function () {
    if (state.token) refreshMe();
    route();
  });
}
document.addEventListener('DOMContentLoaded', boot);
