# Al Chark Patient CRM

A role-based patient CRM for Al Chark: staff log visits and follow-ups,
patients get a portal for their own care history and notifications.

This repo covers **steps 1-4 of the build order** from the original spec:
schema, auth (staff username/password + patient phone/PIN), staff patient
search/visit entry/timeline, and the follow-up dashboard. Web push,
node-cron scheduling, Telegram alerts, progress photos, and the shop are not
built yet.

Also included: lab-result scanning (patients or staff can photograph a lab
report; free/offline OCR extracts known markers and flags whether a product
on file looks like it's helping -- informational only, not medical advice),
product/invoice scanning (only the product name is ever saved, never the
photo -- patients can log a product they have, staff can scan a
parapharmacy sales invoice for a patient), and a manager-only dashboard
(hidden from regular staff) with business KPIs and marketing segments
(inactive patients, frequent buyers).

## Stack

- Client: React + Vite, role-based routing (`/staff/*`, `/patient/*`)
- Server: Node/Express, JWT auth, role middleware
- Database: PostgreSQL
- OCR: tesseract.js (free, runs offline -- no image is ever stored, only
  the extracted text/names)

## Storage

Only text is ever stored -- lab-scan values, product names, notes -- never
photos. That keeps rows in the low single-digit KB range even for a heavy
user, so a free 1GB Render Postgres plan comfortably holds many thousands
of patients' full history. Render's $7/mo Starter Postgres plan (10GB) is
the upgrade path if you ever need more.

## Local development

1. Create a Postgres database and put its connection string in
   `server/.env` (copy `server/.env.example` — at this stage you only need
   `DATABASE_URL`, `JWT_SECRET`, and `PORT`).
2. Install dependencies:
   ```bash
   npm run install:all
   ```
3. Run the schema migration, then seed a test staff/patient/products:
   ```bash
   npm run migrate
   npm run seed
   ```
   This creates staff login `staff` / `staff123` and patient login
   `+96170123456` / `1234`.
4. Start both dev servers:
   ```bash
   npm run dev:server   # http://localhost:3000
   npm run dev:client   # http://localhost:5173 (proxies /api to :3000)
   ```

## Production

```bash
npm run build   # builds client/dist, installs server deps
npm start       # serves the built frontend + API on one port (PORT env var)
```

## Deploy to Render

This repo includes a `render.yaml` Blueprint that provisions a free Postgres
database and a web service in one step:

1. Push this repo to GitHub (already done if you're reading this on a branch).
2. In the Render dashboard, click **New > Blueprint** and select this repo.
   Render will read `render.yaml` and create:
   - `alcharkcare-db` — a free Postgres database
   - `alcharkcare` — a web service that runs `npm run build` then `npm start`,
     with `DATABASE_URL` wired to the database and a generated `JWT_SECRET`
   The service's `preDeployCommand` runs `npm run migrate` automatically on
   every deploy, so the schema is always up to date.
3. Once the first deploy finishes, seed a test staff/patient login by
   opening a shell for the `alcharkcare` service (Render dashboard > Shell)
   and running:
   ```bash
   npm run seed
   ```
4. Your app will be live at the `.onrender.com` URL shown on the service page.

If you'd rather set things up manually instead of using the Blueprint, create
a Postgres database and a Node web service pointing at this repo with build
command `npm run build`, start command `npm start`, and set `DATABASE_URL` /
`JWT_SECRET` env vars yourself.

## OCR notes

Lab-result and product/invoice scanning use tesseract.js, a free/offline
OCR engine (no API key, no per-scan cost) -- the tradeoff is lower accuracy
than a paid vision API, especially on blurry photos, handwriting, or
unusual fonts. Both scan flows always show what was extracted before
saving anything, so a bad read is easy to catch/correct rather than silently
wrong. On Render's free web service plan (256MB RAM), OCR is noticeably
slower and a very large photo may fail -- the Starter plan's extra RAM
would speed this up if it becomes a bottleneck.
