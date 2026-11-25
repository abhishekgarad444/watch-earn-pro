# WATCH & EARN PRO — Backend Notes

## How to run

```bash
node backend/server.js          # from the project root (~/workspace/watch-earn-pro)
# PORT env optional, default 8080. Zero npm dependencies — Node 24 built-ins only.
```

- API base: `/api` (JSON, `Authorization: Bearer <token>`)
- Static frontend is served from `../public/` (`index.html` at `/`)
- Database: SQLite at `../data/app.db` (auto-created, WAL mode). All tables/indexes are
  created on first boot; there is no migration step.
- The delivered `data/app.db` is a clean database containing only the seeded admin.

## Seeded admin

- Username / password come from env `ADMIN_USER` / `ADMIN_PASS`.
- Defaults (development only): `admin` / `admin123` — **change before any real deployment.**
- Admin login: `POST /api/admin/login` → returns a distinct admin-role token.
- Admin tokens and user tokens are not interchangeable.

## Environment variables

| Var | Purpose |
|---|---|
| `PORT` | HTTP port (default 8080) |
| `JWT_SECRET` | HMAC key for bearer tokens. **Must be set to a long random value in production** (a loud warning is printed when missing). |
| `ADMIN_USER` / `ADMIN_PASS` | Seeded admin credentials (defaults `admin` / `admin123`) |
| `SMS_PROVIDER` | If unset → OTP **DEV MODE**: the OTP is returned in the API response as `devOtp` and logged to the console. This is a clearly-marked development placeholder, not a real SMS. If set, the request currently returns 501 until the provider sender is wired into `POST /api/auth/request-otp` (TODO marked in code). |
| `GOOGLE_CLIENT_ID` | Enables `POST /api/auth/google` (ID token verified against Google's `tokeninfo` endpoint). If unset, that endpoint returns an honest `501 google_not_configured` — Google login is never faked. |
| `ADPROVIDER_<NAME>_SECRET` | Per-provider HMAC secret for the SSV callback, e.g. `ADPROVIDER_ADMOB_SECRET`. Server-side only; never shipped in the app. |

## Key design decisions

- **Ledger-based wallet.** Balances are derived from `coin_transactions`, never stored as a
  mutable number. Credits are `approved`; a withdrawal creates a negative `pending` entry
  (a hold → raises `pendingCoins`, lowers `availableCoins`). Admin *paid* flips the hold to
  `approved` (coins become `redeemedCoins`); admin *reject* flips it to `rejected`
  (hold refunded to available). Only `availableCoins` can be withdrawn.
- **Coin value is NOT fixed in code.** Withdrawals are blocked with
  `400 conversion_not_configured` until the admin sets `conversionCoinsPerRupee`
  (Admin → Settings). `minWithdrawalCoins` default 1000.
- **Revenue is never invented.** `ad_revenue` rows are written only by (a) sandbox
  completions with `is_test=1` and the admin-configured `sandboxRevenuePaise` (default 0),
  or (b) verified SSV callbacks with `is_test=0`. `/api/admin/revenue` reports test and
  verified revenue separately; the admin/user split (default 75/25, adjustable) is computed
  from verified revenue only.
- **Ads are OFF by default** (`adsEnabled=false`). Sandbox mode (default on) allows the full
  flow to be tested with a test creative; with sandbox off and ads off, the API reports
  "No ads available right now."
- **Game rewards are OFF by default** (`gameRewardsEnabled=false`, `gameRewardCoins=0`) and,
  when enabled, are capped daily (`gameRewardDailyCap`, default 10 coins).
- **Referral rewards default to 0 (disabled)**; referrals are still recorded exactly once
  per new user.
- **Auth:** OTP (hashed at rest, 5-min expiry, max 5 attempts, rate-limited 5/hr per mobile
  and 20/hr per IP) is the primary login. Password is an optional secondary credential
  (scrypt-hashed), set via `POST /api/auth/set-password`, recovered via OTP with
  `purpose:"reset"`. Logout and password reset bump `token_version`, invalidating all
  previously issued tokens server-side. Suspended users cannot log in or earn, and their
  tokens are invalidated at suspension time.
- **Account deletion** (`DELETE /api/me {confirm:true}`) anonymizes personal fields and
  invalidates tokens; financial ledger/withdrawal rows are retained for audit, per policy.
- **Audit & fraud:** admin actions and sensitive events go to `audit_logs`; duplicate ad
  claims, too-fast completions, bad SSV signatures and suspended-login attempts go to
  `fraud_logs` (visible at `GET /api/admin/fraud`).

## SSV integration contract (for REAL rewarded-ads providers)

Only integrate a network **after it has explicitly approved this cash-reward model in
writing** (spec §15). The network's server calls:

```
POST /api/ads/ssv/<provider>?userId=<WEP-100001 or numeric id>&transId=<unique provider txn id>&revenuePaise=<integer paise>&signature=<hex>
signature = HMAC-SHA256(key = env ADPROVIDER_<PROVIDER>_SECRET,
                        data = transId + userId + revenuePaise)
```

- Idempotent on `transId`: duplicate callbacks return `200 {duplicate:true}` and never
  double-credit.
- On a valid callback: the user is credited `coinsPerAd` coins (admin-configurable) and a
  verified (`is_test=0`) `ad_revenue` row is written with the reported `revenuePaise`.
- Bad signature → `401` + fraud log. Unknown provider (no env secret) → `501`.

The built-in **sandbox provider** mirrors the same guarantees internally: `POST
/api/ads/session` issues an HMAC session token; `POST /api/ads/complete` verifies the HMAC,
the owning user, **real elapsed time ≥ 95% of the creative duration**, one-shot reward, and
the daily limit before crediting exactly `coinsPerAd` coins.

## External services needed for production

1. **SMS provider** (e.g. MSG91 / Twilio / AWS SNS) — for real OTP delivery. Costs apply
   per SMS; wire the sender into `request-otp` where the TODO is marked.
2. **Google OAuth client ID** — free; create in Google Cloud Console, set `GOOGLE_CLIENT_ID`.
3. **An approved rewarded-ads network** — must explicitly permit cash-redeemable rewards
   for this model; configure its SSV secret via env. No ad revenue exists until this is live.
4. **UPI payouts are MANUAL by design** — the admin approves each withdrawal and marks it
   paid with the UPI transaction reference. No automatic payout is claimed or implemented;
   automating it would require an authorized payment gateway (e.g. RazorpayX / Cashfree
   Payouts) with its own onboarding/KYC and fees.

## Smoke test (verified 2026-11-25)

Full flow exercised against a fresh DB (54 checks, all passing): dev OTP → verify →
`/api/me` → ad session → too-fast completion rejected (400) → waited the real 15 s →
completion credited exactly 2 coins → duplicate completion 409 + fraud log → SSV credit +
idempotent duplicate + bad-signature 401 → withdrawal blocked until conversion rate set →
admin login → set conversion (100 coins/₹) + min withdrawal → withdrawal hold
(available 0 / pending 4) → approve → paid-requires-txnRef → paid (redeemed 4) →
reject-refund path on a second withdrawal → referral recorded with 0 reward (default) →
admin stats/revenue (verified ₹1.50 from SSV only, 75% admin share = 112 paise) →
game score saved with 0 reward (disabled default) → notifications/support/referrals →
set-password → logout invalidates token → password login → admin suspend invalidates
tokens → CSV export → clean-boot check with seeded admin.
