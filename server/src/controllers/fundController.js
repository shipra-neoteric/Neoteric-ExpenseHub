const FundAccount = require('../models/FundAccount');
const FundPeriod = require('../models/FundPeriod');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { rupeesToPaise, isValidPositivePaise } = require('../utils/money');
const { LEDGER_ENTRY_TYPE } = require('../config/constants');
const fundService = require('../services/fundService');
const cloudinary = require('../config/cloudinary');

const ALLOWED_PROOF_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

// Optional "payment proof" attached to a top-up — a screenshot/photo of the
// actual bank transfer, so there's evidence the money was really sent to the
// site, not just a system record. Returns null fields if no file was sent.
async function uploadProofIfPresent(file) {
  if (!file) return { proofUrl: null, proofPublicId: null };
  if (!ALLOWED_PROOF_MIME.has(file.mimetype)) {
    throw ApiError.badRequest('Unsupported file type. Use JPG, PNG, WEBP, or PDF.', 'UNSUPPORTED_MIME');
  }
  const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ resource_type: resourceType, folder: 'expensehub/fund-proofs' }, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
    stream.end(file.buffer);
  });
  return { proofUrl: result.secure_url, proofPublicId: result.public_id };
}

// One row per active site — remaining balance, pending, and how much needs
// to be transferred to bring the site back up to its standard monthly
// amount. Backs the "Monthly Transfers" page so Master/Finance can send
// every site's payment from one screen instead of switching the site
// dropdown on the regular Funds page one at a time.
const overview = asyncHandler(async (req, res) => {
  const [summary, transfers] = await Promise.all([
    fundService.buildMonthEndSummary({ organizationId: req.organizationId }),
    fundService.getRecentTransfers({ organizationId: req.organizationId }),
  ]);
  res.json({ ...summary, transfers });
});

const listPeriods = asyncHandler(async (req, res) => {
  const { siteId } = req.query;
  if (!siteId) throw ApiError.badRequest('siteId is required', 'SITE_ID_REQUIRED');
  const account = await FundAccount.findOne({ siteId, organizationId: req.organizationId });
  if (!account) return res.json({ items: [], fundAccount: null });
  const periods = await FundPeriod.find({ fundAccountId: account._id }).sort({ createdAt: -1 }).lean();
  res.json({ items: periods, fundAccount: account });
});

const getBalance = asyncHandler(async (req, res) => {
  const period = await FundPeriod.findById(req.params.periodId).lean();
  const [balance, standardAmountPaise] = await Promise.all([
    fundService.computeBalance(req.params.periodId),
    period ? fundService.getStandardAmountPaise(period.organizationId, period.siteId) : 0,
  ]);
  res.json({ balance, standardAmountPaise });
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
  const { proofUrl, proofPublicId } = await uploadProofIfPresent(req.file);
  const entry = await fundService.addLedgerMovement({
    organizationId: req.organizationId,
    siteId: period.siteId,
    fundPeriodId: period._id,
    type: LEDGER_ENTRY_TYPE.TOP_UP,
    amountPaise,
    reason: req.body.reason,
    userId: req.user._id,
    idempotencyKey: req.body.idempotencyKey,
    proofUrl,
    proofPublicId,
    paidToName: req.body.paidToName.trim(),
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

module.exports = { overview, listPeriods, getBalance, getLedger, openingAllocation, topUp, adjustment, closePeriod, reopenPeriod, runRollover };
