# Claude Code Master Prompt — Nexora Site Expenses (L1)

Copy everything below into Claude Code while it is opened at the root of the existing Nexora codebase.

---

## ROLE AND MISSION

You are a senior product architect, finance-systems engineer, UX designer, and full-stack developer working inside the existing **Nexora** repository.

Build an L1 production-quality module called **Site Expenses** for Neoteric Properties. It will replace manually maintained office-expense sheets across:

- Silver Estate head office
- Regal Garden
- Nature Park
- Garden City
- Future projects/sites without code changes

Each site may have a sales office. Neoteric gives that office a fund/imprest to pay small operating expenses such as tea, coffee, milk, pantry supplies, celebrations/gifts, travel/conveyance, courier/freight, cleaning, stationery, and other approved categories. A front desk executive records and manages expenses for the sites assigned to them. Management needs centralized control, live balances, accountability, approvals, receipts, reconciliation, and reporting.

The current Silver Estate sheet for 20 August 2026 to September 2026 contains:

- Amount received: Rs. 10,000
- Office Supplies / Pantry: Rs. 4,064
- Celebrations & Gifts: Rs. 300
- Travel & Conveyance: Rs. 1,153
- Grand total: Rs. 5,517
- Remaining: Rs. 4,483
- Columns: Date, Item/description, Amount
- Existing data quality examples to handle: inconsistent date formats, spelling variants such as expense/expence, vague descriptions such as “Kitchen Expense,” an expense row with no amount, and stray invalid cell content.

Do not reproduce a spreadsheet-shaped application. Preserve the fast mental model—**fund received minus valid expenses equals available balance**—while adding controls invisibly around it.

## NON-NEGOTIABLE WORKING METHOD

1. First inspect the repository completely enough to understand its frontend, backend, database, authentication, authorization, routing, reusable components, testing conventions, linting, and deployment configuration.
2. Read `UI_STYLE_GUIDE.md` if it exists in the repo. Treat it as the visual source of truth.
3. Open and reuse the closest Nexora components named in that guide instead of inventing alternatives: layout shell, `ThemeContext`, `StatsCards`, `ThemedSelect`, `ThemedDatePicker`, `IMSPagination`, tables, drawers, and PDF-export patterns.
4. Determine the actual stack from the repository. Do not replace the established stack or introduce a parallel application, design system, auth system, ORM, state library, or component library.
5. Before modifying code, provide a short audit: detected architecture, reusable patterns, proposed file plan, database migration plan, risks, and any assumptions. Then implement; do not stop after planning.
6. Preserve all existing modules and behavior. Make additive, scoped changes. Do not rewrite unrelated code.
7. If a business detail is unknown, choose the safest configurable default, record it in an `ASSUMPTIONS.md` or module README, and continue. Ask only if the decision is irreversible or security-critical.
8. Use database transactions for every operation that affects money or workflow state. Never trust client-calculated totals, balances, permissions, or status transitions.
9. Treat amounts as integer paise (preferred) or the repository’s existing exact decimal-money convention. Never use floating-point arithmetic for persisted money.
10. Run migrations, lint, type checks, automated tests, and production build. Fix failures introduced by this work. Report pre-existing failures separately.

## FIRST-ORDER PRODUCT THINKING

Solve the immediate operational problem:

- A front desk executive can see the available balance for the selected site and fund period.
- They can record an expense in under 30 seconds with date, category, description, amount, payment mode, and optional/required receipt.
- They can save a draft and submit it.
- A designated approver can approve, reject, or return an expense with a reason.
- Approved expenses reduce the usable fund balance; rejected/voided expenses do not.
- Authorized users can add fund allocations/top-ups and see a chronological ledger.
- Everyone sees exactly which entries are pending, approved, rejected, returned, or voided.
- Management can compare allocated, spent, pending, and available amounts by project/site and period.
- The system produces an audit-friendly expense report/PDF and CSV export.

## SECOND-ORDER PRODUCT THINKING

Design now so these predictable consequences do not require a rewrite:

- Adding dozens of projects, multiple offices per project, and users assigned to several projects.
- A user changing sites or leaving the company without losing historical authorship.
- Funds being topped up multiple times, adjusted, carried forward, frozen, or closed.
- Late entries, backdated entries, duplicate receipts, missing receipts, returned expenses, and corrections after approval.
- Concurrent submissions trying to use the last available balance.
- Approval limits becoming amount/category/site dependent in L2.
- Accounting needing a clean, immutable trail and later integration with IMS/VMS/Nexora’s main agent.
- Site names, categories, policies, limits, and approvers changing over time while historical records stay correct.
- Offline/poor connectivity causing double-clicks or resubmission.
- A malicious or mistaken user attempting cross-site access or altering totals from browser tools.

Use stable IDs and normalized entities. Add `organization_id`/company scope wherever the existing multi-tenant architecture requires it. All operational tables must be site-scoped, and all queries/actions must enforce server-side tenant + site authorization.

## L1 SCOPE TO IMPLEMENT

### 1. Site Expense Dashboard

Create a responsive page inside the authenticated Nexora shell.

Header:

- Title: `Site Expenses`
- Subtitle: `Manage site funds, daily expenses and reconciliations`
- Site selector shown only when the user has access to more than one site; remember the last valid selection.
- Period selector (open fund period, or month/date filter for reporting).
- Primary CTA: `Add Expense`.

KPI cards:

- Total Funded
- Approved Spend
- Pending Approval
- Available Balance
- Missing Receipts (count)

Card clicks filter the list. Available Balance must show server-derived posted balance. Also show a subtle projected balance after pending expenses so users understand commitments.

Main expense list:

- Search by expense number, description, merchant/payee, or submitter.
- Filters: site, date range, category, status, payment mode, receipt status, submitter.
- Columns: expense ID, date, category, description/merchant, submitted by, amount, receipt indicator, status.
- Entire row opens the details drawer; row actions stop propagation.
- Mobile layout keeps essential fields and moves secondary data into the drawer.
- Paginate using the existing Nexora pagination component.
- Clear loading, empty, error, and filtered-no-results states.

### 2. Quick Add/Edit Expense Drawer

Use the established right-side Nexora drawer, not a centered modal.

Fields:

- Site (preselected; locked if the user has only one site)
- Expense date (default today in the application’s configured business timezone; cannot be future)
- Category (master-driven active categories only)
- Description/purpose (required, trimmed, meaningful minimum length)
- Merchant/payee (optional in L1)
- Amount in INR (required, greater than zero, exact money validation)
- Payment mode: Cash, UPI, Card, Bank Transfer, Other
- Paid by / expense owner (default current user; editable only with permission)
- Receipt upload (image/PDF; preview, replace, remove before submission)
- Notes (optional)

Behavior:

- `Save Draft` and `Submit Expense` are distinct actions.
- Drafts do not affect available or projected balance.
- Submitted pending expenses affect projected balance only.
- Approved expenses post to the ledger and affect available balance.
- Show balance before expense and projected balance after it.
- Block submission if it exceeds the fund policy. Default L1 policy: overdraw is not allowed. A Master may configure `Block` or `Allow only with approval`; default to `Block`.
- Prevent accidental duplicate submission with idempotency keys and disabled/loading buttons.
- Warn on a likely duplicate: same site, date, amount, and normalized merchant/description. Allow authorized continuation with a reason; do not silently reject a legitimate expense.
- Autosave draft only if an established safe autosave pattern exists; otherwise provide explicit Save Draft and unsaved-change confirmation.
- A submitted/approved financial record cannot be silently edited. Returned entries may be edited and resubmitted. Approved corrections use void/reversal plus a replacement record.

### 3. Expense Details and Approval Drawer

Show:

- Expense identity/status banner
- Site and fund period
- Submitted and expense dates
- Category, purpose, merchant, payment mode, paid by
- Amount and its effect on balance
- Receipt preview/download
- Creator, submitter, approver, timestamps
- Rejection/return/void reason when relevant
- Full activity timeline

Actions must be permission- and state-aware:

- Draft: Edit, Submit, Delete draft
- Pending Approval: Approve, Return for Correction, Reject
- Returned: Edit and Resubmit
- Approved: Void/Reverse only for authorized users, with mandatory reason
- Rejected/Voided: Read-only

Use SweetAlert2 for confirmations/reasons. Never use browser `alert` or `confirm`.

### 4. Funds / Imprest Module

Create a fund-ledger page accessible to authorized roles.

Support:

- Create an opening allocation for a site and period.
- Add top-up.
- Make a controlled positive/negative adjustment with mandatory reason and elevated permission.
- View total funded, approved spend, available, projected available, and ledger entries.
- Close a fund period only when no pending/returned expenses remain; require reconciliation confirmation and reason/notes.
- Reopen only with Master permission and audit event.

Ledger entries must be append-only: `OPENING_ALLOCATION`, `TOP_UP`, `EXPENSE_POSTED`, `EXPENSE_REVERSAL`, `ADJUSTMENT`, and optional `CARRY_FORWARD`. Balance is calculated from posted ledger entries, never directly editable.

For L1, use one active fund account per site unless the existing business architecture clearly requires office-level accounts. Keep the schema capable of multiple fund accounts per site later.

### 5. Master Module

Create a `Site Expenses > Master` section, visible only to permitted admin roles.

Master can manage:

- Projects/sites: code, name, status, organization/company, optional sales-office label
- Expense categories: name, code, icon identifier, receipt rule, active/inactive, display order
- Fund policies: default allocation, overdraw behavior, receipt-required threshold, backdate limit, allowed payment modes
- Fund periods: open/closed status per site
- Approval configuration: L1 approver(s) per site; structure it so thresholds/multi-level rules can be added later
- Numbering configuration if Nexora already supports configurable prefixes

Never hard-delete a master record referenced by transactions. Deactivate it and preserve historical labels/snapshots. Prevent duplicate normalized codes/names within the relevant scope.

Seed sensible categories including Pantry & Refreshments, Office Supplies & Stationery, Celebrations & Gifts, Travel & Conveyance, Courier & Freight, Cleaning & Housekeeping, Repairs & Maintenance, and Other. Admins can alter them; do not hardcode reporting logic to these names.

### 6. User Management and Access

Extend the existing user/role system; do not create separate authentication.

Support many-to-many user-to-site assignments with optional effective start/end dates and active status. A user can belong to one or many sites. A site can have many users.

Suggested permissions (map to the repo’s established permission naming convention):

- `site_expense.view`
- `site_expense.create`
- `site_expense.edit_own_draft`
- `site_expense.submit`
- `site_expense.approve`
- `site_expense.reject_return`
- `site_expense.void`
- `site_expense.fund_view`
- `site_expense.fund_manage`
- `site_expense.report_export`
- `site_expense.master_manage`
- `site_expense.user_scope_manage`
- `site_expense.view_all_sites`

Provide role presets without making authorization depend only on role names:

- **Front Desk Executive:** assigned-site view, create, edit own draft/returned item, submit
- **Site Approver/Manager:** assigned-site view, approve/return/reject, reports
- **Accounts/Finance:** permitted-site or all-site view, fund ledger, reconciliation, exports; no master access by default
- **Master Admin:** all sites, master configuration, assignments, funds, approvals, reversals, full reporting

Server-side authorization rules:

- Permission check AND organization/site scope check are both required.
- Never accept `site_id`, creator, approver, totals, or role claims from the client without verifying them.
- Users cannot approve their own expense by default. Keep this as a configurable policy but default to prohibited.
- Removing a site assignment blocks future access while preserving historical audit identity.
- List endpoints must never leak counts, search results, exports, files, or aggregate values from unauthorized sites.

### 7. Reports and Export

Implement an L1 report page with site/date/category/status/user filters and totals:

- Opening/total funds
- Approved spend
- Pending amount
- Available balance
- Category-wise spend
- Expense detail listing

Provide CSV export and a Nexora-style PDF using the documented fixed corporate navy PDF style and `Rs.` prefix. Export must apply server-side authorization and match active filters. Include generation timestamp, timezone, selected sites, and filters.

### 8. Notifications and Audit

Integrate with the existing notification mechanism if available:

- Notify site approver on submission/resubmission.
- Notify submitter on approval, return, or rejection.
- Notify permitted finance/master users on low balance according to configurable threshold.

Every financial or workflow mutation creates an append-only audit event with actor, action, entity, before/after state or safe diff, reason, timestamp, request/correlation ID, and source IP/device metadata if the existing audit system supports it. Do not store secrets or raw file data in audit logs.

## DOMAIN MODEL

Adapt names and types to existing conventions, but preserve these concepts:

- `sites` or existing projects entity
- `site_user_assignments`
- `expense_categories`
- `expense_policies`
- `fund_accounts`
- `fund_periods`
- `fund_ledger_entries`
- `expenses`
- `expense_attachments`
- `expense_approval_actions` or generic workflow events
- `expense_audit_events` or existing audit log

Important fields/constraints:

- UUID or established ID convention; never use editable names as foreign keys.
- Human-readable expense number unique within organization, e.g. `EXP-2026-000001`, generated atomically server-side.
- Money fields exact and non-negative where appropriate.
- Status enums and allowed transitions enforced on the server.
- Optimistic concurrency/version column for mutable drafts and master data.
- Created/updated timestamps plus creator/updater IDs.
- Snapshot labels for site/category at transaction time if required for durable historical reporting.
- Attachment metadata includes storage key, original name, MIME type, size, checksum, uploaded-by, and scan status if the current stack supports malware scanning.
- Unique/idempotency constraints to make repeated requests safe.
- Index organization/site/date/status/category and ledger account/period/posted_at fields.

Recommended expense state machine:

`DRAFT -> PENDING_APPROVAL -> APPROVED`

`PENDING_APPROVAL -> RETURNED -> PENDING_APPROVAL`

`PENDING_APPROVAL -> REJECTED`

`APPROVED -> VOIDED` (with reversal ledger entry; never delete the original)

Fund periods: `DRAFT/OPEN -> CLOSED -> REOPENED` (or fit existing enum conventions). Expenses cannot be newly submitted to a closed period.

## BALANCE AND TRANSACTION RULES

Authoritative calculations:

- `funded = sum(OPENING_ALLOCATION + TOP_UP + positive ADJUSTMENT + CARRY_FORWARD)`
- `posted_spend = sum(EXPENSE_POSTED) - sum(EXPENSE_REVERSAL)`
- `available = net funding - posted spend` (respect signed ledger convention)
- `pending = sum(PENDING_APPROVAL expenses)`
- `projected_available = available - pending`

Implement one internally consistent signed-entry convention and document it. Approval must lock/read the relevant fund account/period inside one transaction, re-check permission, period state, expense state, and available balance, then create the ledger entry and approval event atomically. A failed transaction must create neither partial approval nor partial ledger data.

## EDGE CASES THAT MUST BE HANDLED AND TESTED

- Zero, negative, excessively large, malformed, decimal, comma-formatted, and precision-invalid amounts.
- Future expense date; backdated date beyond policy; date on closed period; timezone boundary.
- Empty/whitespace description; inactive category/site/user assignment.
- Missing receipt when category or threshold requires it.
- Unsupported MIME, spoofed extension, corrupt file, oversized file, duplicate upload, upload failure, unauthorized download.
- Same expense submitted twice due to refresh/double click/network retry.
- Two approvers acting simultaneously.
- Two expenses competing for insufficient remaining funds.
- Expense returned while submitter is editing; stale update/version conflict.
- Self-approval attempt; cross-site ID enumeration; edited client request; export leakage.
- User assigned to multiple sites, no sites, expired assignment, or assignment removed mid-session.
- Category/site renamed or deactivated after historical use.
- Period close with pending/returned/draft items (drafts may remain but must not be submit-able; clearly warn).
- Reversal in a later period; record reversal linkage and apply the documented accounting policy.
- Fund adjustment causing negative balance; block by default.
- Duplicate opening allocation; concurrent top-ups; number-sequence collision.
- Search/filter pagination consistency and Indian currency/date formatting.
- Empty/loading/error states, slow network, refresh during mutation, and recoverable server errors.
- Legacy import rows with invalid date/blank amount/unknown category must go to a review queue or import-error report; never silently invent values.

## NEXORA UI/UX REQUIREMENTS

Match the current UI exactly:

- React + Vite + Tailwind utility classes if confirmed by the repo.
- Inter font, dynamic company theme via `useTheme().getThemeColor()` / existing `theme-*` utilities.
- Complete light and dark variants on every color surface.
- `lucide-react` icons only.
- `ThemedSelect` instead of native select and `ThemedDatePicker` for dates.
- Existing floating sidebar/header shell.
- Existing stat cards, table behavior, status pills, pagination, tooltips, and scrollbar utilities.
- Create/edit/details use portal-rendered right drawers with fixed header/footer and scrolling middle.
- SweetAlert2 confirmations above drawers.
- Brand color only for primary/active surfaces; semantic amber/blue/green/red/gray/orange for statuses.
- Indian money format (`₹` in UI, `Rs.` in generated PDF).
- Accessible labels, keyboard navigation, visible focus, screen-reader status text, and no color-only meaning.
- Minimum practical touch target, responsive from 360px mobile through desktop.

Expense status colors:

- Draft: gray
- Pending Approval: amber
- Approved: green or established success mapping
- Returned: orange
- Rejected: red
- Voided: slate/red with explicit label

Do not add decorative complexity. Optimize for a non-technical front desk user: one obvious primary action, plain labels, sensible defaults, inline errors, and no accounting jargon on entry screens. Use `Fund Added`, `Spent`, `Pending`, and `Available`; reserve `ledger`, `reversal`, and `reconciliation` for finance/master views.

## API / SERVICE REQUIREMENTS

Follow existing API conventions. At minimum provide secured capabilities for:

- Dashboard summary
- Expense CRUD limited by state
- Submit/resubmit
- Approve/return/reject/void
- Receipt upload/read/delete within rules
- Funds and ledger list/create/top-up/adjust/close/reopen
- Sites/categories/policies/approval configuration
- User-site assignments
- Reports and exports

Use request validation schemas, consistent error objects, pagination, bounded filters, rate/abuse protection consistent with the repo, and structured logs. Return human-actionable conflict errors such as `Fund period is closed`, `Expense was already approved`, or `Insufficient available balance`.

## MIGRATION OF THE CURRENT SHEET

Provide, but do not automatically execute against production, a safe import path/template for existing spreadsheets:

- Required columns: site, expense date, category, description, amount.
- Optional: merchant, payment mode, paid by, notes, receipt link, legacy row reference.
- Dry-run validation with row-level errors and totals comparison.
- Normalize dates and category aliases only when deterministic.
- Blank/invalid amount, unknown site/category, duplicate row, or ambiguous date goes to review.
- Import is idempotent using source file checksum + row reference.
- Imported approved expenses must be posted consistently to the ledger within transactions.
- Produce an import summary: accepted, rejected, possible duplicates, imported total, source total, and variance.

Include a sample mapping/documentation for the Silver Estate sheet, but do not fabricate the missing amount on `7/9/2026 Kitchen Expense` and ignore/report the stray `b` as invalid source content. Confirm the valid listed rows total Rs. 5,517 and reconcile against the Rs. 10,000 allocation to Rs. 4,483 remaining.

## TESTING REQUIREMENTS

Add automated tests using the repository’s current test stack:

- Unit tests for money calculations, permissions, validation, status transitions, duplicate detection, and date/period policy.
- Database/service integration tests for atomic approval/posting, concurrent approvals, insufficient balance race, reversal, idempotency, and tenant/site isolation.
- API tests for each permission and cross-site access denial.
- Component tests for entry validation, state-aware actions, filters, and accessible drawer behavior.
- At least one end-to-end happy path: Master configures site/fund/user -> front desk submits expense -> approver approves -> balance and report update.
- At least one end-to-end correction path: returned -> edited -> resubmitted -> approved.

Use deterministic fixtures. Test with a user assigned to one site, multiple sites, no sites, an approver, finance user, and master admin.

## L1 ACCEPTANCE CRITERIA

The implementation is complete only when all are true:

1. A Master can configure sites, categories, policy, approver, user assignments, and a fund allocation without database hand-editing.
2. A front desk user sees only assigned sites and can draft/submit a valid expense quickly.
3. An approver cannot self-approve by default and can act only for authorized sites.
4. Approval posts exactly one ledger entry and updates available balance atomically.
5. Returned/rejected/voided flows preserve full history and require reasons where appropriate.
6. Closed periods and insufficient funds are safely enforced on the server.
7. Receipt rules and secure file access work.
8. Dashboard, detail, fund ledger, Master, User Management, and Reports pages work responsively in light and dark themes.
9. Site-level isolation is demonstrated by automated tests.
10. CSV/PDF totals match server calculations and filters.
11. The Silver Estate example reconciles to funded Rs. 10,000, spend Rs. 5,517, balance Rs. 4,483 without importing the blank-amount row.
12. Migrations have safe rollback/down behavior where the repo supports it; seeds are idempotent.
13. Lint, type check, tests, and production build pass.

## REQUIRED DELIVERY FORMAT

At completion, provide:

1. Architecture and repository findings.
2. Assumptions/configurable defaults chosen.
3. File-by-file change summary.
4. Database schema/migration summary and rollback notes.
5. Role/permission matrix.
6. API endpoint/service summary.
7. Implemented workflows and explicit L1 exclusions.
8. Test commands and results.
9. Manual QA checklist with test accounts/fixtures (no real credentials).
10. Setup/environment variables and migration/seed commands.
11. Security and data-isolation notes.
12. Recommended L2 backlog, separated from completed L1 work.

## L1 EXCLUSIONS / DESIGN HOOKS FOR L2

Do not inflate L1 with these unless the repository already provides them cheaply. Design clean extension points for:

- Multi-level/amount-based approval chains
- OCR receipt extraction
- Direct bank/UPI reconciliation
- Accounting/ERP posting
- VMS/IMS-linked expenses
- Budget forecasting and anomaly detection
- Nexora agent summaries and Slack alerts
- Native mobile offline queue
- Recurring expenses and vendor master linkage

Prioritize a secure, auditable, exceptionally simple L1 over a broad unfinished system.

