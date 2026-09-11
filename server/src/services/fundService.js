const mongoose = require('mongoose');
const FundAccount = require('../models/FundAccount');
const FundPeriod = require('../models/FundPeriod');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const Expense = require('../models/Expense');
const ApiError = require('../utils/ApiError');
const { LEDGER_ENTRY_TYPE, FUND_PERIOD_STATUS, EXPENSE_STATUS } = require('../config/constants');
const { recordAudit } = require('./auditService');

const FUNDED_TYPES = [LEDGER_ENTRY_TYPE.OPENING_ALLOCATION, LEDGER_ENTRY_TYPE.TOP_UP, LEDGER_ENTRY_TYPE.CARRY_FORWARD];

// Single source of truth for balances: everything is derived from the
// append-only ledger + live expense statuses, never from a stored running total.
async function computeBalance(fundPeriodId) {
  const rows = await FundLedgerEntry.aggregate([
    { $match: { fundPeriodId: new mongoose.Types.ObjectId(fundPeriodId) } },
    { $group: { _id: '$type', total: { $sum: '$amountPaise' }, positiveTotal: { $sum: { $cond: [{ $gt: ['$amountPaise', 0] }, '$amountPaise', 0] } } } },
  ]);

  let available = 0;
  let funded = 0;
  let postedSpend = 0;
  let reversed = 0;

  for (const row of rows) {
    available += row.total;
    if (FUNDED_TYPES.includes(row._id)) funded += row.total;
    if (row._id === LEDGER_ENTRY_TYPE.ADJUSTMENT) funded += row.positiveTotal;
    if (row._id === LEDGER_ENTRY_TYPE.EXPENSE_POSTED) postedSpend += -row.total;
    if (row._id === LEDGER_ENTRY_TYPE.EXPENSE_REVERSAL) reversed += row.total;
  }
  const approvedSpend = postedSpend - reversed;

  const pendingAgg = await Expense.aggregate([
    { $match: { fundPeriodId: new mongoose.Types.ObjectId(fundPeriodId), status: EXPENSE_STATUS.PENDING_APPROVAL } },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } },
  ]);
  const pending = pendingAgg[0]?.total || 0;

  return {
    funded,
    approvedSpend,
    available,
    pending,
    projectedAvailable: available - pending,
  };
}

async function getActiveFundAccount(siteId, organizationId) {
  let account = await FundAccount.findOne({ siteId, organizationId, status: 'ACTIVE' });
  return account;
}

async function getOpenPeriod(fundAccountId) {
  return FundPeriod.findOne({ fundAccountId, status: { $in: [FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED] } });
}

async function createOpeningAllocation({ organizationId, siteId, amountPaise, label, startDate, userId, req }) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw ApiError.badRequest('Opening allocation must be a positive amount', 'INVALID_AMOUNT');
  }
  const session = await mongoose.startSession();
  try {
    let period;
    await session.withTransaction(async () => {
      let account = await FundAccount.findOne({ siteId, organizationId, status: 'ACTIVE' }).session(session);
      if (!account) {
        [account] = await FundAccount.create([{ organizationId, siteId, createdBy: userId }], { session });
      }
      const existingOpen = await FundPeriod.findOne({
        fundAccountId: account._id,
        status: { $in: [FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED] },
      }).session(session);
      if (existingOpen) {
        throw ApiError.conflict('An open fund period already exists for this site. Close it before opening a new one.', 'PERIOD_ALREADY_OPEN');
      }
      [period] = await FundPeriod.create(
        [{ organizationId, siteId, fundAccountId: account._id, label, startDate, status: FUND_PERIOD_STATUS.OPEN, openedBy: userId }],
        { session }
      );
      await FundLedgerEntry.create(
        [
          {
            organizationId,
            siteId,
            fundAccountId: account._id,
            fundPeriodId: period._id,
            type: LEDGER_ENTRY_TYPE.OPENING_ALLOCATION,
            amountPaise,
            createdBy: userId,
          },
        ],
        { session }
      );
      await recordAudit({
        organizationId,
        actorId: userId,
        action: 'FUND_OPENING_ALLOCATION',
        entityType: 'FundPeriod',
        entityId: period._id,
        after: { amountPaise, label },
        req,
        session,
      });
    });
    return period;
  } finally {
    session.endSession();
  }
}

async function addLedgerMovement({ organizationId, siteId, fundPeriodId, type, amountPaise, reason, userId, idempotencyKey, req, requireNonNegativeResult = false }) {
  const session = await mongoose.startSession();
  try {
    let entry;
    await session.withTransaction(async () => {
      const period = await FundPeriod.findById(fundPeriodId).session(session);
      if (!period) throw ApiError.notFound('Fund period not found');
      if (![FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED].includes(period.status)) {
        throw ApiError.conflict('Fund period is closed', 'PERIOD_CLOSED');
      }
      if (idempotencyKey) {
        const dupe = await FundLedgerEntry.findOne({ idempotencyKey }).session(session);
        if (dupe) {
          entry = dupe;
          return;
        }
      }
      if (requireNonNegativeResult) {
        const balance = await computeBalance(fundPeriodId);
        if (balance.available + amountPaise < 0) {
          throw ApiError.conflict('This adjustment would make the available balance negative', 'INSUFFICIENT_BALANCE');
        }
      }
      const [created] = await FundLedgerEntry.create(
        [{ organizationId, siteId, fundAccountId: period.fundAccountId, fundPeriodId, type, amountPaise, reason, createdBy: userId, idempotencyKey }],
        { session }
      );
      entry = created;
      await recordAudit({
        organizationId,
        actorId: userId,
        action: `FUND_${type}`,
        entityType: 'FundLedgerEntry',
        entityId: entry._id,
        after: { amountPaise, reason },
        reason,
        req,
        session,
      });
    });
    return entry;
  } finally {
    session.endSession();
  }
}

async function closePeriod({ fundPeriodId, userId, reason, carryForward, req }) {
  const session = await mongoose.startSession();
  try {
    let newPeriod = null;
    await session.withTransaction(async () => {
      const period = await FundPeriod.findById(fundPeriodId).session(session);
      if (!period) throw ApiError.notFound('Fund period not found');
      if (![FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED].includes(period.status)) {
        throw ApiError.conflict('Fund period is already closed', 'PERIOD_ALREADY_CLOSED');
      }
      const pendingCount = await Expense.countDocuments({
        fundPeriodId,
        status: { $in: [EXPENSE_STATUS.PENDING_APPROVAL, EXPENSE_STATUS.RETURNED] },
      }).session(session);
      if (pendingCount > 0) {
        throw ApiError.conflict('Cannot close a period with pending or returned expenses', 'PENDING_ITEMS_EXIST');
      }
      const balance = await computeBalance(fundPeriodId);
      period.status = FUND_PERIOD_STATUS.CLOSED;
      period.closedBy = userId;
      period.closedAt = new Date();
      period.endDate = new Date();
      period.reconciliationNotes = reason || '';
      await period.save({ session });

      if (carryForward && balance.available > 0) {
        const nextLabel = `${period.label}-CF`;
        [newPeriod] = await FundPeriod.create(
          [
            {
              organizationId: period.organizationId,
              siteId: period.siteId,
              fundAccountId: period.fundAccountId,
              label: nextLabel,
              startDate: new Date(),
              status: FUND_PERIOD_STATUS.OPEN,
              carryForwardFromPeriodId: period._id,
              openedBy: userId,
            },
          ],
          { session }
        );
        await FundLedgerEntry.create(
          [
            {
              organizationId: period.organizationId,
              siteId: period.siteId,
              fundAccountId: period.fundAccountId,
              fundPeriodId: newPeriod._id,
              type: LEDGER_ENTRY_TYPE.CARRY_FORWARD,
              amountPaise: balance.available,
              reason: `Carried forward from ${period.label}`,
              createdBy: userId,
            },
          ],
          { session }
        );
      }
      await recordAudit({
        organizationId: period.organizationId,
        actorId: userId,
        action: 'FUND_PERIOD_CLOSE',
        entityType: 'FundPeriod',
        entityId: period._id,
        after: { reason, carryForward, availableAtClose: balance.available },
        reason,
        req,
        session,
      });
    });
    return newPeriod;
  } finally {
    session.endSession();
  }
}

async function reopenPeriod({ fundPeriodId, userId, req }) {
  const period = await FundPeriod.findById(fundPeriodId);
  if (!period) throw ApiError.notFound('Fund period not found');
  if (period.status !== FUND_PERIOD_STATUS.CLOSED) {
    throw ApiError.conflict('Only a closed period can be reopened', 'PERIOD_NOT_CLOSED');
  }
  period.status = FUND_PERIOD_STATUS.REOPENED;
  period.reopenedBy = userId;
  period.reopenedAt = new Date();
  await period.save();
  await recordAudit({
    organizationId: period.organizationId,
    actorId: userId,
    action: 'FUND_PERIOD_REOPEN',
    entityType: 'FundPeriod',
    entityId: period._id,
    req,
  });
  return period;
}

module.exports = {
  computeBalance,
  getActiveFundAccount,
  getOpenPeriod,
  createOpeningAllocation,
  addLedgerMovement,
  closePeriod,
  reopenPeriod,
};
