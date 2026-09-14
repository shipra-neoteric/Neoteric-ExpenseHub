const db = require('../helpers/db');
const Organization = require('../../src/models/Organization');
const Site = require('../../src/models/Site');
const User = require('../../src/models/User');
const ExpenseCategory = require('../../src/models/ExpenseCategory');
const ExpensePolicy = require('../../src/models/ExpensePolicy');
const fundService = require('../../src/services/fundService');
const expenseService = require('../../src/services/expenseService');
const ExpenseAttachment = require('../../src/models/ExpenseAttachment');

beforeAll(async () => db.connect());
afterAll(async () => db.disconnect());
afterEach(async () => db.clearDatabase());

async function setupFixture({ defaultAllocationPaise = 800000 } = {}) {
  const org = await Organization.create({ name: 'Neoteric Properties', code: 'NEOTERIC' });
  const site = await Site.create({ organizationId: org._id, code: 'GARDEN-CITY', name: 'Garden City' });
  const category = await ExpenseCategory.create({ organizationId: org._id, name: 'Pantry', normalizedName: 'pantry', code: 'PANTRY' });
  await ExpensePolicy.create({ organizationId: org._id, siteId: null, defaultAllocationPaise, backdateLimitDays: 45 });
  const master = await User.create({ organizationId: org._id, name: 'Master', email: 'master@test.com', passwordHash: 'x', roleLabel: 'MASTER_ADMIN', permissions: ['site_expense.master_manage'] });
  return { org, site, category, master };
}

describe('monthly fund rollover', () => {
  test('bootstraps an opening period for a site with a configured monthly amount but no fund yet', async () => {
    const { org, site, master } = await setupFixture({ defaultAllocationPaise: 800000 });
    const results = await fundService.rolloverDueSites({ organizationId: org._id, userId: master._id });

    expect(results).toEqual([{ site: 'Garden City', outcome: 'OPENED', periodId: expect.anything(), label: fundService.monthLabel() }]);
    const account = await fundService.getActiveFundAccount(site._id, org._id);
    const period = await fundService.getOpenPeriod(account._id);
    const balance = await fundService.computeBalance(period._id);
    expect(balance.funded).toBe(800000);
    expect(balance.available).toBe(800000);
  });

  test('running rollover again in the same month is a no-op', async () => {
    const { org, master } = await setupFixture();
    await fundService.rolloverDueSites({ organizationId: org._id, userId: master._id });
    const results = await fundService.rolloverDueSites({ organizationId: org._id, userId: master._id });
    expect(results[0].outcome).toBe('ALREADY_CURRENT');
  });

  test('carries forward the leftover balance and adds the new monthly amount on top', async () => {
    const { org, site, category, master } = await setupFixture({ defaultAllocationPaise: 800000 });
    await fundService.rolloverDueSites({ organizationId: org._id, userId: master._id });
    const account = await fundService.getActiveFundAccount(site._id, org._id);
    const openPeriod = await fundService.getOpenPeriod(account._id);

    // Spend 750000 of the 800000, leaving 50000 unused this "month".
    const draft = await expenseService.createDraft({
      organizationId: org._id,
      siteId: site._id,
      userId: master._id,
      payload: { expenseDate: new Date(), categoryId: category._id, description: 'Big pantry restock', amountPaise: 750000, paymentMode: 'CASH', paidByUserId: master._id },
    });
    await ExpenseAttachment.create({ organizationId: org._id, expenseId: draft._id, storageKey: 'k', originalName: 'r.jpg', mimeType: 'image/jpeg', sizeBytes: 1, checksum: 'c', uploadedBy: master._id });
    const submitted = await expenseService.submitExpense({ expense: draft, userId: master._id });
    await expenseService.approveExpense({ expenseId: submitted._id, userId: master._id, allowSelfApprovalOverride: true });

    const balanceBeforeRollover = await fundService.computeBalance(openPeriod._id);
    expect(balanceBeforeRollover.available).toBe(50000);

    // Force the rollover to treat the still-open period as "last month" by
    // backdating its label, since we can't actually wait for a real month
    // to pass in a test.
    openPeriod.label = '2000-01';
    await openPeriod.save();

    const results = await fundService.rolloverDueSites({ organizationId: org._id, userId: master._id });
    expect(results[0].outcome).toBe('ROLLED_OVER');

    const newPeriod = await fundService.getOpenPeriod(account._id);
    expect(newPeriod.label).toBe(fundService.monthLabel());
    const newBalance = await fundService.computeBalance(newPeriod._id);
    // 50000 carried forward + 800000 new monthly allocation.
    expect(newBalance.available).toBe(850000);
  });

  test('skips a site whose open period still has a pending expense', async () => {
    const { org, site, category, master } = await setupFixture();
    await fundService.rolloverDueSites({ organizationId: org._id, userId: master._id });
    const account = await fundService.getActiveFundAccount(site._id, org._id);
    const openPeriod = await fundService.getOpenPeriod(account._id);

    const draft = await expenseService.createDraft({
      organizationId: org._id,
      siteId: site._id,
      userId: master._id,
      payload: { expenseDate: new Date(), categoryId: category._id, description: 'Still pending', amountPaise: 10000, paymentMode: 'CASH', paidByUserId: master._id },
    });
    await ExpenseAttachment.create({ organizationId: org._id, expenseId: draft._id, storageKey: 'k', originalName: 'r.jpg', mimeType: 'image/jpeg', sizeBytes: 1, checksum: 'c', uploadedBy: master._id });
    await expenseService.submitExpense({ expense: draft, userId: master._id });

    openPeriod.label = '2000-01';
    await openPeriod.save();

    const results = await fundService.rolloverDueSites({ organizationId: org._id, userId: master._id });
    expect(results[0].outcome).toBe('PENDING_ITEMS_EXIST');
    // The old period must remain open — a skipped rollover cannot leave the
    // site with no open period to keep operating in.
    const stillOpen = await fundService.getOpenPeriod(account._id);
    expect(String(stillOpen._id)).toBe(String(openPeriod._id));
  });

  test('a site with no configured monthly amount is left alone', async () => {
    const { org, master } = await setupFixture({ defaultAllocationPaise: 0 });
    const results = await fundService.rolloverDueSites({ organizationId: org._id, userId: master._id });
    expect(results[0].outcome).toBe('SKIPPED_NO_MONTHLY_AMOUNT');
  });
});
