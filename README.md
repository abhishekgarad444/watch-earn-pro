# WATCH & EARN PRO

**Watch Ads. Play Games. Collect Coins. Earn Rewards.**

A complete, professional rewards application for Indian users: users watch
approved rewarded advertisements, earn exactly **2 Coins per server-verified
ad**, play mini games, track their coin wallet, refer friends, and request
UPI withdrawals that an admin reviews and pays manually.

> **Honesty first:** this app never fakes revenue, balances or ads. Real-money
> features switch on only when the external services below are registered,
> approved and configured. Until then the app runs in clearly-labelled
> **test/sandbox mode** so every flow can be tried end-to-end.

---

## 1. Quick start (run it in 1 minute)

Requirements: **Node.js 22+** (uses built-in `node:sqlite`). No npm packages —
zero dependencies.

```bash
cd watch-earn-pro
node backend/server.js
# → open http://localhost:8080
```

Custom port / secrets:

```bash
PORT=8080 \
JWT_SECRET="change-this-to-a-long-random-string" \
ADMIN_USER=admin \
ADMIN_PASS="change-this-admin-password" \
node backend/server.js
```

* The database is created automatically at `data/app.db` on first run.
* Default admin (change immediately): **admin / admin123** → open
  `http://localhost:8080/#/admin`.
* **OTP test mode:** while no SMS provider is configured, the OTP is shown on
  the login screen in a clearly marked *DEV MODE* box (and logged on the
  server). This is for testing only — configure a real SMS provider before
  any public launch.
* **Watch Ads test mode:** sandbox mode is ON by default with a sample
  15-second test ad. The full verification pipeline is real (server-side
  timing + signed token + one-reward-per-ad); only the ad creative is a test
  sample. Turn sandbox OFF and ads ON in the Admin Panel only after a real,
  approved rewarded-ads provider is connected (see §5).

The app is an installable **PWA** (mobile-first): open it in Chrome on Android
→ "Add to Home screen" gives an app-like install. To ship a Play Store APK,
wrap this same build with Capacitor/TWA later — the web app is the product.

---

## 2. What is inside

```
watch-earn-pro/
├── backend/
│   ├── server.js     # complete API server (auth, wallet, ads SSV, admin…)
│   └── NOTES.md      # backend notes + SSV integration contract
├── public/           # the app (served by the backend)
│   ├── index.html    # app shell
│   ├── app.js        # all screens: login, dashboard, ads, wallet,
│   │                 # withdraw, refer, notifications, support,
│   │                 # policies, profile, admin panel
│   ├── games.js      # 10 fully playable mini games
│   ├── locales.js    # English / हिन्दी / मराठी translations
│   ├── styles.css    # dark-purple + gold theme, light & dark mode
│   ├── manifest.webmanifest, sw.js, icons
│   └── ads/sample-ad.mp4   # 15s sandbox test creative (labelled TEST MODE)
├── data/app.db       # SQLite database (auto-created)
└── README.md
```

**Features**

* **Login:** Indian mobile number + OTP; optional password login & OTP-based
  password recovery; Google sign-in (activates when a Client ID is set);
  mobile + Gmail link to one account; duplicate accounts prevented; unique
  User ID (`WEP-100001`…); logout; account deletion.
* **Dashboard:** total / available / pending coins, today's earnings,
  Watch Ads, Mini Games, Wallet, Refer & Earn, notifications.
* **Watch Ads & Earn:** 2 Coins per *completed and server-verified* ad; no
  coins for skipped/incomplete ads; no duplicate rewards; daily limit and
  coins-per-ad are admin-configurable; availability messages when no
  approved provider is live.
* **10 Mini Games:** Tic Tac Toe, Memory Matching, Number Puzzle, Snake,
  Bubble Shooter, Tap Challenge, Color Matching, Quick Math, Word Puzzle,
  Block Puzzle — playable, scores + best scores, sound on/off, restart.
  **Game rewards are OFF by default**; the admin may enable a small,
  daily-capped reward later.
* **Wallet:** total / available / pending / approved / redeemed coins and a
  full transaction ledger (every entry has a unique `TXN-…` ID). All balances
  are computed from the ledger on the server.
* **Withdrawals:** UPI ID, admin-configurable minimum, statuses
  Pending → Approved → Paid (with payment reference) / Rejected (coins
  refunded). **Payments are processed manually by the admin** — the app never
  claims automatic payouts. The **Coin→Rupee rate is NOT fixed in code**: the
  admin sets it in the panel (withdrawals stay locked until it is set).
* **Revenue sharing:** default Admin 75% / User pool 25%, adjustable.
  Reports are computed **only from recorded, verified ad revenue** (test
  revenue is reported separately and never mixed in).
* **Refer & Earn:** unique code + link, tracking, admin-configurable reward
  (default off), duplicate/fake referrals earn nothing.
* **Admin Panel:** user stats, verified ad views, revenue report, coin
  liability, withdrawal management, user suspend, fraud log, announcements,
  CSV export of the coin ledger, and every app setting.
* **Security:** OTP rate limits, hashed passwords (scrypt) and OTPs,
  HMAC-signed session tokens, server-side ad verification with signed
  callbacks, idempotent rewards, fraud logging, audit log, rate limiting.

---

## 3. Admin settings (Admin Panel → Settings)

| Setting | Default | Meaning |
|---|---|---|
| Coins per ad | 2 | Reward for one verified ad |
| Daily ad limit | 20 | Per user per day |
| Coin conversion | *not set* | Coins per ₹1 (e.g. 100 = ₹1 per 100 coins). Withdrawals locked until set |
| Minimum withdrawal | 1000 coins | |
| Admin share | 75% | User reward pool = the rest |
| Game rewards | OFF | Optional small reward + daily cap |
| Referral reward | 0 (off) | Coins per genuine referral |
| Ads enabled / Sandbox mode | OFF / ON | See §5 before changing |

---

## 4. Testing the main journeys

1. Register with any 10-digit mobile → enter the DEV OTP shown on screen.
2. Watch Ads → watch the full 15 s sample ad → **Claim** → wallet shows +2
   Coins. Try claiming early or twice: both are rejected by the server.
3. Admin (`/#/admin`, admin/admin123) → Settings → set conversion
   (e.g. 100 coins = ₹1) and minimum withdrawal (e.g. 2 coins) for testing.
4. As the user, request a withdrawal with a UPI ID → Admin → Withdrawals →
   Approve → Mark Paid (enter a reference) → user sees **Paid** + reference.
5. Play any game → score is saved; best score syncs to the server.
6. Change language (EN/हिन्दी/मराठी) and theme (dark/light) from the top bar.

---

## 5. External services YOU must arrange before real money

These cannot be created by any developer or AI — they need your own
registration, identity/KYC and approval:

| Service | Why | Examples / notes |
|---|---|---|
| **SMS provider** | Real OTP SMS | MSG91, Twilio, Fast2SMS… pay-per-SMS. Set `SMS_PROVIDER` + its keys in the backend env and wire the send call (marked TODO in `backend/server.js`). |
| **Google OAuth Client ID** | "Continue with Google" | Free at Google Cloud Console. Set env `GOOGLE_CLIENT_ID` — the button activates automatically. |
| **Rewarded-ads network with written approval for cash-redeemable rewards** | The actual income | You must get the network's written permission for this exact reward model and follow its country/incentive rules. **Never** put ordinary non-incentivized ads behind cash rewards — accounts get banned. Connect it through the server-side verification (SSV) endpoint below. |
| **UPI payout method** | Paying users | Manual UPI payments by the admin to start. Automatic payouts need a payment-gateway account (Razorpay/PayU etc.) with KYC — not integrated, and the app does not claim it. |
| **Hosting** | Public access | Any VPS/shared Node hosting or a service like Render/Railway; put HTTPS in front (required for PWA install + security). |

### Connecting a real ads provider (SSV contract)

Point the provider's server-side-verification callback at:

```
POST /api/ads/ssv/<provider>
{ "userId": "<WEP id or numeric id>", "transId": "<provider txn id>",
  "revenuePaise": 123, "signature": "<HMAC-SHA256 hex>" }
```

`signature = HMAC_SHA256(secret, transId + userId + revenuePaise)` where
`secret` is set in env `ADPROVIDER_<PROVIDER>_SECRET`. Callbacks are
idempotent on `transId` (duplicates never double-credit), revenue is recorded
as verified (non-test), and the user is credited the configured coins-per-ad.
Full details: `backend/NOTES.md`.

---

## 6. Deployment checklist

1. Set strong `JWT_SECRET` and `ADMIN_PASS`; remove test users if any.
2. Serve over **HTTPS** (PWA + login security require it).
3. Back up `data/app.db` regularly — it holds the full money ledger.
4. Configure SMS provider + Google Client ID (above).
5. Keep sandbox mode ON until the ads provider's written approval arrives;
   then configure its SSV secret, set `adsEnabled`, and turn sandbox OFF.
6. Set the Coin→Rupee conversion and minimum withdrawal **only** against
   real, received ad revenue — never promise rates you cannot fund.
7. Publish the policy pages' contact details (support email) with your own.

## 7. Policies included in-app

Terms & Conditions, Privacy Policy, Reward Policy, Withdrawal Policy and an
Advertising Disclosure are built into the app (Support → Policies) and match
the app's real rules: no guaranteed income, rewards only for verified ads,
manual admin-approved withdrawals, and game rewards off unless announced.
