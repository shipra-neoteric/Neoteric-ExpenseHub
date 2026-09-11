# Assumptions & Configurable Defaults — Site Expenses (L1)

This file records every default chosen where the spec left a business decision
open, so Master can revisit them without reading code.

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
