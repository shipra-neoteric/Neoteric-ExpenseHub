# Neoteric ExpenseHub — Site Expenses (L1)

Replaces manually maintained office-expense sheets (Silver Estate, Regal
Garden, Nature Park, Garden City, and future sites) with a controlled fund
ledger, approval workflow, receipts, and reporting.

## Stack

- **Client:** React 18 + Vite + Tailwind CSS, `react-router-dom`, `axios`,
  `sweetalert2`, `lucide-react` icons.
- **Server:** Node.js + Express 4, MongoDB via Mongoose 8, JWT auth
  (access + rotating refresh tokens), `zod` request validation, `multer` for
  receipt uploads, `pdfkit` for PDF reports.
- **Money:** every amount is stored as an integer number of paise — never a
  float — and computed server-side from an append-only ledger.

## Prerequisites

- Node.js 20+
- **MongoDB running as a replica set** (even a single-node one). Mongoose
  transactions — used for every approval, void, adjustment, and fund-period
  close — require it; a plain standalone `mongod` will reject them.
  - Easiest local option: `docker run -d -p 27017:27017 --name expensehub-mongo mongo:7 --replSet rs0`, then `docker exec -it expensehub-mongo mongosh --eval "rs.initiate()"`.
  - Or install MongoDB Community Server and start it with `--replSet rs0`, then run `rs.initiate()` once in `mongosh`.
  - Automated tests do **not** need this — they spin up their own in-memory
    replica set via `mongodb-memory-server`.

## Setup

```bash
# Server
cd server
cp .env.example .env      # edit MONGO_URI / JWT secrets for your environment
npm install
npm run seed               # creates the org, sites, categories, users, and
                            # reconstructs the Silver Estate fund/expenses
npm run dev                 # http://localhost:4000

# Client (separate terminal)
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

Log in with any seeded account (see ASSUMPTIONS.md) — password `ChangeMe123!`
for all of them. **Rotate these before any real deployment.**

## Environment variables (`server/.env`)

| Variable | Purpose | Default |
|---|---|---|
| `MONGO_URI` | MongoDB connection string (replica set) | `mongodb://127.0.0.1:27017/expensehub` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing secrets — **must** be changed from the placeholder before any shared/deployed use | placeholder |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes | `15m` / `7d` |
| `APP_TIMEZONE` | Business timezone for "today"/date defaults and report timestamps | `Asia/Kolkata` |
| `CLIENT_ORIGIN` | CORS-allowed origin | `http://localhost:5173` |
| `UPLOAD_DIR` | Local disk folder for receipt files | `uploads` |
| `MAX_UPLOAD_MB` | Receipt upload size cap | `8` |
| `LOW_BALANCE_THRESHOLD_PAISE` | Reserved for the low-balance notification (see L2 backlog) | `200000` |

## Commands

```bash
# Server
npm run seed     # idempotent — safe to re-run
npm run dev       # nodemon
npm test          # Jest, in-memory Mongo replica set, no external DB needed
npm run lint

# Client
npm run dev
npm run build
npm run lint
```

## Architecture

```
server/src/
  config/       env, db connection, permission/status/enum constants, upload (multer) config
  models/       Mongoose schemas — see "Domain model" below
  middleware/   auth (JWT), site-scope authorization, request validation, error handling
  services/     business logic — expenseService, fundService, importService,
                reportService, numberingService, auditService (all transactional
                where money/state changes)
  controllers/  thin HTTP handlers calling services
  routes/       one file per resource, mounted under /api
  seed/         idempotent seed script
client/src/
  theme/        ThemeContext (light/dark, brand color via CSS variables)
  context/      AuthContext (login/refresh/logout, permission checks)
  api/          axios instance with automatic access-token refresh
  components/   layout (Sidebar/Header/Shell), common (StatsCards, ThemedSelect,
                ThemedDatePicker, IMSPagination, StatusPill), drawers, table
  pages/        Dashboard, Funds, Reports, Master/*, UserManagement, Login
```

### Domain model

`Organization → Site → SiteUserAssignment (user↔site, many-to-many, time-boxed)`
`ExpenseCategory`, `ExpensePolicy` (org default + optional per-site override)
`FundAccount → FundPeriod → FundLedgerEntry` (append-only ledger; balance is
always *derived*, never stored)
`Expense → ExpenseAttachment`, `ExpenseApprovalAction` (per-expense timeline)
`AuditEvent` (global append-only audit trail), `Counter` (atomic expense
numbering), `ImportRecord` (idempotent legacy-sheet import tracking).

Expense state machine: `DRAFT → PENDING_APPROVAL → APPROVED`;
`PENDING_APPROVAL → RETURNED → PENDING_APPROVAL`; `PENDING_APPROVAL → REJECTED`;
`APPROVED → VOIDED` (posts an `EXPENSE_REVERSAL` ledger entry; the original
expense is never deleted).

Fund period: `OPEN → CLOSED → REOPENED`. New expenses cannot be submitted once
a period is closed; approving/posting still respects whichever period the
expense already belongs to.

## Role / permission matrix

Permissions are explicit strings on each user (`site_expense.*`); role labels
below are just seed presets, never checked directly by the server.

| Permission | Front Desk Exec. | AGM / Site Approver | Finance | Master Admin |
|---|:---:|:---:|:---:|:---:|
| `view` | ✓ | ✓ | ✓ | ✓ |
| `create` | ✓ | | | ✓ |
| `edit_own_draft` | ✓ | | | ✓ |
| `submit` | ✓ | | | ✓ |
| `approve` | | ✓ | | ✓ |
| `reject_return` | | ✓ | | ✓ |
| `void` | | | | ✓ |
| `fund_view` | | | ✓ | ✓ |
| `fund_manage` | | | ✓ | ✓ |
| `report_export` | | ✓ | ✓ | ✓ |
| `master_manage` | | | | ✓ |
| `user_scope_manage` | | | | ✓ |
| `view_all_sites` | | | ✓ (seeded) | ✓ |

`AGM` and `SITE_APPROVER` are two role-preset labels mapped to the identical
permission bundle — AGM is the current name going forward; SITE_APPROVER
still works for anyone already assigned it. See ASSUMPTIONS.md for why
rejecting an expense as AGM still deducts the fund (and how to reverse one).

Every request re-checks **both** the permission and that the caller is
actively assigned to the site in question (or holds `view_all_sites`) —
enforced server-side in `middleware/siteScope.js`, never trusted from the
client.

## API summary

All routes are under `/api`, JWT bearer auth (`Authorization: Bearer <token>`)
plus an httpOnly refresh cookie.

- `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`
- `GET /sites/mine`, `GET /sites` (master), `POST /sites`, `PATCH /sites/:id`
- `GET/POST /categories`, `PATCH /categories/:id`
- `GET/PUT /policies` (`?siteId=` or org default)
- `GET /funds/periods`, `.../balance`, `.../ledger`; `POST /funds/opening-allocation`,
  `.../top-up`, `.../adjustment`, `.../close`, `.../reopen`, `.../rollover`
  (manual trigger for the monthly rollover, JWT + `master_manage`)
- `GET /expenses`, `GET/PATCH/DELETE /expenses/:id`, `POST /expenses`,
  `.../submit`, `.../approve`, `.../return`, `.../reject`, `.../void`
- `POST/GET/DELETE /expenses/:expenseId/attachments[/:attachmentId]`
- `GET /dashboard/summary?siteId=&periodId=`
- `GET/POST /assignments`, `POST /assignments/:id/deactivate`
- `GET/POST /users`, `PATCH /users/:id`, `DELETE /users/:id` (soft-deactivate)
- `GET /reports/summary`, `/reports/export.csv`, `/reports/export.pdf`
- `POST /imports/dry-run`, `POST /imports/commit` (legacy sheet import, CSV)
- `POST /admin/monthly-rollover` — machine-only (static `X-Automation-Secret`
  header, not a user JWT); see DEPLOYMENT.md for the scheduler setup
- `POST /slack/interactions` — Slack's own servers only (signature-verified,
  not a user JWT); see SLACK_SETUP.md
- `GET /public/attachments/:attachmentId?token=...` — no auth; a short-lived
  signed link scoped to one attachment, used only so Slack can render a
  receipt preview

Errors are always `{ error: { code, message, details? } }` with a human-
actionable `message` (e.g. `Fund period is closed`, `Insufficient available
balance for this expense`).

## Implemented workflows

- Dashboard KPIs (Funded / Approved / Pending / Available + projected /
  Missing Receipts), filterable, paginated expense list.
- Add/Edit expense drawer: save-as-draft, submit, receipt upload, duplicate
  warning with override reason, balance-before/projected-after display.
- Details/approval drawer: state- and permission-aware actions (approve,
  return, reject, void, delete draft, edit-and-resubmit), full activity
  timeline, SweetAlert2 confirmations everywhere (no native `alert`/`confirm`).
  Rejecting deducts the fund (money was already spent); Void/Reverse works on
  either an approved or a rejected-and-deducted expense.
- A receipt is mandatory to submit any expense — no category/amount
  exceptions.
- Funds/Imprest: opening allocation, top-up, signed adjustment, period close
  (blocked while pending/returned items exist) with optional carry-forward,
  Master-only reopen, and an automatic **monthly rollover** (carries the
  balance forward, adds each site's configured fixed monthly amount) —
  manual button for Master, or a scheduled external trigger (DEPLOYMENT.md).
- Master: sites, categories (receipt rule, active/inactive — never hard
  deleted), fund policy (org default + per-site override, approvers), legacy
  sheet import (dry-run + commit, idempotent, review queue for bad rows).
- User Management: create/edit/soft-delete users, role-preset permissions
  (including the AGM approver role), many-to-many site assignments with
  deactivation (history preserved).
- Optional Slack integration: AGM approvers get a DM with full expense
  details, receipt preview, and Approve/Reject buttons on submission — see
  SLACK_SETUP.md. Off by default; nothing else depends on it being configured.
- Reports: filtered summary, category-wise spend, CSV export, corporate-navy
  PDF export (`Rs.` prefix, generation timestamp/timezone/filters).
- Audit: every financial/workflow mutation writes an `AuditEvent`
  (actor, action, before/after, reason, request ID, IP).

### L1 exclusions (see spec's L2 backlog section for the full list)

Multi-level/amount-based approval chains, OCR receipt extraction, direct
bank/UPI reconciliation, ERP posting, budget forecasting/anomaly detection,
native offline queue, recurring expenses/vendor master, and in-app
notifications (Slack DMs are implemented — see above — but there is no
in-app or email notification channel; the model/audit trail is ready for them
— see
ASSUMPTIONS.md's known-limitations note on `LOW_BALANCE_THRESHOLD_PAISE`,
which is wired into config but not yet triggering a real notification channel
since none exists in this greenfield app).

## Test commands and results

```bash
cd server && npm test
```
21/21 passing: money-utility unit tests; integration tests covering atomic
approval + ledger posting, the exact Silver Estate reconciliation (₹10,000 →
₹5,517 → ₹4,483), self-approval denial, submit/approve-time overdraft
blocking (including a balance that shrinks *between* submit and approve),
void/reversal without deletion, return→edit→resubmit→approve, mandatory
rejection reason, closed-period enforcement (both for a fresh submission and
for a draft left over from before close), and the legacy CSV import (dry-run,
commit, exact reconciliation, and idempotent re-commit).

`npm run lint` is clean (0 errors/warnings) on both server and client;
`npm run build` (client) and `vite build` succeed.

## Manual QA checklist

Using the seeded accounts (`ASSUMPTIONS.md`):

1. Log in as `frontdesk.silver@neoteric.test` → only Silver Estate is
   selectable → Add Expense → save draft → attach a receipt → submit.
2. Log in as `approver.silver@neoteric.test` → open the pending expense →
   confirm you **cannot** approve your own submissions (log in as front desk
   and try to approve your own — should be blocked) → approve the front-desk
   submission → confirm KPI cards and ledger update.
3. Return an expense with a reason → log back in as front desk → edit →
   resubmit → approve.
4. Log in as `master@neoteric.test` → Master → try closing the Silver Estate
   period while a pending item exists (should be blocked) → clear it → close
   with carry-forward → reopen.
5. Master → Import Legacy Sheet → upload a CSV with a blank-amount row and a
   garbage row → Dry Run → confirm both are rejected with clear reasons →
   Commit → confirm the review-queue rows were not fabricated into expenses.
6. Reports → filter by site/date/category/status → Export CSV and PDF →
   confirm totals match the dashboard.
7. Toggle dark mode from the header; resize to ~360px width to check mobile
   layout of the dashboard table and drawers.

## Security & data-isolation notes

- Every mutating endpoint re-derives permissions from the DB per request
  (not from the JWT payload), so a permission change or deactivation takes
  effect on the very next call.
- Site scope is enforced server-side via `SiteUserAssignment` lookups —
  the client's selected site is never trusted as an authorization boundary.
- Approval, void, and fund-ledger writes run inside Mongo transactions with a
  balance re-check at write time (not just at UI-render time), closing the
  classic double-submit / concurrent-approval race.
- Passwords hashed with bcrypt; JWT access tokens are short-lived and kept in
  memory only (never `localStorage`); refresh tokens are httpOnly, `SameSite=
  Lax` cookies, individually revocable, and rotated on logout.
- Uploaded receipts are validated by MIME type and size, stored under a
  server-generated filename (never the client-supplied one) outside any
  public static path, and served only through an authenticated,
  site-scoped download route.
- Known dependency advisories and their reasoning are documented in
  `ASSUMPTIONS.md`.

## L2 backlog (explicitly deferred, not part of this L1)

Multi-level/amount-based approval chains · OCR receipt extraction · direct
bank/UPI reconciliation · accounting/ERP posting · VMS/IMS-linked expenses ·
budget forecasting & anomaly detection · native mobile offline queue ·
recurring expenses & vendor master · real in-app/email notifications
(submission/approval/low-balance — Slack DM notification is implemented, see
SLACK_SETUP.md, but there is no in-app or email channel) · exact server-side
pagination under the receipt-status filter (see ASSUMPTIONS.md) · fuzzy
duplicate matching.
