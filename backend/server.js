'use strict';
/**
 * WATCH & EARN PRO — backend
 * Zero external dependencies: node:http (server), node:sqlite (DB), node:crypto (hashing/tokens).
 * Run:  node backend/server.js        (PORT env, default 8080)
 *
 * SECURITY NOTES
 * - JWT_SECRET below has a DEV default. You MUST set a strong random JWT_SECRET in production.
 * - All coin/money math happens here on the server, in integer coins / paise. Never trust the client.
 * - Real rewarded-ads networks plug in ONLY through the SSV callback (POST /api/ads/ssv/:provider)
 *   after the network has explicitly approved this cash-reward model in writing.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// ---------------------------------------------------------------- config
const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'app.db');
const PUBLIC_DIR = path.join(ROOT, 'public');
// !!! CHANGE IN PRODUCTION: set JWT_SECRET to a long random string in the environment. !!!
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me-in-production';
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const OTP_TTL_MS = 5 * 60 * 1000;
const BODY_LIMIT = 1024 * 1024; // 1 MB JSON body limit

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// ---------------------------------------------------------------- database
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_code TEXT UNIQUE NOT NULL,            -- public id, e.g. WEP-100001
  name TEXT,
  mobile TEXT UNIQUE,                        -- Indian 10-digit; anonymized on deletion
  email TEXT UNIQUE,
  password_hash TEXT,                        -- scrypt "salt:hash" (optional secondary credential)
  google_sub TEXT UNIQUE,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by INTEGER REFERENCES users(id),
  suspended INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,  -- bump to invalidate all tokens (logout / delete)
  last_login_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login',     -- 'login' | 'reset'
  code_hash TEXT NOT NULL,                   -- sha256 of the code, never stored in plain text
  expires_at INTEGER NOT NULL,               -- epoch ms
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otps_mobile ON otps(mobile, purpose);
CREATE TABLE IF NOT EXISTS ad_sessions (
  id TEXT PRIMARY KEY,                       -- sessionId (uuid)
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  nonce TEXT NOT NULL,
  created_ms INTEGER NOT NULL,               -- epoch ms, used for the elapsed-time check
  rewarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT UNIQUE,                    -- sandbox/internal sessions
  provider TEXT NOT NULL,
  trans_id TEXT UNIQUE,                      -- provider transaction id (SSV idempotency key)
  coins INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_revenue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  completion_id INTEGER REFERENCES ad_completions(id),
  provider TEXT NOT NULL,
  trans_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL DEFAULT 0,   -- ONLY ever written from verified data; never invented
  is_test INTEGER NOT NULL DEFAULT 0,        -- 1 = sandbox/test revenue, excluded from real totals
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coin_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  txn_id TEXT UNIQUE NOT NULL,               -- TXN-<ts>-<rand>
  type TEXT NOT NULL,                        -- ad_reward | game_reward | referral_reward | withdrawal | admin_adjust
  coins INTEGER NOT NULL,                    -- signed: credits positive, debits negative
  status TEXT NOT NULL,                      -- approved | pending | rejected
  note TEXT,
  ref_id INTEGER,                            -- e.g. withdrawal id for withdrawal entries
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ctx_user ON coin_transactions(user_id, status);
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  coins INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,
  upi_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending -> approved -> paid | rejected
  txn_ref TEXT,                              -- UPI/payment reference, required when paid
  reason TEXT,                               -- rejection reason
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL REFERENCES users(id),
  referred_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  rewarded INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, game_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT                                  -- JSON-encoded value
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fraud_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,                        -- 'admin:<name>' | 'user:<code>' | 'system'
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
`);

// ---------------------------------------------------------------- settings
const SETTING_DEFAULTS = {
  coinsPerAd: 2,
  conversionCoinsPerRupee: null,   // null = NOT configured yet; withdrawals stay blocked until admin sets it
  minWithdrawalCoins: 1000,
  dailyAdLimit: 20,
  adminSharePct: 75,               // user share = 100 - adminSharePct
  gameRewardsEnabled: false,       // game rewards OFF by default (spec §5)
  gameRewardCoins: 0,
  gameRewardDailyCap: 10,
  referralRewardCoins: 0,          // 0 = referral rewards disabled by default
  adsEnabled: false,               // real ads OFF until an approved provider is configured (spec §15)
  sandboxMode: true,               // sandbox lets the flow be tested end-to-end with test creatives
  sandboxRevenuePaise: 0,          // test revenue per sandbox completion (recorded with is_test=1)
  announcement: '',
};
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return SETTING_DEFAULTS[key];
  try { return JSON.parse(row.value); } catch { return SETTING_DEFAULTS[key]; }
}
function getAllSettings() {
  const out = { ...SETTING_DEFAULTS };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    try { out[row.key] = JSON.parse(row.value); } catch { /* keep default */ }
  }
  return out;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value === undefined ? null : value));
}

// ---------------------------------------------------------------- crypto helpers
const nowIso = () => new Date().toISOString();
const todayUtc = () => new Date().toISOString().slice(0, 10);
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac = (data, secret = JWT_SECRET) => crypto.createHmac('sha256', secret).update(String(data)).digest();
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// HMAC-signed bearer tokens: base64url(payload).base64url(hmac)
function signToken(payload) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
  return body + '.' + b64url(hmac(body));
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = b64url(hmac(body));
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function newTxnId() {
  return 'TXN-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}
function newReferralCode() {
  for (let i = 0; i < 20; i++) {
    const code = 'WEP' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    if (!db.prepare('SELECT id FROM users WHERE referral_code = ?').get(code)) return code;
  }
  throw new Error('could not allocate referral code');
}

function audit(actor, action, detail) {
  db.prepare('INSERT INTO audit_logs(actor, action, detail, created_at) VALUES(?, ?, ?, ?)')
    .run(actor, action, detail ? String(detail) : null, nowIso());
}
function fraud(userId, type, detail) {
  db.prepare('INSERT INTO fraud_logs(user_id, type, detail, created_at) VALUES(?, ?, ?, ?)')
    .run(userId || null, type, detail ? String(detail) : null, nowIso());
}
function notify(userId, type, title, body) {
  db.prepare('INSERT INTO notifications(user_id, type, title, body, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userId, type, title, body || null, nowIso());
}

// ---------------------------------------------------------------- wallet (ledger-derived balances)
// Ledger rules:
//  - credits (ad/game/referral rewards) are inserted with status 'approved' -> spendable.
//  - a withdrawal request inserts a NEGATIVE entry with status 'pending' (a hold):
//    it raises pendingCoins and lowers availableCoins without touching approvedCoins.
//  - admin 'paid' flips the hold to 'approved'  -> redeemedCoins rises, available stays lowered.
//  - admin 'reject' flips the hold to 'rejected' -> the hold disappears, coins return to available.
function walletSummary(userId) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN coins > 0 AND status = 'approved' THEN coins ELSE 0 END), 0) AS approved_coins,
      COALESCE(SUM(CASE WHEN coins < 0 AND status = 'pending'  THEN -coins ELSE 0 END), 0) AS pending_coins,
      COALESCE(SUM(CASE WHEN coins < 0 AND status = 'approved' THEN -coins ELSE 0 END), 0) AS redeemed_coins
    FROM coin_transactions WHERE user_id = ?`).get(userId);
  const approvedCoins = row.approved_coins;
  const pendingCoins = row.pending_coins;
  const redeemedCoins = row.redeemed_coins;
  const availableCoins = approvedCoins - redeemedCoins - pendingCoins;
  return { totalCoins: approvedCoins, availableCoins, pendingCoins, approvedCoins, redeemedCoins };
}
function creditCoins(userId, coins, type, note) {
  const txnId = newTxnId();
  db.prepare('INSERT INTO coin_transactions(user_id, txn_id, type, coins, status, note, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
    .run(userId, txnId, type, coins, 'approved', note || null, nowIso());
  return txnId;
}
function todayCoins(userId, type) {
  const row = db.prepare(`SELECT COALESCE(SUM(coins),0) AS s FROM coin_transactions
    WHERE user_id = ? AND type = ? AND status = 'approved' AND substr(created_at,1,10) = ?`)
    .get(userId, type, todayUtc());
  return row.s;
}

// ---------------------------------------------------------------- rate limiting (in-memory buckets)
const rlBuckets = new Map(); // key -> [timestamps]
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (rlBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { rlBuckets.set(key, arr); return false; }
  arr.push(now); rlBuckets.set(key, arr); return true;
}
setInterval(() => { // periodic cleanup so the map cannot grow forever
  const now = Date.now();
  for (const [k, arr] of rlBuckets) {
    const live = arr.filter((t) => now - t < 3600 * 1000);
    if (live.length) rlBuckets.set(k, live); else rlBuckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

// ---------------------------------------------------------------- admin seed
// Seeded from env ADMIN_USER / ADMIN_PASS (defaults admin / admin123 — CHANGE IN PRODUCTION).
(function seedAdmin() {
  const username = process.env.ADMIN_USER || 'admin';
  if (!db.prepare('SELECT id FROM admins WHERE username = ?').get(username)) {
    db.prepare('INSERT INTO admins(username, password_hash, created_at) VALUES(?, ?, ?)')
      .run(username, hashPassword(process.env.ADMIN_PASS || 'admin123'), nowIso());
    audit('system', 'admin_seeded', username);
  }
})();

module.exports = {}; // (single-file app; exports unused)

// ---------------------------------------------------------------- http plumbing
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(Object.assign(new Error('body_too_large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('invalid_json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const clientIp = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();

const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ method, regex, keys, handler, opts });
}

// ---------------------------------------------------------------- auth middleware
function loadUser(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  const payload = verifyToken(m[1]);
  if (!payload || payload.role !== 'user') return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user || user.deleted) return null;
  if (payload.tv !== user.token_version) return null; // logged out / invalidated
  return user;
}
function requireUser(req, res) {
  const user = loadUser(req);
  if (!user) { sendJson(res, 401, { error: 'unauthorized' }); return null; }
  return user;
}
// Suspended users may read their profile/wallet but cannot earn, play for rewards or withdraw.
function requireActiveUser(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.suspended) { sendJson(res, 403, { error: 'account_suspended' }); return null; }
  return user;
}
function requireAdmin(req, res) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const payload = m && verifyToken(m[1]);
  if (!payload || payload.role !== 'admin') { sendJson(res, 401, { error: 'unauthorized' }); return null; }
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(payload.sub);
  if (!admin) { sendJson(res, 401, { error: 'unauthorized' }); return null; }
  req.admin = admin;
  return admin;
}
function publicUser(u) {
  return {
    id: u.id, userId: u.user_code, name: u.name, mobile: u.mobile, email: u.email,
    referralCode: u.referral_code, hasPassword: !!u.password_hash,
    googleLinked: !!u.google_sub, suspended: !!u.suspended, createdAt: u.created_at,
  };
}
function issueUserToken(user) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  return signToken({ sub: user.id, role: 'user', tv: user.token_version });
}

// ---------------------------------------------------------------- validation helpers
const isValidMobile = (m) => typeof m === 'string' && /^[6-9]\d{9}$/.test(m); // Indian 10-digit mobile
const isValidUpi = (u) => typeof u === 'string' && /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(u.trim());

// ---------------------------------------------------------------- AUTH: OTP
route('POST', '/api/auth/request-otp', async (req, res, body) => {
  const mobile = body.mobile;
  const purpose = body.purpose === 'reset' ? 'reset' : 'login';
  if (!isValidMobile(mobile)) return sendJson(res, 400, { error: 'invalid_mobile', message: 'Enter a valid 10-digit Indian mobile number.' });
  if (purpose === 'reset' && !db.prepare('SELECT id FROM users WHERE mobile = ? AND deleted = 0').get(mobile)) {
    return sendJson(res, 404, { error: 'account_not_found' });
  }
  // Rate limits: max 5 OTPs/hour per mobile, 20/hour per IP.
  if (!rateLimit('otp:mobile:' + mobile, 5, 3600 * 1000)) return sendJson(res, 429, { error: 'rate_limited', message: 'Too many OTP requests for this number. Try again later.' });
  if (!rateLimit('otp:ip:' + clientIp(req), 20, 3600 * 1000)) return sendJson(res, 429, { error: 'rate_limited' });

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  db.prepare('UPDATE otps SET consumed = 1 WHERE mobile = ? AND purpose = ? AND consumed = 0').run(mobile, purpose);
  db.prepare('INSERT INTO otps(mobile, purpose, code_hash, expires_at, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(mobile, purpose, sha256(code), Date.now() + OTP_TTL_MS, nowIso());

  if (!process.env.SMS_PROVIDER) {
    // DEV MODE — clearly identified placeholder. No SMS is sent. The code is returned/logged
    // ONLY because no SMS provider is configured; never enable this behaviour in production.
    console.log(`[DEV OTP] mobile=${mobile} purpose=${purpose} code=${code}`);
    return sendJson(res, 200, { ok: true, devMode: true, devOtp: code, expiresInSec: OTP_TTL_MS / 1000 });
  }
  // TODO: integrate the configured SMS provider here (e.g. MSG91 / Twilio / AWS SNS).
  // Until a provider SDK is wired in, we deliberately do NOT claim an SMS was sent.
  return sendJson(res, 501, { error: 'sms_provider_not_integrated', message: 'SMS provider is configured in env but its sender is not integrated yet.' });
});

function checkOtp(mobile, purpose, otp) {
  const row = db.prepare('SELECT * FROM otps WHERE mobile = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC').get(mobile, purpose);
  if (!row) return { ok: false, error: 'otp_not_found' };
  if (row.expires_at < Date.now()) return { ok: false, error: 'otp_expired' };
  if (row.attempts >= 5) return { ok: false, error: 'otp_attempts_exceeded' };
  db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?').run(row.id);
  if (sha256(String(otp)) !== row.code_hash) return { ok: false, error: 'otp_invalid' };
  db.prepare('UPDATE otps SET consumed = 1 WHERE id = ?').run(row.id);
  return { ok: true };
}

route('POST', '/api/auth/verify-otp', async (req, res, body) => {
  const { mobile, otp } = body;
  if (!isValidMobile(mobile)) return sendJson(res, 400, { error: 'invalid_mobile' });
  const chk = checkOtp(mobile, 'login', otp);
  if (!chk.ok) return sendJson(res, 400, { error: chk.error });

  let user = db.prepare('SELECT * FROM users WHERE mobile = ?').get(mobile);
  let isNew = false;
  if (!user) {
    isNew = true;
    const referralCode = newReferralCode();
    const info = db.prepare('INSERT INTO users(user_code, name, mobile, referral_code, created_at) VALUES(?, ?, ?, ?, ?)')
      .run('PENDING', typeof body.name === 'string' ? body.name.slice(0, 80) : null, mobile, referralCode, nowIso());
    const id = Number(info.lastInsertRowid);
    db.prepare('UPDATE users SET user_code = ? WHERE id = ?').run('WEP-' + (100000 + id), id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    // Referral: recorded once, for genuinely new users only. The reward is credited ONLY when
    // the admin has enabled it (referralRewardCoins > 0) — default 0 = disabled.
    if (typeof body.referralCode === 'string' && body.referralCode.trim()) {
      const referrer = db.prepare('SELECT * FROM users WHERE referral_code = ? AND deleted = 0').get(body.referralCode.trim());
      if (referrer && referrer.id !== user.id) {
        db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referrer.id, user.id);
        const reward = Number(getSetting('referralRewardCoins')) || 0;
        let rewarded = 0;
        if (reward > 0 && !referrer.suspended) {
          creditCoins(referrer.id, reward, 'referral_reward', 'Referral reward for ' + user.user_code);
          notify(referrer.id, 'referral_reward', 'Referral reward credited', `You earned ${reward} coins for inviting ${user.user_code}.`);
          rewarded = 1;
        }
        db.prepare('INSERT INTO referrals(referrer_id, referred_id, rewarded, coins, created_at) VALUES(?, ?, ?, ?, ?)')
          .run(referrer.id, user.id, rewarded, rewarded ? reward : 0, nowIso());
      }
    }
    audit('user:' + user.user_code, 'user_registered', 'via OTP');
  }
  if (user.deleted) return sendJson(res, 403, { error: 'account_deleted' });
  if (user.suspended) { fraud(user.id, 'suspended_login_attempt', 'OTP login'); return sendJson(res, 403, { error: 'account_suspended' }); }
  return sendJson(res, 200, { token: issueUserToken(user), user: publicUser(user), isNew });
});

// ---------------------------------------------------------------- AUTH: password (optional secondary credential)
route('POST', '/api/auth/login-password', async (req, res, body) => {
  if (!isValidMobile(body.mobile) || typeof body.password !== 'string') return sendJson(res, 400, { error: 'invalid_input' });
  if (!rateLimit('pwlogin:ip:' + clientIp(req), 20, 3600 * 1000)) return sendJson(res, 429, { error: 'rate_limited' });
  const user = db.prepare('SELECT * FROM users WHERE mobile = ?').get(body.mobile);
  if (!user || user.deleted) return sendJson(res, 401, { error: 'invalid_credentials' });
  if (!user.password_hash) return sendJson(res, 400, { error: 'password_not_set', message: 'No password set for this account. Please log in with OTP.' });
  if (!verifyPassword(body.password, user.password_hash)) return sendJson(res, 401, { error: 'invalid_credentials' });
  if (user.suspended) return sendJson(res, 403, { error: 'account_suspended' });
  return sendJson(res, 200, { token: issueUserToken(user), user: publicUser(user) });
});

route('POST', '/api/auth/set-password', async (req, res, body) => {
  const user = requireUser(req, res); if (!user) return;
  if (typeof body.password !== 'string' || body.password.length < 6) return sendJson(res, 400, { error: 'weak_password', message: 'Password must be at least 6 characters.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), user.id);
  audit('user:' + user.user_code, 'password_set', null);
  return sendJson(res, 200, { ok: true });
});

// Alias used by the frontend profile screen: POST /api/me/password {currentPassword, newPassword}
route('POST', '/api/me/password', async (req, res, body) => {
  const user = requireUser(req, res); if (!user) return;
  if (typeof body.newPassword !== 'string' || body.newPassword.length < 6) return sendJson(res, 400, { error: 'weak_password', message: 'Password must be at least 6 characters.' });
  if (user.password_hash) {
    if (typeof body.currentPassword !== 'string' || !verifyPassword(body.currentPassword, user.password_hash)) return sendJson(res, 401, { error: 'invalid_credentials', message: 'Current password is incorrect.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.newPassword), user.id);
  audit('user:' + user.user_code, 'password_set', null);
  return sendJson(res, 200, { ok: true });
});

route('POST', '/api/auth/reset-password', async (req, res, body) => {
  if (!isValidMobile(body.mobile)) return sendJson(res, 400, { error: 'invalid_mobile' });
  if (typeof body.newPassword !== 'string' || body.newPassword.length < 6) return sendJson(res, 400, { error: 'weak_password' });
  const chk = checkOtp(body.mobile, 'reset', body.otp);
  if (!chk.ok) return sendJson(res, 400, { error: chk.error });
  const user = db.prepare('SELECT * FROM users WHERE mobile = ? AND deleted = 0').get(body.mobile);
  if (!user) return sendJson(res, 404, { error: 'account_not_found' });
  // Bump token_version so any previously issued tokens stop working after a reset.
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .run(hashPassword(body.newPassword), user.id);
  audit('user:' + user.user_code, 'password_reset', 'via OTP');
  return sendJson(res, 200, { ok: true });
});

// ---------------------------------------------------------------- AUTH: Google
route('POST', '/api/auth/google', async (req, res, body) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    // Never fake a Google login: without a configured client id we cannot verify the token.
    return sendJson(res, 501, { error: 'google_not_configured', message: 'Google sign-in is not configured on this server yet (GOOGLE_CLIENT_ID missing).' });
  }
  if (typeof body.credential !== 'string' || !body.credential) return sendJson(res, 400, { error: 'missing_credential' });
  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(body.credential));
    if (!r.ok) return sendJson(res, 401, { error: 'invalid_google_token' });
    info = await r.json();
  } catch { return sendJson(res, 502, { error: 'google_verify_failed' }); }
  if (info.aud !== process.env.GOOGLE_CLIENT_ID || !info.email || info.email_verified !== 'true') {
    return sendJson(res, 401, { error: 'invalid_google_token' });
  }
  // Find-or-create by google sub, else link by verified email, else create. Duplicates are
  // prevented by the UNIQUE indexes on email / google_sub / mobile.
  let user = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(info.sub)
    || db.prepare('SELECT * FROM users WHERE email = ?').get(info.email);
  if (user && !user.google_sub) {
    db.prepare('UPDATE users SET google_sub = ?, email = COALESCE(email, ?) WHERE id = ?').run(info.sub, info.email, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }
  if (!user) {
    const referralCode = newReferralCode();
    const ins = db.prepare('INSERT INTO users(user_code, name, email, google_sub, referral_code, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run('PENDING', info.name ? String(info.name).slice(0, 80) : null, info.email, info.sub, referralCode, nowIso());
    const id = Number(ins.lastInsertRowid);
    db.prepare('UPDATE users SET user_code = ? WHERE id = ?').run('WEP-' + (100000 + id), id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    audit('user:' + user.user_code, 'user_registered', 'via Google');
  }
  if (user.deleted) return sendJson(res, 403, { error: 'account_deleted' });
  if (user.suspended) return sendJson(res, 403, { error: 'account_suspended' });
  return sendJson(res, 200, { token: issueUserToken(user), user: publicUser(user) });
});

// Link a verified mobile to the signed-in (e.g. Google-created) account — one account per person.
route('POST', '/api/auth/link-mobile', async (req, res, body) => {
  const user = requireUser(req, res); if (!user) return;
  if (!isValidMobile(body.mobile)) return sendJson(res, 400, { error: 'invalid_mobile' });
  const chk = checkOtp(body.mobile, 'login', body.otp);
  if (!chk.ok) return sendJson(res, 400, { error: chk.error });
  const owner = db.prepare('SELECT id FROM users WHERE mobile = ?').get(body.mobile);
  if (owner && owner.id !== user.id) return sendJson(res, 409, { error: 'mobile_already_linked', message: 'This mobile number belongs to another account.' });
  db.prepare('UPDATE users SET mobile = ? WHERE id = ?').run(body.mobile, user.id);
  return sendJson(res, 200, { ok: true, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
});

route('POST', '/api/auth/logout', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  // Server-side invalidation: bump token_version so this (and every) issued token dies.
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(user.id);
  return sendJson(res, 200, { ok: true });
});

// ---------------------------------------------------------------- profile
route('GET', '/api/me', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const w = walletSummary(user.id);
  const earnedToday = db.prepare(`SELECT COALESCE(SUM(coins),0) AS s FROM coin_transactions
    WHERE user_id = ? AND coins > 0 AND status = 'approved' AND substr(created_at,1,10) = ?`).get(user.id, todayUtc()).s;
  return sendJson(res, 200, { user: publicUser(user), wallet: w, todayEarnings: earnedToday });
});

route('DELETE', '/api/me', async (req, res, body) => {
  const user = requireUser(req, res); if (!user) return;
  if (body.confirm !== true) return sendJson(res, 400, { error: 'confirmation_required', message: 'Send {confirm:true} to delete the account.' });
  // Policy: personal identifiers are anonymized/removed; financial ledger + withdrawal rows are
  // KEPT for audit/legal purposes but no longer linked to any personal data.
  db.prepare(`UPDATE users SET deleted = 1, name = 'Deleted User', mobile = ?, email = NULL,
    password_hash = NULL, google_sub = NULL, token_version = token_version + 1 WHERE id = ?`)
    .run('deleted-' + user.id, user.id);
  audit('user:' + user.user_code, 'account_deleted', null);
  return sendJson(res, 200, { ok: true });
});

// ---------------------------------------------------------------- wallet
route('GET', '/api/wallet', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const w = walletSummary(user.id);
  const transactions = db.prepare('SELECT txn_id, type, coins, status, note, created_at FROM coin_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 200')
    .all(user.id)
    .map((t) => ({ id: t.txn_id, txnId: t.txn_id, type: t.type, coins: t.coins, status: t.status, note: t.note, createdAt: t.created_at }));
  return sendJson(res, 200, { ...w, transactions });
});

// ---------------------------------------------------------------- WATCH ADS
// Provider architecture (modular):
//  - "sandbox" provider (built in): issues a test creative + HMAC session token; completion is
//    verified server-side (HMAC + real elapsed time + one-shot + daily limit). Revenue rows are
//    written with is_test=1 and NEVER counted as real revenue.
//  - Real networks: integrate ONLY after written approval for this cash-reward model. The network
//    calls POST /api/ads/ssv/:provider (below) with a signed callback; that is the single point
//    where real completions + real revenue enter the system.
function adsAvailability() {
  const s = getAllSettings();
  if (s.sandboxMode) return { available: true, provider: 'sandbox', message: 'Ads are available.' };
  if (s.adsEnabled) return { available: true, provider: 'network', message: 'Ads are available.' };
  return { available: false, provider: null, message: 'No ads available right now. Please check back later.' };
}
function watchedToday(userId) {
  return db.prepare('SELECT COUNT(*) AS c FROM ad_completions WHERE user_id = ? AND substr(created_at,1,10) = ?')
    .get(userId, todayUtc()).c;
}

route('GET', '/api/ads/status', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const s = getAllSettings();
  const a = adsAvailability();
  const watched = watchedToday(user.id);
  return sendJson(res, 200, {
    adsEnabled: !!s.adsEnabled, sandboxMode: !!s.sandboxMode, provider: a.provider,
    coinsPerAd: s.coinsPerAd, dailyLimit: s.dailyAdLimit,
    watchedToday: watched, remainingToday: Math.max(0, s.dailyAdLimit - watched),
    message: a.available ? (watched >= s.dailyAdLimit ? 'Daily ad limit reached. Come back tomorrow.' : a.message) : a.message,
  });
});

route('POST', '/api/ads/session', async (req, res) => {
  const user = requireActiveUser(req, res); if (!user) return;
  if (!rateLimit('adsession:user:' + user.id, 60, 3600 * 1000)) return sendJson(res, 429, { error: 'rate_limited' });
  const s = getAllSettings();
  const a = adsAvailability();
  if (!a.available) return sendJson(res, 403, { error: 'ads_unavailable', message: a.message });
  if (a.provider !== 'sandbox') {
    // Real-network sessions are started by the network's own SDK/flow, not by this endpoint;
    // completions arrive via the SSV callback. Nothing is faked here.
    return sendJson(res, 501, { error: 'provider_session_not_implemented', message: 'Network ads are served by the provider SDK; rewards arrive via server-side verification.' });
  }
  if (watchedToday(user.id) >= s.dailyAdLimit) return sendJson(res, 403, { error: 'daily_limit_reached', message: 'Daily ad limit reached. Come back tomorrow.' });

  const sessionId = crypto.randomUUID();
  const nonce = crypto.randomBytes(8).toString('hex');
  const durationSec = 15;
  // Session token binds session + user + nonce; verified again at completion time.
  const token = b64url(hmac(sessionId + ':' + user.id + ':' + nonce));
  db.prepare('INSERT INTO ad_sessions(id, user_id, provider, duration_sec, nonce, created_ms, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
    .run(sessionId, user.id, 'sandbox', durationSec, nonce, Date.now(), nowIso());
  return sendJson(res, 200, {
    sessionId, provider: 'sandbox',
    creative: { title: 'Sandbox Test Ad', durationSec, mediaUrl: '/ads/sample-ad.mp4' },
    token,
  });
});

route('POST', '/api/ads/complete', async (req, res, body) => {
  const user = requireActiveUser(req, res); if (!user) return;
  const fail = (status, error, fraudType) => {
    if (fraudType) fraud(user.id, fraudType, 'session=' + String(body.sessionId || ''));
    return sendJson(res, status, { error });
  };
  const session = db.prepare('SELECT * FROM ad_sessions WHERE id = ?').get(String(body.sessionId || ''));
  if (!session) return fail(404, 'session_not_found', 'ad_complete_unknown_session');
  if (session.user_id !== user.id) return fail(403, 'session_user_mismatch', 'ad_complete_user_mismatch');
  const expected = b64url(hmac(session.id + ':' + user.id + ':' + session.nonce));
  const given = Buffer.from(String(body.token || '')), exp = Buffer.from(expected);
  if (given.length !== exp.length || !crypto.timingSafeEqual(given, exp)) return fail(400, 'invalid_token', 'ad_complete_bad_token');
  if (session.rewarded) return fail(409, 'already_rewarded', 'ad_complete_duplicate'); // duplicate claim -> fraud log
  // Real elapsed time must cover ~the full creative; instant "completions" are rejected.
  const elapsedMs = Date.now() - session.created_ms;
  if (elapsedMs < session.duration_sec * 1000 * 0.95) return fail(400, 'ad_not_finished', 'ad_complete_too_fast');

  const s = getAllSettings();
  if (watchedToday(user.id) >= s.dailyAdLimit) return sendJson(res, 403, { error: 'daily_limit_reached' });

  const coins = Number(s.coinsPerAd);
  db.prepare('UPDATE ad_sessions SET rewarded = 1 WHERE id = ?').run(session.id);
  const comp = db.prepare('INSERT INTO ad_completions(user_id, session_id, provider, coins, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(user.id, session.id, session.provider, coins, nowIso());
  creditCoins(user.id, coins, 'ad_reward', 'Rewarded ad completed');
  // Sandbox revenue is test data only (is_test=1); real revenue enters exclusively via SSV.
  db.prepare('INSERT INTO ad_revenue(user_id, completion_id, provider, amount_paise, is_test, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(user.id, Number(comp.lastInsertRowid), session.provider, session.provider === 'sandbox' ? (Number(s.sandboxRevenuePaise) || 0) : 0, session.provider === 'sandbox' ? 1 : 0, nowIso());
  notify(user.id, 'ad_reward', 'Coins credited', `${coins} coins credited for watching an ad.`);
  return sendJson(res, 200, { credited: coins, availableCoins: walletSummary(user.id).availableCoins });
});

// ---------------------------------------------------------------- SSV callback for REAL ad providers
// INTEGRATION CONTRACT (for approved rewarded-ads networks):
//   POST /api/ads/ssv/<provider>?userId=<WEP-100001 or numeric id>&transId=<unique provider txn id>&revenuePaise=<int>&signature=<hex>
//   signature = HMAC-SHA256(key = env ADPROVIDER_<PROVIDER>_SECRET, data = transId + userId + revenuePaise)
//   - Idempotent on transId: a duplicate callback returns 200 and never double-credits.
//   - The provider's secret stays server-side (env only); it is never shipped in the app.
//   - Only enable a provider AFTER it has explicitly approved this cash-reward model in writing.
route('POST', '/api/ads/ssv/:provider', async (req, res, body, params, query) => {
  const provider = String(params.provider || '').toLowerCase();
  const p = { ...query, ...body };
  const secret = process.env['ADPROVIDER_' + provider.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_SECRET'];
  if (!secret) return sendJson(res, 501, { error: 'provider_not_configured' });
  const { userId, transId, revenuePaise, signature } = p;
  if (!userId || !transId || revenuePaise === undefined || !signature) return sendJson(res, 400, { error: 'missing_params' });
  const expectedSig = crypto.createHmac('sha256', secret).update(String(transId) + String(userId) + String(revenuePaise)).digest('hex');
  const a = Buffer.from(String(signature)), b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    fraud(null, 'ssv_bad_signature', provider + ' transId=' + transId);
    return sendJson(res, 401, { error: 'bad_signature' });
  }
  const user = db.prepare('SELECT * FROM users WHERE user_code = ? OR id = ?').get(String(userId), Number(userId) || -1);
  if (!user || user.deleted) return sendJson(res, 404, { error: 'user_not_found' });
  if (db.prepare('SELECT id FROM ad_completions WHERE trans_id = ?').get(String(transId))) {
    return sendJson(res, 200, { ok: true, duplicate: true }); // idempotent: no double credit
  }
  const coins = Number(getSetting('coinsPerAd'));
  try {
    const comp = db.prepare('INSERT INTO ad_completions(user_id, provider, trans_id, coins, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(user.id, provider, String(transId), coins, nowIso());
    db.prepare('INSERT INTO ad_revenue(user_id, completion_id, provider, trans_id, amount_paise, is_test, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)')
      .run(user.id, Number(comp.lastInsertRowid), provider, String(transId), Math.max(0, parseInt(revenuePaise, 10) || 0), nowIso());
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return sendJson(res, 200, { ok: true, duplicate: true });
    throw e;
  }
  if (!user.suspended) {
    creditCoins(user.id, coins, 'ad_reward', 'Rewarded ad (' + provider + ')');
    notify(user.id, 'ad_reward', 'Coins credited', `${coins} coins credited for watching an ad.`);
  }
  return sendJson(res, 200, { ok: true, credited: user.suspended ? 0 : coins });
});

// ---------------------------------------------------------------- WITHDRAWALS
route('POST', '/api/withdrawals', async (req, res, body) => {
  const user = requireActiveUser(req, res); if (!user) return;
  const s = getAllSettings();
  const coins = Number(body.coins);
  if (!Number.isInteger(coins) || coins <= 0) return sendJson(res, 400, { error: 'invalid_amount' });
  if (!isValidUpi(body.upiId)) return sendJson(res, 400, { error: 'invalid_upi', message: 'Enter a valid UPI ID (e.g. name@okhdfcbank).' });
  if (s.conversionCoinsPerRupee === null || s.conversionCoinsPerRupee === undefined) {
    return sendJson(res, 400, { error: 'conversion_not_configured', message: 'Conversion rate not configured by admin yet.' });
  }
  if (coins < s.minWithdrawalCoins) return sendJson(res, 400, { error: 'below_minimum', message: `Minimum withdrawal is ${s.minWithdrawalCoins} coins.` });
  const w = walletSummary(user.id);
  if (coins > w.availableCoins) return sendJson(res, 400, { error: 'insufficient_balance', message: 'You can only withdraw available (verified) coins.' });
  const amountPaise = Math.floor((coins * 100) / Number(s.conversionCoinsPerRupee));
  const ins = db.prepare('INSERT INTO withdrawals(user_id, coins, amount_paise, upi_id, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, coins, amountPaise, String(body.upiId).trim(), 'pending', nowIso(), nowIso());
  const wid = Number(ins.lastInsertRowid);
  // Hold: negative 'pending' ledger entry — coins leave "available" but are not yet redeemed.
  db.prepare('INSERT INTO coin_transactions(user_id, txn_id, type, coins, status, note, ref_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, newTxnId(), 'withdrawal', -coins, 'pending', 'Withdrawal request #' + wid, wid, nowIso());
  notify(user.id, 'withdrawal', 'Withdrawal requested', `Your withdrawal request of ${coins} coins was submitted and is pending review.`);
  audit('user:' + user.user_code, 'withdrawal_requested', 'id=' + wid + ' coins=' + coins);
  return sendJson(res, 200, { ok: true, withdrawalId: wid, status: 'pending', amountPaise });
});

route('GET', '/api/withdrawals', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const rows = db.prepare('SELECT id, coins, amount_paise, upi_id, status, txn_ref, reason, created_at, updated_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 100')
    .all(user.id)
    .map((r) => ({ id: r.id, coins: r.coins, amountPaise: r.amount_paise, upiId: r.upi_id, status: r.status, txnRef: r.txn_ref, reason: r.reason, createdAt: r.created_at, updatedAt: r.updated_at }));
  return sendJson(res, 200, { withdrawals: rows });
});

// ---------------------------------------------------------------- REFERRALS
route('GET', '/api/referrals', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const rows = db.prepare(`SELECT u.user_code, r.created_at, r.rewarded, r.coins FROM referrals r
    JOIN users u ON u.id = r.referred_id WHERE r.referrer_id = ? ORDER BY r.id DESC`).all(user.id);
  const earnedCoins = rows.reduce((sum, r) => sum + (r.rewarded ? r.coins : 0), 0);
  return sendJson(res, 200, {
    code: user.referral_code, link: '/?ref=' + user.referral_code,
    totalReferrals: rows.length, earnedCoins,
    referrals: rows.map((r) => ({ userId: r.user_code, joinedAt: r.created_at, rewarded: !!r.rewarded })),
  });
});

// ---------------------------------------------------------------- GAMES (scores; rewards OFF unless admin enables them)
const GAME_IDS = ['tic-tac-toe', 'memory-match', 'number-puzzle', 'snake', 'bubble-shooter', 'tap-challenge', 'color-match', 'quick-math', 'word-puzzle', 'block-puzzle'];
route('GET', '/api/games/scores', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const out = {};
  for (const r of db.prepare('SELECT game_id, best_score FROM game_scores WHERE user_id = ?').all(user.id)) out[r.game_id] = r.best_score;
  return sendJson(res, 200, { scores: out });
});
route('POST', '/api/games/score', async (req, res, body) => {
  const user = requireActiveUser(req, res); if (!user) return;
  const gameId = String(body.gameId || '');
  const score = Number(body.score);
  if (!GAME_IDS.includes(gameId)) return sendJson(res, 400, { error: 'unknown_game' });
  if (!Number.isFinite(score) || score < 0) return sendJson(res, 400, { error: 'invalid_score' });
  const prev = db.prepare('SELECT best_score FROM game_scores WHERE user_id = ? AND game_id = ?').get(user.id, gameId);
  const best = Math.max(prev ? prev.best_score : 0, Math.floor(score));
  db.prepare(`INSERT INTO game_scores(user_id, game_id, best_score, updated_at) VALUES(?, ?, ?, ?)
    ON CONFLICT(user_id, game_id) DO UPDATE SET best_score = excluded.best_score, updated_at = excluded.updated_at`)
    .run(user.id, gameId, best, nowIso());
  // Rewards: ONLY when the admin has enabled a funded, approved game-reward system, and always
  // capped per day. Default: disabled, 0 coins. No unlimited free-cash promises.
  let rewardCredited = 0;
  const s = getAllSettings();
  if (s.gameRewardsEnabled && Number(s.gameRewardCoins) > 0) {
    const earned = todayCoins(user.id, 'game_reward');
    const room = Math.max(0, Number(s.gameRewardDailyCap) - earned);
    rewardCredited = Math.min(Number(s.gameRewardCoins), room);
    if (rewardCredited > 0) creditCoins(user.id, rewardCredited, 'game_reward', 'Game reward: ' + gameId);
  }
  return sendJson(res, 200, { best, rewardCredited });
});

// ---------------------------------------------------------------- NOTIFICATIONS
route('GET', '/api/notifications', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const items = db.prepare('SELECT id, type, title, body, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(user.id)
    .map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, read: !!n.is_read, createdAt: n.created_at }));
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(user.id).c;
  return sendJson(res, 200, { notifications: items, unreadCount: unread });
});
route('POST', '/api/notifications/read-all', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(user.id);
  return sendJson(res, 200, { ok: true });
});

// ---------------------------------------------------------------- SUPPORT
route('POST', '/api/support/tickets', async (req, res, body) => {
  const user = requireUser(req, res); if (!user) return;
  const subject = String(body.subject || '').trim().slice(0, 150);
  const message = String(body.message || '').trim().slice(0, 4000);
  if (!subject || !message) return sendJson(res, 400, { error: 'missing_fields' });
  const ins = db.prepare('INSERT INTO support_tickets(user_id, subject, message, created_at) VALUES(?, ?, ?, ?)')
    .run(user.id, subject, message, nowIso());
  return sendJson(res, 200, { ok: true, ticketId: Number(ins.lastInsertRowid) });
});
route('GET', '/api/support/tickets', async (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const rows = db.prepare('SELECT id, subject, message, status, created_at FROM support_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(user.id);
  return sendJson(res, 200, { tickets: rows });
});

// ---------------------------------------------------------------- ADMIN
route('POST', '/api/admin/login', async (req, res, body) => {
  if (!rateLimit('adminlogin:ip:' + clientIp(req), 10, 3600 * 1000)) return sendJson(res, 429, { error: 'rate_limited' });
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(String(body.username || ''));
  if (!admin || !verifyPassword(String(body.password || ''), admin.password_hash)) {
    return sendJson(res, 401, { error: 'invalid_credentials' });
  }
  audit('admin:' + admin.username, 'admin_login', null);
  return sendJson(res, 200, { token: signToken({ sub: admin.id, role: 'admin' }), username: admin.username });
});

route('GET', '/api/admin/stats', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const c = (sql, ...a) => db.prepare(sql).get(...a).c;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  return sendJson(res, 200, {
    totalUsers: c('SELECT COUNT(*) AS c FROM users WHERE deleted = 0'),
    activeUsers: c('SELECT COUNT(*) AS c FROM users WHERE deleted = 0 AND last_login_at >= ?', since),
    verifiedMobile: c('SELECT COUNT(*) AS c FROM users WHERE deleted = 0 AND mobile IS NOT NULL'),
    googleAccounts: c('SELECT COUNT(*) AS c FROM users WHERE deleted = 0 AND google_sub IS NOT NULL'),
    verifiedAdViews: c('SELECT COUNT(*) AS c FROM ad_completions'),
    totalRevenuePaise: c('SELECT COALESCE(SUM(amount_paise),0) AS c FROM ad_revenue WHERE is_test = 0'),
    testRevenuePaise: c('SELECT COALESCE(SUM(amount_paise),0) AS c FROM ad_revenue WHERE is_test = 1'),
    totalCoinsDistributed: c(`SELECT COALESCE(SUM(coins),0) AS c FROM coin_transactions WHERE coins > 0 AND status = 'approved'`),
    pendingRewards: c(`SELECT COALESCE(SUM(-coins),0) AS c FROM coin_transactions WHERE coins < 0 AND status = 'pending'`),
    withdrawalCounts: {
      pending: c(`SELECT COUNT(*) AS c FROM withdrawals WHERE status = 'pending'`),
      approved: c(`SELECT COUNT(*) AS c FROM withdrawals WHERE status = 'approved'`),
      rejected: c(`SELECT COUNT(*) AS c FROM withdrawals WHERE status = 'rejected'`),
      paid: c(`SELECT COUNT(*) AS c FROM withdrawals WHERE status = 'paid'`),
    },
  });
});

route('GET', '/api/admin/users', async (req, res, body, params, query) => {
  if (!requireAdmin(req, res)) return;
  const q = String(query.q || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const like = '%' + q + '%';
  const rows = db.prepare(`SELECT * FROM users WHERE deleted = 0 AND (user_code LIKE ? OR name LIKE ? OR mobile LIKE ? OR email LIKE ? OR referral_code LIKE ?)
    ORDER BY id DESC LIMIT ? OFFSET ?`).all(like, like, like, like, like, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE deleted = 0 AND (user_code LIKE ? OR name LIKE ? OR mobile LIKE ? OR email LIKE ? OR referral_code LIKE ?)`).get(like, like, like, like, like).c;
  return sendJson(res, 200, {
    total, users: rows.map((u) => ({ ...publicUser(u), wallet: walletSummary(u.id) })),
  });
});

route('POST', '/api/admin/users/:id/suspend', async (req, res, body, params) => {
  const admin = requireAdmin(req, res); if (!admin) return;
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND deleted = 0').get(Number(params.id));
  if (!user) return sendJson(res, 404, { error: 'user_not_found' });
  const suspended = body.suspended === false ? 0 : 1;
  // Suspending also bumps token_version: the user's existing tokens stop working immediately.
  db.prepare('UPDATE users SET suspended = ?, token_version = token_version + 1 WHERE id = ?').run(suspended, user.id);
  audit('admin:' + admin.username, suspended ? 'user_suspended' : 'user_unsuspended', user.user_code);
  return sendJson(res, 200, { ok: true, userId: user.user_code, suspended: !!suspended });
});

route('GET', '/api/admin/settings', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  return sendJson(res, 200, { settings: getAllSettings() });
});
route('PUT', '/api/admin/settings', async (req, res, body) => {
  const admin = requireAdmin(req, res); if (!admin) return;
  const allowed = Object.keys(SETTING_DEFAULTS);
  const numKeys = ['coinsPerAd', 'minWithdrawalCoins', 'dailyAdLimit', 'adminSharePct', 'gameRewardCoins', 'gameRewardDailyCap', 'referralRewardCoins', 'sandboxRevenuePaise'];
  for (const [k, v] of Object.entries(body || {})) {
    if (!allowed.includes(k)) continue;
    if (k === 'conversionCoinsPerRupee') {
      if (v !== null && !(Number(v) > 0)) return sendJson(res, 400, { error: 'invalid_conversion_rate' });
      setSetting(k, v === null ? null : Number(v));
    } else if (numKeys.includes(k)) {
      if (!Number.isFinite(Number(v)) || Number(v) < 0) return sendJson(res, 400, { error: 'invalid_setting', key: k });
      setSetting(k, Number(v));
    } else if (k === 'announcement') {
      setSetting(k, String(v).slice(0, 500));
    } else { // booleans: gameRewardsEnabled, adsEnabled, sandboxMode
      setSetting(k, v === true);
    }
  }
  audit('admin:' + admin.username, 'settings_updated', Object.keys(body || {}).join(','));
  return sendJson(res, 200, { ok: true, settings: getAllSettings() });
});

// --- admin withdrawal workflow: pending -> approved -> paid (txnRef required) | pending/approved -> rejected (hold refunded)
function adminWithdrawalAction(req, res, params, action, body) {
  const admin = requireAdmin(req, res); if (!admin) return false;
  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(Number(params.id));
  if (!w) { sendJson(res, 404, { error: 'withdrawal_not_found' }); return false; }
  const setStatus = (status, extra = {}) => {
    db.prepare('UPDATE withdrawals SET status = ?, txn_ref = ?, reason = ?, updated_at = ? WHERE id = ?')
      .run(status, extra.txnRef !== undefined ? extra.txnRef : w.txn_ref, extra.reason !== undefined ? extra.reason : w.reason, nowIso(), w.id);
  };
  const hold = () => db.prepare(`SELECT * FROM coin_transactions WHERE type = 'withdrawal' AND ref_id = ?`).get(w.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(w.user_id);

  if (action === 'approve') {
    if (w.status !== 'pending') { sendJson(res, 409, { error: 'invalid_status', status: w.status }); return false; }
    setStatus('approved');
    if (user) notify(user.id, 'withdrawal', 'Withdrawal approved', `Your withdrawal of ${w.coins} coins was approved and is being processed.`);
  } else if (action === 'reject') {
    if (!['pending', 'approved'].includes(w.status)) { sendJson(res, 409, { error: 'invalid_status', status: w.status }); return false; }
    setStatus('rejected', { reason: String(body.reason || 'Rejected by admin').slice(0, 300) });
    const h = hold(); // refund the hold: coins return to available
    if (h && h.status === 'pending') db.prepare(`UPDATE coin_transactions SET status = 'rejected' WHERE id = ?`).run(h.id);
    if (user) notify(user.id, 'withdrawal', 'Withdrawal rejected', `Your withdrawal of ${w.coins} coins was rejected. The coins are back in your available balance.`);
  } else if (action === 'paid') {
    if (w.status !== 'approved') { sendJson(res, 409, { error: 'invalid_status', status: w.status, message: 'Approve the withdrawal before marking it paid.' }); return false; }
    if (!body.txnRef || typeof body.txnRef !== 'string') { sendJson(res, 400, { error: 'txn_ref_required', message: 'A payment transaction reference is required to mark paid.' }); return false; }
    setStatus('paid', { txnRef: body.txnRef.slice(0, 100) });
    const h = hold(); // finalize the hold: now a real redemption
    if (h && h.status === 'pending') db.prepare(`UPDATE coin_transactions SET status = 'approved' WHERE id = ?`).run(h.id);
    if (user) notify(user.id, 'withdrawal', 'Withdrawal paid', `Your withdrawal of ${w.coins} coins was paid. Reference: ${body.txnRef}.`);
  }
  audit('admin:' + admin.username, 'withdrawal_' + action, 'id=' + w.id + ' user=' + (user ? user.user_code : w.user_id));
  sendJson(res, 200, { ok: true, id: w.id, status: db.prepare('SELECT status FROM withdrawals WHERE id = ?').get(w.id).status });
  return true;
}
route('GET', '/api/admin/withdrawals', async (req, res, body, params, query) => {
  if (!requireAdmin(req, res)) return;
  const status = String(query.status || '');
  const rows = (status
    ? db.prepare('SELECT w.*, u.user_code FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.status = ? ORDER BY w.id DESC LIMIT 200').all(status)
    : db.prepare('SELECT w.*, u.user_code FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 200').all());
  return sendJson(res, 200, {
    withdrawals: rows.map((r) => ({
      id: r.id, userId: r.user_code, coins: r.coins, amountPaise: r.amount_paise, upiId: r.upi_id,
      status: r.status, txnRef: r.txn_ref, reason: r.reason, createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  });
});
route('POST', '/api/admin/withdrawals/:id/approve', async (req, res, body, params) => { adminWithdrawalAction(req, res, params, 'approve', body); });
route('POST', '/api/admin/withdrawals/:id/reject', async (req, res, body, params) => { adminWithdrawalAction(req, res, params, 'reject', body); });
route('POST', '/api/admin/withdrawals/:id/paid', async (req, res, body, params) => { adminWithdrawalAction(req, res, params, 'paid', body); });

// Revenue report — computed ONLY from ad_revenue rows. Nothing is ever invented here:
// if no verified revenue exists, the numbers are 0 (test/sandbox revenue is reported separately).
route('GET', '/api/admin/revenue', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const s = getAllSettings();
  const sum = (sql) => db.prepare(sql).get().v;
  const verifiedRevenuePaise = sum('SELECT COALESCE(SUM(amount_paise),0) AS v FROM ad_revenue WHERE is_test = 0');
  const testRevenuePaise = sum('SELECT COALESCE(SUM(amount_paise),0) AS v FROM ad_revenue WHERE is_test = 1');
  const adminSharePaise = Math.floor(verifiedRevenuePaise * (Number(s.adminSharePct) / 100));
  const paidRewardsPaise = sum(`SELECT COALESCE(SUM(amount_paise),0) AS v FROM withdrawals WHERE status = 'paid'`);
  const pendingRewardsPaise = sum(`SELECT COALESCE(SUM(amount_paise),0) AS v FROM withdrawals WHERE status IN ('pending','approved')`);
  // Outstanding user liability: every user's available+pending coins, converted at the CURRENT
  // admin-configured rate. If no rate is configured, liability is honestly reported as null.
  let userRewardLiabilityPaise = null;
  if (s.conversionCoinsPerRupee) {
    const outstanding = sum(`SELECT COALESCE(SUM(CASE WHEN status = 'approved' AND coins > 0 THEN coins ELSE 0 END),0)
      - COALESCE(SUM(CASE WHEN status = 'approved' AND coins < 0 THEN -coins ELSE 0 END),0) AS v FROM coin_transactions`);
    userRewardLiabilityPaise = Math.floor((outstanding * 100) / Number(s.conversionCoinsPerRupee));
  }
  return sendJson(res, 200, {
    verifiedRevenuePaise, testRevenuePaise, adminSharePaise,
    userSharePct: 100 - Number(s.adminSharePct), adminSharePct: Number(s.adminSharePct),
    userRewardLiabilityPaise, pendingRewardsPaise, paidRewardsPaise,
    netAvailablePaise: verifiedRevenuePaise - paidRewardsPaise - pendingRewardsPaise,
  });
});

route('GET', '/api/admin/fraud', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = db.prepare(`SELECT f.id, f.type, f.detail, f.created_at, u.user_code FROM fraud_logs f
    LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 100`).all();
  return sendJson(res, 200, { fraudLogs: rows.map((r) => ({ id: r.id, userId: r.user_code || null, type: r.type, detail: r.detail, createdAt: r.created_at })) });
});

route('GET', '/api/admin/export.csv', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = db.prepare(`SELECT ct.txn_id, u.user_code, u.mobile, ct.type, ct.coins, ct.status, ct.note, ct.created_at
    FROM coin_transactions ct JOIN users u ON u.id = ct.user_id ORDER BY ct.id DESC`).all();
  const esc = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
  const csv = ['txn_id,user_id,mobile,type,coins,status,note,created_at']
    .concat(rows.map((r) => [r.txn_id, r.user_code, r.mobile, r.type, r.coins, r.status, r.note, r.created_at].map(esc).join(',')))
    .join('\n');
  audit('admin:' + req.admin.username, 'export_csv', rows.length + ' rows');
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="coin-transactions.csv"' });
  res.end(csv);
});

route('POST', '/api/admin/announce', async (req, res, body) => {
  const admin = requireAdmin(req, res); if (!admin) return;
  const title = String(body.title || '').trim().slice(0, 120);
  const text = String(body.body || '').trim().slice(0, 1000);
  if (!title) return sendJson(res, 400, { error: 'title_required' });
  const users = db.prepare('SELECT id FROM users WHERE deleted = 0').all();
  const stmt = db.prepare('INSERT INTO notifications(user_id, type, title, body, created_at) VALUES(?, ?, ?, ?, ?)');
  for (const u of users) stmt.run(u.id, 'announcement', title, text || null, nowIso());
  if (body.alsoSetSetting) setSetting('announcement', title + (text ? ': ' + text : ''));
  audit('admin:' + admin.username, 'announcement', title);
  return sendJson(res, 200, { ok: true, sentTo: users.length });
});

route('GET', '/api/admin/support', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = db.prepare(`SELECT t.id, t.subject, t.message, t.status, t.created_at, u.user_code FROM support_tickets t
    JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 100`).all();
  return sendJson(res, 200, { tickets: rows });
});

// Public app config for the frontend (no secrets, no admin data).
route('GET', '/api/config', async (req, res) => {
  const s = getAllSettings();
  return sendJson(res, 200, {
    coinsPerAd: s.coinsPerAd, dailyAdLimit: s.dailyAdLimit, minWithdrawalCoins: s.minWithdrawalCoins,
    conversionCoinsPerRupee: s.conversionCoinsPerRupee, gameRewardsEnabled: !!s.gameRewardsEnabled,
    announcement: s.announcement || '', googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  });
});

// ---------------------------------------------------------------- static files (frontend lives in ../public)
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { sendJson(res, 403, { error: 'forbidden' }); return true; }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      if (rel === '/index.html') { sendJson(res, 404, { error: 'frontend_not_built', message: 'public/index.html not found yet.' }); return; }
      sendJson(res, 404, { error: 'not_found' }); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
  });
  return true;
}

// ---------------------------------------------------------------- server / router
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    // CORS: same-origin only — we simply never emit cross-origin allowances (except echoing a
    // same-host Origin, which is what the bundled frontend uses).
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host === req.headers.host) res.setHeader('Access-Control-Allow-Origin', origin); } catch { /* ignore */ }
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }); res.end(); return; }
    }
    if (!rateLimit('global:ip:' + clientIp(req), 600, 60 * 1000)) return sendJson(res, 429, { error: 'rate_limited' });

    if (pathname.startsWith('/api/')) {
      const query = Object.fromEntries(url.searchParams.entries());
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.regex.exec(pathname);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        const body = (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') ? await readBody(req) : {};
        await r.handler(req, res, body, params, query);
        return;
      }
      return sendJson(res, 404, { error: 'not_found', path: pathname });
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
    return sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[error]', e);
    if (!res.headersSent) sendJson(res, status, { error: e.message || 'server_error' });
  }
});

server.listen(PORT, () => {
  console.log(`WATCH & EARN PRO backend listening on http://localhost:${PORT}`);
  console.log(`DB: ${DB_PATH} | static: ${PUBLIC_DIR}`);
  if (!process.env.JWT_SECRET) console.log('WARNING: JWT_SECRET not set — using DEV secret. Set it in production!');
  if (!process.env.SMS_PROVIDER) console.log('OTP: DEV MODE (no SMS_PROVIDER set) — OTPs are returned in the response and logged.');
});
