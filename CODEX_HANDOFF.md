# Al Chark Pharmacy/Parapharmacy CRM — Codebase Handoff

Prepared as a technical summary for another coding agent (Codex) to pick up
context quickly. Repo: `leakaed8/alcharkcare`. Deployed on Render
(`alcharkcare.onrender.com`) from the `main` branch.

## What this is

A combined pharmacy staff CRM + patient-facing portal for a real pharmacy
("Al Chark") in Lebanon. Staff log patient visits, recommend products, run
lab/nutritional assessments, manage inventory/orders/promotions/events, and
message patients. Patients get a PWA-style portal to see their routine,
shop, RSVP to events, message their pharmacist, and manage refills.

Built iteratively over many phases, each shipped as its own PR into `main`,
reviewed live against the deployed app between phases.

## Stack

- **Backend**: `server/` — Node.js + Express, raw `pg` driver (no ORM),
  JWT auth. Entry point `server/index.js`.
- **Frontend**: `client/` — React + Vite, plain CSS (`client/src/index.css`),
  no component library.
- **Database**: PostgreSQL, sequential numbered migrations in
  `server/db/migrations/001_init.sql` … `014_events.sql`, run via
  `server/db/migrate.js`.
- **Deploy**: Render, auto-deploys `main`. Free tier — cold-starts after
  ~15 min idle (shows Render's own "waking up" screen, not an app bug).
- **Tests**: `server/test/*.test.js`, run via `node --test` (Node's built-in
  test runner). ~103 tests, all pure-logic unit tests (no DB needed).

## Architecture conventions (apply these when adding anything new)

- Every async route handler wrapped in `asyncHandler` (`server/lib/asyncHandler.js`).
- Auth via `middleware/auth.js`: `verifyToken`, `requireRole('staff','admin')` / `requireRole('patient')`.
- **Pure-engine + DB-runner split** for anything with real business logic,
  so it's unit-testable without a database:
  - `lib/labRuleEngine.js` — lab/nutrient interpretation (pure) + routes call it directly.
  - `lib/sheetsSyncEngine.js` (pure diff/hash logic) + `lib/sheetsSyncRunner.js` (DB orchestration).
  - `lib/pricingEngine.js` (pure: computeUnitPrice/computeCartLineTotal) + `lib/pricingLookup.js` (DB orchestration: `attachPricing()`).
  - Each pure engine has a matching `server/test/*.test.js`.
- **"Attach to every response" helper pattern**: e.g. `computeAvailability(product)` in `products.js`,
  `attachPricing(products, quantities?)` in `pricingLookup.js` — called from every route that returns
  product rows so the field is never missing/inconsistent across endpoints.
- **Shared notification services** — never re-implement push/Telegram fan-out inline:
  - `lib/pushNotify.js`: `isConfigured()`, `sendPush(subscription, payload)`, `pushToPatientById(patientId, payload)`
    (the last one also self-heals: clears a dead subscription on 410/404).
  - `lib/staffNotify.js`: `notifyStaff(text, {title,url})` — fans out to every staff push subscription + the shared Telegram chat.
  - `lib/telegramNotify.js`: in-app Telegram linking flow (deep-link + webhook), single shared pharmacy chat, not per-staff.
  - Push is web-push (VAPID keys); both staff (`staff.push_subscription`) and patients
    (`patients.push_subscription`) use the same generic `/api/orders/push/*` subscribe endpoints
    (role-branches internally).
- **Daily scheduled jobs** (no real cron/queue infra): `lib/scheduledNotifier.js` — each job function
  checks/writes a date into `app_settings.scheduler` (JSONB) and no-ops if already run today; driven by
  an hourly `setInterval` in `index.js`. Current jobs: `maybeNotifyDueFollowups`,
  `maybeSendDailyReminders` (product daily-reminder pushes + refill-check creation),
  `maybeSendEventReminders` (day-before event push).
- **Asia/Beirut "today" convention** — `lib/beirutDate.js` exports `todayInBeirut()` (Intl-based,
  `'YYYY-MM-DD'`). Always use this instead of server-local/UTC "today" for anything patient-facing
  or day-gated. (One known inconsistency: the pre-existing "running low / reorder" runout-date SQL
  uses Postgres `CURRENT_DATE` directly, i.e. server/UTC — kept as-is for consistency with itself,
  not fixed to Beirut time.)
- **Postgres type gotchas** (bit everyone once, watch for these):
  - `COUNT(*)` comes back from `pg` as a **string** (bigint) — must `Number()` it before arithmetic,
    or `+` silently does string concatenation.
  - `DATE` columns come back as JS `Date` objects — cast `::text` in the SQL if you need a plain
    `'YYYY-MM-DD'` string for comparison/serialization.
- Migrations are additive/idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`), never
  destructive; old tables (e.g. `checkins`, `checkin_questions`) are kept even after a feature that used
  them was redesigned, since they hold real historical data.

## Feature areas (chronological, each was its own PR)

1. **Core CRM** (`001_init.sql`+) — patients, visits, visit_products, followups, staff auth.
2. **Care plans, progress photos, product instructions** (`003_care_plans.sql`).
3. **Lab & Nutritional Assessment module** (`004`–`006`) — OCR/manual lab entry, a
   decision-support rule engine (`labRuleEngine.js`) that classifies values against versioned,
   sourced thresholds (never diagnoses/prescribes), pharmacist review workflow, DB-backed lab test
   type catalog.
4. **E-commerce catalog** (`007_ecommerce_catalog.sql`) — Excel product import, product images
   (originally Cloudinary, **now ImgBB** — see Known Issues), order-ahead cart/checkout
   (`cash_on_pickup` only, no online payment), staff order notifications, profile-based product
   suggestions.
5. **Patient portal redesign** (`008_patient_portal.sql`) — Home/My Visits/My Plan/Find
   Products/Profile IA, mobile-first bottom nav (`PatientLayout.jsx`).
6. **Patient care loop v1** (`009_patient_care_loop.sql`) — scheduled mood check-ins (later
   replaced, see #9), "Ask my pharmacist" messaging, reorder detection, follow-up dashboard buckets.
7. **Google Sheets sync** (`010_google_sheets_sync.sql`) — service-account read-only Sheets API,
   header-mapping + row-hash diffing (pure, unit-tested in `sheetsSyncEngine.js`), product
   approval workflow (`draft → review_required → approved → published`), conflict resolution UI.
8. **Lifestyle-advice picklist** (`011_lifestyle_options.sql`) — staff-managed dropdown options for
   the New Visit form, also sync-able from a Sheets tab.
9. **Replaced scheduled check-ins with staff-driven follow-ups + product-driven notifications**
   (`012_product_reminders_refills.sql`) — this was a significant redesign per explicit user
   feedback ("I shouldn't check in on them automatically"). Removed: the old scheduled
   check-in UI on both sides. Added: in-app Telegram linking (webhook + deep link, replacing a
   manual env-var chat ID), per-recommendation duration + refill-reminder toggle, per-product
   `reminder_frequency`/`daily_reminder_message`, a daily job creating refill prompts (Yes /
   Remind me in N days / No→reason), staff Refill Requests queue. The old `checkins` table was
   **kept** (real history) and is still written to by ad-hoc "Mark done"/"Report difficulty"
   actions — just no longer auto-scheduled.
10. **Promotions + batch expiration + unified pricing engine** (`013_promotions_expiration_pricing.sql`)
    — `batches` (expiration tracking, does NOT touch `stock_qty`), `expiration_discount_rules`
    (days-remaining tiers → discount %, staff-configurable, "no rule = no discount"), `promotions`
    (percentage/fixed/special_price/bogo, category/brand/product targeting, min-quantity gate,
    preview-then-confirm push notification flow). One pricing engine
    (`pricingEngine.js::computeUnitPrice` + `computeCartLineTotal`) computes a single non-stacked
    "best discount" price, wired into **every** product-returning endpoint and into a
    `/api/orders/cart-preview` endpoint so cart display can never drift from what checkout
    actually charges. 23 unit tests cover tiering, BOGO group math, min-quantity gating,
    never-stacking priority.
11. **Events** (`014_events.sql`) — staff-managed events (health workshops/screenings), patient
    RSVP with atomic capacity enforcement (row-locked check-then-insert, verified against a
    race with two concurrent patients), day-before reminder push, staff attendee list.
12. **Infra/bugfix pass** (no new migration):
    - **Cloudinary → ImgBB** for product image hosting — Cloudinary's sign-up isn't reachable from
      Lebanon (billing/KYC block), swapped for ImgBB (`lib/imgbbUpload.js`, plain API key, no
      billing step). Same `isConfigured()`/`uploadProductImage()` interface, one call site
      (`routes/products.js` `POST /:id/image`). **User still needs to set `IMGBB_API_KEY` on
      Render** — not yet confirmed done.
    - **Staff nav mobile redesign** — the old header wrapped 13+ nav links into a cramped 3-row
      block on narrow screens. Now collapses behind a hamburger toggle on mobile (icon-labeled
      dropdown, auto-closes on navigation); desktop nav unchanged.
    - **Status-change push notifications** — patients now get a push when an order is
      confirmed/fulfilled/cancelled, when a product request they made changes status, and when
      their pharmacist replies to a message. All via the shared `pushToPatientById()` helper.
    - **Manager "Test push notifications" panel** — lets an admin fire one real push (to self or
      a given patient id) to confirm the whole VAPID→service-worker→subscription→delivery chain,
      without waiting for a real event.
    - **Patient check-in history restored to staff PatientTimeline** — a read-only history view
      (`GET /api/checkins/:patientId`) of the ad-hoc "Mark done"/"Report difficulty" log.

## Known open items / not yet done

- **`IMGBB_API_KEY` env var**: user was walked through getting one; not yet confirmed set on
  Render. Until it is, product photo upload returns a clean 503 "not configured yet" rather than
  failing silently.
- **Render free-tier cold starts**: explained to the user as expected platform behavior (not a
  code bug) — service sleeps after ~15 min idle, ~30–60s to wake. Options given: upgrade to a
  paid instance, or an external uptime pinger against `/api/health`. No code change was made for
  this (there's nothing to fix in the app).
- **Deferred phase**: "Reporting & audit log" was offered as a next-phase option (alongside
  Events, which was picked) and never built.
- Credential-gated integrations that may or may not be configured on the live deploy: Google
  Sheets sync (`GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`), Telegram
  (`TELEGRAM_BOT_TOKEN`), Web Push (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`). Each integration
  degrades gracefully (features show "not configured yet" rather than crashing) when its env
  vars are absent.

## Env vars (server)

See `server/.env.example`: `DATABASE_URL`, `JWT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_STAFF_CHAT_ID` (legacy/unused now — see Telegram in-app linking
above), `IMGBB_API_KEY`, `PORT`. Google Sheets creds are set separately (not in `.env.example`,
added when that phase shipped): `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

## Where things live

```
server/
  index.js                 route mounting, daily-job interval, telegram webhook registration
  db/migrations/*.sql       001..014, sequential, additive-only
  db/migrate.js             runs pending migrations
  routes/*.js                one file per resource, thin, auth-checked per-route
  lib/*.js                   pure engines, DB-runners, shared notification/pricing/date helpers
  test/*.test.js             node:test unit tests for the pure engines

client/src/
  pages/staff/*.jsx          one page per staff feature (ManagerDashboard, EventManager, Promotions, ExpiringSoon, ProductManager, PatientTimeline, ...)
  pages/patient/*.jsx        one page per patient feature (Home, Events, ShopPage, Profile, ...)
  components/                shared UI (StaffLayout, patient/PatientLayout, PriceDisplay, AvailabilityBadge, Shop, LabScanner, ...)
  api/client.js               apiFetch()/apiUpload() — throws Error(data.error || `Request failed (${status})`) on non-2xx
  index.css                   all styling; conventions: `.p-*` for patient portal, `.app-header*` for staff header, `.badge-status-*` per status value
```

## Git workflow used throughout

Single long-lived feature branch `claude/hello-bqxqdv`, rebased onto `origin/main` after each
merge (`git checkout -B claude/hello-bqxqdv origin/main`), one PR per phase, merged after live
review. 16 PRs merged so far. `main` is currently at commit `c658410` (post-PR #16).
