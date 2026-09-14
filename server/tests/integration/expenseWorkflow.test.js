const db = require('../helpers/db');
const Organization = require('../../src/models/Organization');
const Site = require('../../src/models/Site');
const User = require('../../src/models/User');
const ExpenseCategory = require('../../src/models/ExpenseCategory');
const ExpensePolicy = require('../../src/models/ExpensePolicy');
const Expense = require('../../src/models/Expense');
const ExpenseAttachment = require('../../src/models/ExpenseAttachment');
const fundService = require('../../src/services/fundService');
const expenseService = require('../../src/services/expenseService');
const { EXPENSE_STATUS, OVERDRAW_BEHAVIOR, PAYMENT_MODES } = require('../../src/config/constants');

// submitExpense only checks that at least one attachment row exists for the
// expense — it never reads the file itself — so a bare metadata row is a
// faithful stand-in for a real upload in these service-level tests.
async function attachFakeReceipt(expenseId, userId) {
  await ExpenseAttachment.create({
    organizationId: (await Expense.findById(expenseId)).organizationId,
    expenseId,
    storageKey: 'fake-key.jpg',
    originalName: 'receipt.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    checksum: 'fake-checksum',
    uploadedBy: userId,
  });
}

beforeAll(async () => db.connect());
afterAll(async () => db.disconnect());
afterEach(async () => db.clearDatabase());

async function setupFixture({ overdrawBehavior = OVERDRAW_BEHAVIOR.BLOCK, allowSelfApproval = false } = {}) {
  const org = await Organization.create({ name: 'Neoteric Properties', code: 'NEOTERIC' });
  const site = await Site.create({ organizationId: org._id, code: 'SILVER-ESTATE', name: 'Silver Estate' });
  const category = await ExpenseCategory.create({
    organizationId: org._id,
    name: 'Pantry & Refreshments',
    normalizedName: 'pantry & refreshments',
    code: 'PANTRY',
  });
  await ExpensePolicy.create({
    organizationId: org._id,
    siteId: null,
    overdrawBehavior,
    backdateLimitDays: 45,
    allowedPaymentModes: PAYMENT_MODES,
    allowSelfApproval,
  });
  const frontDesk = await User.create({
    organizationId: org._id,
    name: 'Front Desk',
    email: 'fd@test.com',
    passwordHash: 'x',
    roleLabel: 'FRONT_DESK_EXECUTIVE',
    permissions: ['site_expense.view', 'site_expense.create', 'site_expense.submit'],
  });
  const approver = await User.create({
    organizationId: org._id,
    name: 'Approver',
    email: 'ap@test.com',
    passwordHash: 'x',
    roleLabel: 'SITE_APPROVER',
    permissions: ['site_expense.view', 'site_expense.approve'],
  });
  const period = await fundService.createOpeningAllocation({
    organizationId: org._id,
    siteId: site._id,
    amountPaise: 1000000,
    label: 'TEST-PERIOD',
    startDate: new Date(),
    userId: approver._id,
  });
  return { org, site, category, frontDesk, approver, period };
}

async function createSubmittedExpense({ org, site, category, user, amountPaise = 406400, description = 'Pantry supplies for office' }) {
  const draft = await expenseService.createDraft({
    organizationId: org._id,
    siteId: site._id,
    userId: user._id,
    payload: {
      expenseDate: new Date(),
      categoryId: category._id,
      description,
      amountPaise,
      paymentMode: 'CASH',
      paidByUserId: user._id,
    },
  });
  await attachFakeReceipt(draft._id, user._id);
  return expenseService.submitExpense({ expense: draft, userId: user._id });
}

describe('expense approval workflow', () => {
  test('approval posts exactly one ledger entry and updates available balance atomically', async () => {
    const { org, site, category, frontDesk, approver, period } = await setupFixture();
    const submitted = await createSubmittedExpense({ org, site, category, user: frontDesk });

    const before = await fundService.computeBalance(period._id);
    expect(before.available).toBe(1000000);
    expect(before.pending).toBe(406400);

    const approved = await expenseService.approveExpense({ expenseId: submitted._id, userId: approver._id });
    expect(approved.status).toBe(EXPENSE_STATUS.APPROVED);
    expect(approved.ledgerEntryId).toBeTruthy();

    const after = await fundService.computeBalance(period._id);
    expect(after.available).toBe(1000000 - 406400);
    expect(after.pending).toBe(0);
    expect(after.approvedSpend).toBe(406400);
  });

  test('reconciles the Silver Estate example: 10000 funded, 5517 spend, 4483 available', async () => {
    const { org, site, category, frontDesk, approver, period } = await setupFixture();
    const rows = [40640 * 10, 30000, 115300]; // 4064.00, 300.00, 1153.00 in paise
    for (const amountPaise of rows) {
      const submitted = await createSubmittedExpense({ org, site, category, user: frontDesk, amountPaise, description: `Row ${amountPaise}` });
      await expenseService.approveExpense({ expenseId: submitted._id, userId: approver._id });
    }
    const balance = await fundService.computeBalance(period._id);
    expect(balance.funded).toBe(1000000);
    expect(balance.approvedSpend).toBe(551700);
    expect(balance.available).toBe(448300);
  });

  test('a user cannot approve their own expense by default', async () => {
    const { org, site, category, frontDesk } = await setupFixture();
    const submitted = await createSubmittedExpense({ org, site, category, user: frontDesk });
    await expect(expenseService.approveExpense({ expenseId: submitted._id, userId: frontDesk._id })).rejects.toMatchObject({ code: 'SELF_APPROVAL_DENIED' });
  });

  test('blocks approval that would overdraw the fund, even if it fit at submit time', async () => {
    const { org, site, category, frontDesk, approver, period } = await setupFixture();
    // Fits comfortably at submission (900000 of 1000000 available).
    const submitted = await createSubmittedExpense({ org, site, category, user: frontDesk, amountPaise: 900000 });
    // A later adjustment shrinks the fund before approval happens.
    await fundService.addLedgerMovement({
      organizationId: org._id,
      siteId: site._id,
      fundPeriodId: period._id,
      type: 'ADJUSTMENT',
      amountPaise: -150000,
      reason: 'Correcting an earlier double top-up',
      userId: approver._id,
      requireNonNegativeResult: true,
    });
    await expect(expenseService.approveExpense({ expenseId: submitted._id, userId: approver._id })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  test('blocks submission that would overdraw the fund', async () => {
    const { org, site, category, frontDesk } = await setupFixture();
    await expect(createSubmittedExpense({ org, site, category, user: frontDesk, amountPaise: 2000000 })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  test('void creates a reversal ledger entry and restores balance without deleting the original', async () => {
    const { org, site, category, frontDesk, approver, period } = await setupFixture();
    const submitted = await createSubmittedExpense({ org, site, category, user: frontDesk });
    const approved = await expenseService.approveExpense({ expenseId: submitted._id, userId: approver._id });

    const voided = await expenseService.voidExpense({ expenseId: approved._id, userId: approver._id, reason: 'Duplicate paper entry found later' });
    expect(voided.status).toBe(EXPENSE_STATUS.VOIDED);
    expect(voided.reversalLedgerEntryId).toBeTruthy();

    const stillExists = await Expense.findById(approved._id);
    expect(stillExists).not.toBeNull();

    const after = await fundService.computeBalance(period._id);
    expect(after.available).toBe(1000000);
  });

  test('returned expense can be edited and resubmitted, then approved', async () => {
    const { org, site, category, frontDesk, approver } = await setupFixture();
    const submitted = await createSubmittedExpense({ org, site, category, user: frontDesk });

    const returned = await expenseService.returnExpense({ expenseId: submitted._id, userId: approver._id, reason: 'Please clarify the merchant name' });
    expect(returned.status).toBe(EXPENSE_STATUS.RETURNED);

    const edited = await expenseService.updateExpense({ expense: returned, userId: frontDesk._id, payload: { merchant: 'Local Tea Stall' }, expectedVersion: returned.version });
    const resubmitted = await expenseService.submitExpense({ expense: edited, userId: frontDesk._id });
    expect(resubmitted.status).toBe(EXPENSE_STATUS.PENDING_APPROVAL);

    const approved = await expenseService.approveExpense({ expenseId: resubmitted._id, userId: approver._id });
    expect(approved.status).toBe(EXPENSE_STATUS.APPROVED);
  });

  test('rejects an expense with a mandatory reason', async () => {
    const { org, site, category, frontDesk, approver } = await setupFixture();
    const submitted = await createSubmittedExpense({ org, site, category, user: frontDesk });
    await expect(expenseService.rejectExpense({ expenseId: submitted._id, userId: approver._id, reason: '' })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    const rejected = await expenseService.rejectExpense({ expenseId: submitted._id, userId: approver._id, reason: 'Not a valid business expense' });
    expect(rejected.status).toBe(EXPENSE_STATUS.REJECTED);
  });

  test('cannot start a new expense once the fund period is closed', async () => {
    const { org, site, category, frontDesk, period } = await setupFixture();
    await fundService.closePeriod({ fundPeriodId: period._id, userId: frontDesk._id, reason: 'Month end close', carryForward: false });
    await expect(createSubmittedExpense({ org, site, category, user: frontDesk })).rejects.toMatchObject({ code: 'NO_OPEN_PERIOD' });
  });

  test('a draft left over from before period close cannot later be submitted', async () => {
    const { org, site, category, frontDesk, period } = await setupFixture();
    const draft = await expenseService.createDraft({
      organizationId: org._id,
      siteId: site._id,
      userId: frontDesk._id,
      payload: { expenseDate: new Date(), categoryId: category._id, description: 'Left as a draft', amountPaise: 10000, paymentMode: 'CASH', paidByUserId: frontDesk._id },
    });
    // Drafts don't block closing (only PENDING_APPROVAL/RETURNED do) and are allowed to remain.
    await fundService.closePeriod({ fundPeriodId: period._id, userId: frontDesk._id, reason: 'Month end close', carryForward: false });
    await expect(expenseService.submitExpense({ expense: draft, userId: frontDesk._id })).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });
  });

  test('cannot close a period while a pending expense exists', async () => {
    const { org, site, category, frontDesk, period } = await setupFixture();
    await createSubmittedExpense({ org, site, category, user: frontDesk });
    await expect(fundService.closePeriod({ fundPeriodId: period._id, userId: frontDesk._id, reason: 'Month end close', carryForward: false })).rejects.toMatchObject({ code: 'PENDING_ITEMS_EXIST' });
  });

  test('warns on a likely duplicate submission unless overridden with a reason', async () => {
    const { org, site, category, frontDesk } = await setupFixture();
    await createSubmittedExpense({ org, site, category, user: frontDesk, amountPaise: 50000, description: 'Milk and biscuits' });

    const draft2 = await expenseService.createDraft({
      organizationId: org._id,
      siteId: site._id,
      userId: frontDesk._id,
      payload: { expenseDate: new Date(), categoryId: category._id, description: 'Milk and biscuits', amountPaise: 50000, paymentMode: 'CASH', paidByUserId: frontDesk._id },
    });
    await attachFakeReceipt(draft2._id, frontDesk._id);
    await expect(expenseService.submitExpense({ expense: draft2, userId: frontDesk._id })).rejects.toMatchObject({ code: 'POSSIBLE_DUPLICATE' });

    const resubmitted = await expenseService.submitExpense({ expense: draft2, userId: frontDesk._id, duplicateOverrideReason: 'Two separate pantry runs today' });
    expect(resubmitted.status).toBe(EXPENSE_STATUS.PENDING_APPROVAL);
  });

  test('a receipt is required to submit — no exceptions by category or amount', async () => {
    const { org, site, category, frontDesk } = await setupFixture();
    const draft = await expenseService.createDraft({
      organizationId: org._id,
      siteId: site._id,
      userId: frontDesk._id,
      payload: { expenseDate: new Date(), categoryId: category._id, description: 'No receipt attached', amountPaise: 10000, paymentMode: 'CASH', paidByUserId: frontDesk._id },
    });
    await expect(expenseService.submitExpense({ expense: draft, userId: frontDesk._id })).rejects.toMatchObject({ code: 'RECEIPT_REQUIRED' });

    await attachFakeReceipt(draft._id, frontDesk._id);
    const submitted = await expenseService.submitExpense({ expense: draft, userId: frontDesk._id });
    expect(submitted.status).toBe(EXPENSE_STATUS.PENDING_APPROVAL);
  });

  test('AGM rejecting an expense still deducts the fund (money was already spent), and it can be reversed later', async () => {
    const { org, site, category, frontDesk, approver, period } = await setupFixture();
    const submitted = await createSubmittedExpense({ org, site, category, user: frontDesk, amountPaise: 200000 });

    const rejected = await expenseService.rejectExpense({ expenseId: submitted._id, userId: approver._id, reason: 'Not a legitimate business expense' });
    expect(rejected.status).toBe(EXPENSE_STATUS.REJECTED);
    expect(rejected.ledgerEntryId).toBeTruthy();

    const afterReject = await fundService.computeBalance(period._id);
    expect(afterReject.available).toBe(1000000 - 200000);
    expect(afterReject.pending).toBe(0);

    // Dispute resolved in the front desk's favor — reverse it like an approved void.
    const voided = await expenseService.voidExpense({ expenseId: rejected._id, userId: approver._id, reason: 'Front desk produced valid justification on review' });
    expect(voided.status).toBe(EXPENSE_STATUS.VOIDED);
    expect(voided.reversalLedgerEntryId).toBeTruthy();

    const afterVoid = await fundService.computeBalance(period._id);
    expect(afterVoid.available).toBe(1000000);
  });
});
