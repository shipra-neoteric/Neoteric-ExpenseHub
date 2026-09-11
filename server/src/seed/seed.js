require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, mongoose } = require('../config/db');
const Organization = require('../models/Organization');
const Site = require('../models/Site');
const User = require('../models/User');
const SiteUserAssignment = require('../models/SiteUserAssignment');
const ExpenseCategory = require('../models/ExpenseCategory');
const ExpensePolicy = require('../models/ExpensePolicy');
const { ROLE_PRESETS, PERMISSIONS, OVERDRAW_BEHAVIOR, PAYMENT_MODES } = require('../config/constants');
const { rupeesToPaise } = require('../utils/money');
const fundService = require('../services/fundService');
const expenseService = require('../services/expenseService');

const CATEGORY_SEED = [
  { name: 'Pantry & Refreshments', code: 'PANTRY', icon: 'Coffee', displayOrder: 1 },
  { name: 'Office Supplies & Stationery', code: 'STATIONERY', icon: 'Paperclip', displayOrder: 2 },
  { name: 'Celebrations & Gifts', code: 'CELEBRATIONS', icon: 'Gift', displayOrder: 3 },
  { name: 'Travel & Conveyance', code: 'TRAVEL', icon: 'Car', displayOrder: 4 },
  { name: 'Courier & Freight', code: 'COURIER', icon: 'Package', displayOrder: 5 },
  { name: 'Cleaning & Housekeeping', code: 'CLEANING', icon: 'Sparkles', displayOrder: 6 },
  { name: 'Repairs & Maintenance', code: 'REPAIRS', icon: 'Wrench', displayOrder: 7 },
  { name: 'Other', code: 'OTHER', icon: 'MoreHorizontal', displayOrder: 8 },
];

const SITE_SEED = [
  { code: 'SILVER-ESTATE', name: 'Silver Estate', salesOfficeLabel: 'Head Office Sales Desk' },
  { code: 'REGAL-GARDEN', name: 'Regal Garden', salesOfficeLabel: 'Sales Office' },
  { code: 'NATURE-PARK', name: 'Nature Park', salesOfficeLabel: 'Sales Office' },
  { code: 'GARDEN-CITY', name: 'Garden City', salesOfficeLabel: 'Sales Office' },
];

async function upsertUser({ organizationId, name, email, roleLabel, extraPermissions = [] }) {
  const permissions = Array.from(new Set([...(ROLE_PRESETS[roleLabel] || []), ...extraPermissions]));
  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
  return User.findOneAndUpdate(
    { organizationId, email },
    { $set: { name, roleLabel, permissions, isActive: true }, $setOnInsert: { organizationId, email, passwordHash } },
    { upsert: true, new: true }
  );
}

async function run() {
  await connectDB();

  const org = await Organization.findOneAndUpdate(
    { code: 'NEOTERIC' },
    { $setOnInsert: { code: 'NEOTERIC', name: 'Neoteric Properties', isActive: true } },
    { upsert: true, new: true }
  );

  const master = await upsertUser({ organizationId: org._id, name: 'Master Admin', email: 'master@neoteric.test', roleLabel: 'MASTER_ADMIN' });
  const frontDesk = await upsertUser({ organizationId: org._id, name: 'Priya (Front Desk)', email: 'frontdesk.silver@neoteric.test', roleLabel: 'FRONT_DESK_EXECUTIVE' });
  const approver = await upsertUser({ organizationId: org._id, name: 'Rahul (Site Approver)', email: 'approver.silver@neoteric.test', roleLabel: 'SITE_APPROVER' });
  await upsertUser({ organizationId: org._id, name: 'Anita (Finance)', email: 'finance@neoteric.test', roleLabel: 'FINANCE', extraPermissions: [PERMISSIONS.VIEW_ALL_SITES] });

  const sites = {};
  for (const s of SITE_SEED) {
    sites[s.code] = await Site.findOneAndUpdate(
      { organizationId: org._id, code: s.code },
      { $setOnInsert: { ...s, organizationId: org._id, status: 'ACTIVE', createdBy: master._id, updatedBy: master._id } },
      { upsert: true, new: true }
    );
  }
  const silverEstate = sites['SILVER-ESTATE'];

  for (const c of CATEGORY_SEED) {
    await ExpenseCategory.findOneAndUpdate(
      { organizationId: org._id, code: c.code },
      { $setOnInsert: { ...c, organizationId: org._id, normalizedName: c.name.toLowerCase(), isActive: true, createdBy: master._id, updatedBy: master._id } },
      { upsert: true, new: true }
    );
  }
  const pantryCategory = await ExpenseCategory.findOne({ organizationId: org._id, code: 'PANTRY' });
  const celebrationsCategory = await ExpenseCategory.findOne({ organizationId: org._id, code: 'CELEBRATIONS' });
  const travelCategory = await ExpenseCategory.findOne({ organizationId: org._id, code: 'TRAVEL' });

  await ExpensePolicy.findOneAndUpdate(
    { organizationId: org._id, siteId: null },
    {
      $setOnInsert: {
        organizationId: org._id,
        siteId: null,
        defaultAllocationPaise: rupeesToPaise('10000'),
        overdrawBehavior: OVERDRAW_BEHAVIOR.BLOCK,
        receiptRequiredThresholdPaise: null,
        backdateLimitDays: 45,
        allowedPaymentModes: PAYMENT_MODES,
        allowSelfApproval: false,
        updatedBy: master._id,
      },
    },
    { upsert: true, new: true }
  );
  // A site-level policy document fully overrides the org default (no field
  // merging), so it must restate every field it needs, not just the delta.
  await ExpensePolicy.findOneAndUpdate(
    { organizationId: org._id, siteId: silverEstate._id },
    {
      $setOnInsert: {
        organizationId: org._id,
        siteId: silverEstate._id,
        defaultAllocationPaise: rupeesToPaise('10000'),
        overdrawBehavior: OVERDRAW_BEHAVIOR.BLOCK,
        receiptRequiredThresholdPaise: null,
        backdateLimitDays: 45,
        allowedPaymentModes: PAYMENT_MODES,
        allowSelfApproval: false,
        approverUserIds: [approver._id],
        updatedBy: master._id,
      },
    },
    { upsert: true, new: true }
  );

  await SiteUserAssignment.findOneAndUpdate(
    { userId: frontDesk._id, siteId: silverEstate._id },
    { $setOnInsert: { organizationId: org._id, userId: frontDesk._id, siteId: silverEstate._id, isActive: true, createdBy: master._id } },
    { upsert: true, new: true }
  );
  await SiteUserAssignment.findOneAndUpdate(
    { userId: approver._id, siteId: silverEstate._id },
    { $setOnInsert: { organizationId: org._id, userId: approver._id, siteId: silverEstate._id, isActive: true, createdBy: master._id } },
    { upsert: true, new: true }
  );

  // Reconcile the actual Silver Estate sheet (20 Aug 2026 - Sep 2026): only if
  // no fund account exists yet for this site, so re-running seed is idempotent.
  const existingAccount = await fundService.getActiveFundAccount(silverEstate._id, org._id);
  if (!existingAccount) {
    const period = await fundService.createOpeningAllocation({
      organizationId: org._id,
      siteId: silverEstate._id,
      amountPaise: rupeesToPaise('10000'),
      label: '2026-08-Silver-Estate',
      startDate: new Date('2026-08-20'),
      userId: master._id,
    });

    const rows = [
      { categoryId: pantryCategory._id, description: 'Office Supplies / Pantry', amount: '4064.00', date: '2026-08-25' },
      { categoryId: celebrationsCategory._id, description: 'Celebrations & Gifts', amount: '300.00', date: '2026-08-28' },
      { categoryId: travelCategory._id, description: 'Travel & Conveyance', amount: '1153.00', date: '2026-09-02' },
    ];
    for (const row of rows) {
      const draft = await expenseService.createDraft({
        organizationId: org._id,
        siteId: silverEstate._id,
        userId: frontDesk._id,
        payload: {
          expenseDate: new Date(row.date),
          categoryId: row.categoryId,
          description: row.description,
          amountPaise: rupeesToPaise(row.amount),
          paymentMode: 'CASH',
          paidByUserId: frontDesk._id,
        },
      });
      const submitted = await expenseService.submitExpense({ expense: draft, userId: frontDesk._id });
      await expenseService.approveExpense({ expenseId: submitted._id, userId: approver._id });
    }

    const balance = await fundService.computeBalance(period._id);
    console.log('[seed] Silver Estate reconciliation:', balance);
    console.log('[seed] Expected: funded 1000000 paise, approvedSpend 551700 paise, available 448300 paise');
  } else {
    console.log('[seed] Silver Estate fund account already exists, skipping historical import.');
  }

  console.log('[seed] Done. Test accounts (password: ChangeMe123!):');
  console.log('  master@neoteric.test (Master Admin)');
  console.log('  frontdesk.silver@neoteric.test (Front Desk Executive - Silver Estate)');
  console.log('  approver.silver@neoteric.test (Site Approver - Silver Estate)');
  console.log('  finance@neoteric.test (Finance - all sites)');

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
