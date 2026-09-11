const db = require('../helpers/db');
const Organization = require('../../src/models/Organization');
const Site = require('../../src/models/Site');
const User = require('../../src/models/User');
const ExpenseCategory = require('../../src/models/ExpenseCategory');
const fundService = require('../../src/services/fundService');
const importService = require('../../src/services/importService');

beforeAll(async () => db.connect());
afterAll(async () => db.disconnect());
afterEach(async () => db.clearDatabase());

// Reconstructs the actual Silver Estate sheet described in the spec: mixed
// date formats, a blank-amount "Kitchen Expense" row, and a stray invalid
// line ("b") that must never be silently turned into a fabricated expense.
const SILVER_ESTATE_CSV = [
  'site,expenseDate,category,description,amount',
  'SILVER-ESTATE,20/08/2026,Pantry & Refreshments,Office Supplies / Pantry,4064.00',
  'SILVER-ESTATE,28/08/2026,Celebrations & Gifts,Celebrations and gifts,300.00',
  'SILVER-ESTATE,2026-09-02,Travel & Conveyance,Travel and conveyance,1153.00',
  'SILVER-ESTATE,7/9/2026,Kitchen Expense,Kitchen Expense,',
  'b',
].join('\n');

async function setupFixture() {
  const org = await Organization.create({ name: 'Neoteric Properties', code: 'NEOTERIC' });
  const site = await Site.create({ organizationId: org._id, code: 'SILVER-ESTATE', name: 'Silver Estate' });
  await ExpenseCategory.create({ organizationId: org._id, name: 'Pantry & Refreshments', normalizedName: 'pantry & refreshments', code: 'PANTRY' });
  await ExpenseCategory.create({ organizationId: org._id, name: 'Celebrations & Gifts', normalizedName: 'celebrations & gifts', code: 'CELEBRATIONS' });
  await ExpenseCategory.create({ organizationId: org._id, name: 'Travel & Conveyance', normalizedName: 'travel & conveyance', code: 'TRAVEL' });
  const master = await User.create({ organizationId: org._id, name: 'Master', email: 'master@test.com', passwordHash: 'x', roleLabel: 'MASTER_ADMIN', permissions: ['site_expense.master_manage'] });
  const period = await fundService.createOpeningAllocation({ organizationId: org._id, siteId: site._id, amountPaise: 1000000, label: 'TEST', startDate: new Date('2026-08-01'), userId: master._id });
  return { org, site, master, period };
}

describe('legacy sheet import', () => {
  test('dry-run reports accepted/rejected rows without writing anything', async () => {
    const { org } = await setupFixture();
    const result = await importService.dryRun({ organizationId: org._id, fileBuffer: Buffer.from(SILVER_ESTATE_CSV) });

    expect(result.accepted).toHaveLength(3);
    expect(result.rejected).toHaveLength(2);
    expect(result.acceptedTotalPaise).toBe(551700);

    const kitchenRow = result.rejected.find((r) => r.raw.description === 'Kitchen Expense');
    expect(kitchenRow.errors.join(' ')).toMatch(/amount/i);

    const strayRow = result.rejected.find((r) => r.raw.site === 'b');
    expect(strayRow.errors.length).toBeGreaterThan(0);
  });

  test('commit posts only the valid rows and reconciles to the Silver Estate numbers', async () => {
    const { org, master, period } = await setupFixture();
    const summary = await importService.commit({ organizationId: org._id, fileBuffer: Buffer.from(SILVER_ESTATE_CSV), userId: master._id });

    expect(summary.imported).toBe(3);
    expect(summary.rejected).toBe(2);
    expect(summary.importedTotalPaise).toBe(551700);

    const balance = await fundService.computeBalance(period._id);
    expect(balance.funded).toBe(1000000);
    expect(balance.approvedSpend).toBe(551700);
    expect(balance.available).toBe(448300);
  });

  test('re-committing the same file is idempotent and does not double-post', async () => {
    const { org, master, period } = await setupFixture();
    await importService.commit({ organizationId: org._id, fileBuffer: Buffer.from(SILVER_ESTATE_CSV), userId: master._id });
    const second = await importService.commit({ organizationId: org._id, fileBuffer: Buffer.from(SILVER_ESTATE_CSV), userId: master._id });

    expect(second.imported).toBe(0);
    expect(second.alreadyImported).toBe(3);

    const balance = await fundService.computeBalance(period._id);
    expect(balance.available).toBe(448300);
  });
});
