const FundAccount = require('../models/FundAccount');
const FundPeriod = require('../models/FundPeriod');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { rupeesToPaise, isValidPositivePaise } = require('../utils/money');
const { LEDGER_ENTRY_TYPE } = require('../config/constants');
const fundService = require('../services/fundService');

const listPeriods = asyncHandler(async (req, res) => {
  const { siteId } = req.query;
  if (!siteId) throw ApiError.badRequest('siteId is required', 'SITE_ID_REQUIRED');
  const account = await FundAccount.findOne({ siteId, organizationId: req.organizationId });
  if (!account) return res.json({ items: [], fundAccount: null });
  const periods = await FundPeriod.find({ fundAccountId: account._id }).sort({ createdAt: -1 }).lean();
  res.json({ items: periods, fundAccount: account });
});

const getBalance = asyncHandler(async (req, res) => {
  const balance = await fundService.computeBalance(req.params.periodId);
  res.json({ balance });
});

const getLedger = asyncHandler(async (req, res) => {
  const entries = await FundLedgerEntry.find({ fundPeriodId: req.params.periodId })
    .sort({ postedAt: -1 })
    .populate('createdBy', 'name')
    .populate('relatedExpenseId', 'expenseNumber description')
    .lean();
  res.json({ items: entries });
});

const openingAllocation = asyncHandler(async (req, res) => {
  const amountPaise = rupeesToPaise(req.body.amount);
  if (!isValidPositivePaise(amountPaise)) throw ApiError.badRequest('Invalid amount', 'INVALID_AMOUNT');
  const period = await fundService.createOpeningAllocation({
    organizationId: req.organizationId,
    siteId: req.body.siteId,
    amountPaise,
    label: req.body.label,
    startDate: req.body.startDate || new Date(),
    userId: req.user._id,
    req,
  });
  res.status(201).json({ period });
});

const topUp = asyncHandler(async (req, res) => {
  const amountPaise = rupeesToPaise(req.body.amount);
  if (!isValidPositivePaise(amountPaise)) throw ApiError.badRequest('Invalid amount', 'INVALID_AMOUNT');
  const period = await FundPeriod.findById(req.params.periodId);
  if (!period) throw ApiError.notFound('Fund period not found');
  const entry = await fundService.addLedgerMovement({
    organizationId: req.organizationId,
    siteId: period.siteId,
    fundPeriodId: period._id,
    type: LEDGER_ENTRY_TYPE.TOP_UP,
    amountPaise,
    reason: req.body.reason,
    userId: req.user._id,
    idempotencyKey: req.body.idempotencyKey,
    req,
  });
  res.status(201).json({ entry });
});

const adjustment = asyncHandler(async (req, res) => {
  const raw = String(req.body.amount).trim();
  const negative = raw.startsWith('-');
  const amountPaise = rupeesToPaise(raw.replace('-', '')) * (negative ? -1 : 1);
  if (!Number.isInteger(amountPaise) || amountPaise === 0) throw ApiError.badRequest('Invalid amount', 'INVALID_AMOUNT');
  const period = await FundPeriod.findById(req.params.periodId);
  if (!period) throw ApiError.notFound('Fund period not found');
  const entry = await fundService.addLedgerMovement({
    organizationId: req.organizationId,
    siteId: period.siteId,
    fundPeriodId: period._id,
    type: LEDGER_ENTRY_TYPE.ADJUSTMENT,
    amountPaise,
    reason: req.body.reason,
    userId: req.user._id,
    req,
    requireNonNegativeResult: amountPaise < 0,
  });
  res.status(201).json({ entry });
});

const closePeriod = asyncHandler(async (req, res) => {
  const newPeriod = await fundService.closePeriod({
    fundPeriodId: req.params.periodId,
    userId: req.user._id,
    reason: req.body.reason,
    carryForward: req.body.carryForward,
    req,
  });
  res.json({ newPeriod });
});

const reopenPeriod = asyncHandler(async (req, res) => {
  const period = await fundService.reopenPeriod({ fundPeriodId: req.params.periodId, userId: req.user._id, req });
  res.json({ period });
});

// Manual equivalent of the scheduled trigger — lets Master run the monthly
// rollover on demand (e.g. to test it, or if the scheduled job hasn't fired
// yet) using their own normal session instead of the automation secret.
const runRollover = asyncHandler(async (req, res) => {
  const results = await fundService.rolloverDueSites({ organizationId: req.organizationId, userId: req.user._id });
  res.json({ results });
});

module.exports = { listPeriods, getBalance, getLedger, openingAllocation, topUp, adjustment, closePeriod, reopenPeriod, runRollover };
