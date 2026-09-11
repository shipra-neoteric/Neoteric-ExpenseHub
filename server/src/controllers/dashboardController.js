const FundAccount = require('../models/FundAccount');
const FundPeriod = require('../models/FundPeriod');
const Expense = require('../models/Expense');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const fundService = require('../services/fundService');
const { EXPENSE_STATUS } = require('../config/constants');

const summary = asyncHandler(async (req, res) => {
  const { siteId, periodId } = req.query;
  if (!siteId) throw ApiError.badRequest('siteId is required', 'SITE_ID_REQUIRED');

  const account = await FundAccount.findOne({ siteId, organizationId: req.organizationId });
  if (!account) {
    return res.json({ hasFund: false });
  }
  const period = periodId
    ? await FundPeriod.findOne({ _id: periodId, fundAccountId: account._id })
    : await fundService.getOpenPeriod(account._id);
  if (!period) {
    return res.json({ hasFund: true, hasOpenPeriod: false, fundAccountId: account._id });
  }

  const balance = await fundService.computeBalance(period._id);

  const missingReceiptsAgg = await Expense.aggregate([
    { $match: { fundPeriodId: period._id, status: { $in: [EXPENSE_STATUS.PENDING_APPROVAL, EXPENSE_STATUS.APPROVED] } } },
    {
      $lookup: {
        from: 'expenseattachments',
        let: { eid: '$_id' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$expenseId', '$$eid'] }, { $eq: ['$removedAt', null] }] } } }],
        as: 'attachments',
      },
    },
    { $match: { attachments: { $size: 0 } } },
    { $count: 'count' },
  ]);
  const missingReceipts = missingReceiptsAgg[0]?.count || 0;

  const statusCounts = await Expense.aggregate([
    { $match: { fundPeriodId: period._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  res.json({
    hasFund: true,
    hasOpenPeriod: true,
    period,
    balance,
    missingReceipts,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
  });
});

module.exports = { summary };
