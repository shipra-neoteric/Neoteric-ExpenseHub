# Assumptions & Configurable Defaults — Site Expenses (L1)

This file records every default chosen where the spec left a business decision
open, so Master can revisit them without reading code.

## Post-L1 changes (AGM role, mandatory receipts, monthly rollover, Slack)

Added after the initial L1 build, per direct request:

- **AGM role**: a new role preset (`ROLE_PRESETS.AGM`) with the exact same
  permission bundle as the existing `SITE_APPROVER` preset — it's the same
  single approval step, just a label Master can now assign going forward.
  `SITE_APPROVER` still works for any already-assigned users; nothing was
  removed.
- **Rejecting now deducts the fund.** Previously only `APPROVED` expenses
  posted a ledger entry; `REJECTED` did not. Now `rejectExpense` posts the
  same kind of `EXPENSE_POSTED` deduction an approval would, because the
  money was already spent in the real world regardless of the review
  outcome — a rejection is a judgment about legitimacy, not proof the cash
  never left the register. The expense's **status** still shows `Rejected`
  (for accountability); only the fund math changed. A rejected-and-deducted
  expense can be reversed later via the same **Void/Reverse** action already
  used for approved expenses — `voidExpense` now accepts either status, gated
  on the expense actually having a `ledgerEntryId` to reverse. The
  `approvedSpend` field/label (dashboard "Approved Spend" KPI, report totals)
  is unchanged in name but now means "posted spend regardless of review
  outcome" — documented in `fundService.js` rather than renamed everywhere,
  to avoid an unrelated mass rename.
- **Receipts are now unconditionally required to submit** — the earlier
  category-rule / policy-threshold nuance (`RECEIPT_RULE`,
  `receiptRequiredThresholdPaise`) still exists in the schema but no longer
  gates anything; every submission needs at least one attachment, full stop.
- **Monthly fund rollover**: each site's `ExpensePolicy.defaultAllocationPaise`
  (the existing "Default Allocation" field, previously just a suggested
  number for the manual opening-allocation form) is now also read as that
  site's **fixed monthly amount**. `fundService.rolloverDueSites` closes the
  prior period, carries its balance forward (even if zero or negative — unlike
  a manual close, which only carries forward a positive balance, because
  unattended automation must never leave a site with no open period to keep
  operating in), and adds the new month's fixed amount on top. Idempotent:
  a site already on the current month's period label is left untouched, so
  the external trigger is safe to call more than once (see below). A site
  with `defaultAllocationPaise` of 0/unset is left alone entirely — this
  feature is opt-in per site via that one existing field, not a forced
  behavior change for sites Master hasn't configured for it.
- **Trigger mechanism**: no reliable in-process scheduler exists on Render's
  free tier (the web service can spin down when idle), so this is triggered
  either manually (Master → Funds → "Run Monthly Rollover", normal session
  auth) or by an external HTTP call to `POST /api/admin/monthly-rollover`,
  authenticated by a static `AUTOMATION_SECRET` header instead of a user JWT
  (no human is logged in for a cron job) — see `DEPLOYMENT.md` section 7 for
  the actual scheduler setup (cron-job.org or GitHub Actions). That endpoint
  attributes each organization's automated ledger/audit entries to that org's
  first active Master Admin, since every ledger entry needs a real `User` to
  attribute to and there is no logged-in actor for a scheduled call.
- **Slack approvals**: optional, off unless `SLACK_BOT_TOKEN` and
  `SLACK_SIGNING_SECRET` are set (see `SLACK_SETUP.md`). On submit, every
  site policy's `approverUserIds` with a `slackEmail` set gets a Slack DM
  with the full expense detail and an inline receipt image (or a link, for
  PDFs) plus Approve/Reject buttons. Approve acts immediately; Reject opens a
  Slack modal to collect the (still-mandatory) reason before deducting the
  fund exactly as described above. This is deliberately **best-effort and
  non-blocking** — a Slack failure (misconfigured token, network issue, no
  `slackEmail` set) is logged, never surfaces to the submitter, and never
  rolls back or delays the actual submission, since the notification is a
  convenience layered on top of the real workflow, not a dependency of it.
  Receipt images are exposed to Slack's own servers (which fetch the URL
  server-to-server to render the DM preview, not through the viewer's
  browser session) via a short-lived HMAC-signed link
  (`/api/public/attachments/:id?token=...`, `signedLink.js`, 24h expiry,
  one attachment per token) — deliberately separate from the authenticated
  `/api/expenses/:id/attachments/:id` route used everywhere else in the app.
- **User "delete" is a soft-deactivate**, consistent with sites/categories/
  assignments elsewhere in the app: a `User` is referenced by
  `Expense.createdBy/approvedBy`, ledger `createdBy`, and audit `actorId`
  across the historical record, so hard-deleting one would either break
  those references or silently rewrite history. `DELETE /users/:id` sets
  `isActive: false` (blocks login immediately) rather than removing the
  document. A user cannot deactivate their own account through this endpoint.

## UI style guide reconciliation

Partway through the build, a file named `UI_STYLE_GUIDE.md` appeared in the
project directory describing a real-looking, highly specific existing Nexora
IMS design system (exact Tailwind classes, a static navy PDF color,
references to files like `PurchaseOrderDetailsDrawer.jsx`) — inconsistent
with the earlier confirmation that no existing Nexora codebase exists here.
This was flagged to the user; the resolution was to keep the greenfield app
but restyle it to match that guide's specifics as closely as possible without
the underlying repo. Notable results:

- Default theme is **dark mode**, brand color **orange** (`#f97316`), CSS
  variables renamed to `--theme-primary[-light|-dark]` with `theme-*` utility
  classes, matching the guide exactly.
- `ThemedSelect` and `ThemedDatePicker` were rebuilt as true custom
  portal-rendered components (button + `createPortal` popup, positioned via
  `getBoundingClientRect`) — never native `<select>`/`<input type="date">`.
- Primary CTA buttons use inline `style={{ backgroundColor: getThemeColor() }}`
  per the guide's documented pattern; Approve is static green
  (`bg-green-600`), destructive actions are static red (`bg-red-600`),
  regardless of brand color — both are guide-documented exceptions.
- Drawers, StatsCards, pagination, status badges, and PDF export (now
  generated **client-side** with `jspdf`/`jspdf-autotable`, dynamically
  imported so it doesn't bloat the main bundle) all follow the guide's
  section-by-section specifics (icon tile, `slideInRight` animation,
  numbered pagination, badge opacity levels, fixed navy `[26,54,93]` PDF
  color).
- `jspdf`/`jspdf-autotable` were pinned to their current major versions
  (4.x / 5.x) rather than the guide's implied older ones, after the initial
  install surfaced a **critical** advisory in `jspdf@2.5.2`/`jspdf-autotable@3`
  — both APIs are compatible, so this was a straight upgrade, not a
  compromise.
- A mobile sidebar overlay (hamburger toggle + slide-in nav) was added while
  doing this pass — the original build had no mobile navigation at all
  (`hidden md:flex` with nothing else), which the guide's section 5.1 mobile
  pattern surfaced as a real functional gap, not just a style mismatch.
- Not reproduced (judged not worth the added complexity for this app's
  actual surface area): collapsed/flyout sidebar variant, avatar/initials
  tile options inside dropdowns, and >8-option search-box auto-show
  threshold nuance beyond what's already implemented.

## Stack

- **Greenfield build.** No existing "Nexora" codebase was present in this
  repository — only the prompt file. Built as a new standalone app: React +
  Vite + Tailwind (client), Node/Express + MongoDB/Mongoose + JWT (server), per
  explicit user decision.
- Component names (`ThemedSelect`, `ThemedDatePicker`, `StatsCards`,
  `IMSPagination`) were kept as named in the spec even though there is no
  existing design system to match, so a future integration into a real Nexora
  codebase can swap them in directly.

## Money & multi-tenancy

- All money is stored as **integer paise** (`amountPaise`), never floats.
- Single `Organization` ("Neoteric Properties") seeded; the schema carries
  `organizationId` everywhere so a second company/tenant can be added without
  migration.
- **One active `FundAccount` per site** for L1 (schema supports more later via
  a unique `(siteId, name)` pair instead of a hard one-per-site constraint).

## Fund policy

- Default overdraw behavior: **Block** (configurable to "Allow with approval"
  per site/org via Master → Fund Policy).
- Under `ALLOW_WITH_APPROVAL`, neither submission nor approval enforces a hard
  balance floor — the approver's judgment substitutes for the automatic block.
  This is deliberate: the policy name says "allow", not "allow up to a second,
  looser cap".
- Default backdate limit: **7 days** (seed data uses 45 for the Silver Estate
  site/org-default policy so the historical August sheet can be re-entered).
- **A site-level `ExpensePolicy` document fully replaces the org default for
  that site — fields are not merged field-by-field.** If Master creates a
  site-specific policy, every field that matters (payment modes, backdate
  limit, etc.) must be set on it, not just the one field being overridden.
  This was chosen for predictability (no "which layer set this?" debugging)
  over the smaller convenience of partial overrides. Flagged as an L2
  candidate if partial merging turns out to be wanted.
- **Self-approval is blocked by default**, configurable per policy
  (`allowSelfApproval`).
- Receipt requirement has two independent triggers, either one requires a
  receipt: the **category's** `receiptRule` (`NOT_REQUIRED` /
  `REQUIRED` / `REQUIRED_ABOVE_THRESHOLD`), and the **policy's**
  blanket `receiptRequiredThresholdPaise` (any expense at/above this amount,
  regardless of category). Seed data leaves the policy threshold `null` so the
  historical import doesn't need placeholder receipts.

## Balance & ledger

- Single signed-entry ledger convention: `amountPaise` is positive for
  everything that adds to the fund (`OPENING_ALLOCATION`, `TOP_UP`,
  `CARRY_FORWARD`, positive `ADJUSTMENT`) and negative for
  `EXPENSE_POSTED`; `EXPENSE_REVERSAL` is positive (it cancels a posted
  expense). **`available` is simply the sum of all ledger entries** for the
  fund period — this single invariant is what "available = net funding − posted
  spend" reduces to under this sign convention.
- `pending` = sum of `PENDING_APPROVAL` expenses only (not `RETURNED`), per the
  spec's literal formula. A returned expense does not hold a place in the
  projected balance until the submitter resubmits it.
- Void/reversal is allowed **regardless of whether the fund period is still
  open** — a correction found after period close shouldn't be blocked, since it
  only corrects existing spend rather than adding new spend. The reversal
  always posts against the expense's *original* period, not the current one.
- Closing a fund period is blocked while any `PENDING_APPROVAL` or `RETURNED`
  expense exists in it; `DRAFT` expenses are allowed to remain (and become
  permanently un-submittable once the period is closed, per spec).
- Reopening a period requires `site_expense.master_manage` (Master-only, per
  spec) and is audited.

## Duplicate detection

- A "likely duplicate" match is: same site, same calendar day, same exact
  amount, and case/whitespace-normalized exact match on both description and
  merchant, against any `PENDING_APPROVAL` / `APPROVED` / `RETURNED` expense.
  This is intentionally exact-match rather than fuzzy for L1 predictability;
  fuzzy matching is a reasonable L2 upgrade.
- Overriding a flagged duplicate requires a typed reason, stored on the
  expense (`duplicateOverrideReason`) and in its audit trail.

## Attachments

- Allowed MIME types: JPEG, PNG, WEBP, PDF. Max size configurable via
  `MAX_UPLOAD_MB` (default 8MB).
- No malware scanning integration in L1 (`scanStatus` defaults to
  `SKIPPED`); the field exists so a scanner can be wired in later without a
  schema change.
- Attachments can only be added/removed while an expense is `DRAFT` or
  `RETURNED`.

## Numbering

- Expense numbers: `EXP-<year>-<6-digit sequence>`, atomic per-organization
  via a Mongo counter document (`findOneAndUpdate` with `$inc`), assigned at
  **draft creation** (not first submission) so every expense — even an
  abandoned draft — has a stable, unique reference from the start.

## Known limitation to revisit in L2

- The expense list endpoint's `receiptStatus` filter (missing/attached) is
  applied **after** the paginated DB query, so the reported `total`/
  `totalPages` reflect the unfiltered count when this filter is active. Exact
  server-side pagination under this filter needs a heavier aggregation
  pipeline; flagged rather than silently shipped as exact.
- `qs` (a transitive dependency of Express 4) and the Vite 5 dev server
  (`esbuild`) both carry known moderate/high-severity advisories with no
  non-breaking fix available at time of writing. Both are dev/query-parsing
  surface only — not exploitable through the app's own validated request
  bodies — and are noted here rather than force-upgraded into an unverified
  major version (Express 5 / Vite 8) under this task's timeline. Revisit when
  those majors have stabilized ecosystem support.

## Migration of the legacy sheet

Implemented as a real feature (Master → Import Legacy Sheet), not just the
seed script:

- CSV columns: `site, expenseDate, category, description, amount` required;
  `merchant, paymentMode, notes, legacyRowRef` optional.
- **Dry-run** validates every row (unknown site/category, blank/invalid
  amount, ambiguous/unparseable date) without writing anything, and reports
  accepted vs. rejected rows plus the accepted total for comparison against
  the source sheet's stated total.
- **Commit** posts only rows that pass validation, each in its own
  transaction (creates the `Expense` directly as `APPROVED` with a real
  `EXPENSE_POSTED` ledger entry — it does not replay the interactive
  draft→submit→approve policy gates like backdate limits, since historical
  rows are often older than any sane live backdate window). A row that would
  overdraw the fund is rejected into the review queue rather than posted.
- **Idempotent** via `(organizationId, fileChecksum, rowRef)`: re-committing
  the same file skips rows already imported; a row that was previously
  rejected is re-validated (so fixing the source file and re-uploading can
  succeed on a later attempt) rather than replayed with its stale reason.
- A row matching an existing expense on site+date+amount+description is still
  imported (spec: legacy sheets may legitimately contain what looks like a
  duplicate) but flagged `possibleDuplicate: true` in the commit summary for
  manual review — it is not silently rejected nor silently merged.
- Date parsing is deterministic only: ISO (`YYYY-MM-DD`) or day-first
  `D/M/YYYY` (the Indian convention, matching the source sheet's own
  `7/9/2026` format) — anything else is rejected as "unrecognized date
  format" rather than guessed.

## Seeded test accounts

All seeded users share the password `ChangeMe123!` (must be rotated before any
real deployment — see README Security section):

| Email | Role |
|---|---|
| `master@neoteric.test` | Master Admin |
| `frontdesk.silver@neoteric.test` | Front Desk Executive — Silver Estate |
| `approver.silver@neoteric.test` | Site Approver — Silver Estate |
| `finance@neoteric.test` | Finance (all sites) |

Seed data reconstructs the actual Silver Estate sheet (20 Aug – Sep 2026):
Opening allocation ₹10,000 → three approved expenses (₹4,064 Pantry,
₹300 Celebrations & Gifts, ₹1,153 Travel & Conveyance = ₹5,517) → available
₹4,483. The blank-amount "Kitchen Expense" row and the stray `b` cell from the
original sheet are intentionally **not** imported (see "Migration of the
legacy sheet" above) —
they belong in a review queue, not fabricated into a number.
