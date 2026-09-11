const ExpensePolicy = require('../models/ExpensePolicy');
const asyncHandler = require('../utils/asyncHandler');
const { rupeesToPaise } = require('../utils/money');
const { recordAudit } = require('../services/auditService');

// siteId=null in the URL (or omitted) targets the organization-wide default policy.
const getOne = asyncHandler(async (req, res) => {
  const siteId = req.query.siteId || null;
  const policy = await ExpensePolicy.findOne({ organizationId: req.organizationId, siteId });
  res.json({ policy });
});

const upsert = asyncHandler(async (req, res) => {
  const siteId = req.body.siteId || null;
  const before = await ExpensePolicy.findOne({ organizationId: req.organizationId, siteId }).lean();

  const update = { updatedBy: req.user._id };
  if (req.body.defaultAllocationAmount !== undefined) update.defaultAllocationPaise = rupeesToPaise(req.body.defaultAllocationAmount);
  if (req.body.overdrawBehavior) update.overdrawBehavior = req.body.overdrawBehavior;
  if (req.body.receiptRequiredThresholdAmount !== undefined) update.receiptRequiredThresholdPaise = rupeesToPaise(req.body.receiptRequiredThresholdAmount);
  if (req.body.backdateLimitDays !== undefined) update.backdateLimitDays = req.body.backdateLimitDays;
  if (req.body.allowedPaymentModes) update.allowedPaymentModes = req.body.allowedPaymentModes;
  if (req.body.approverUserIds) update.approverUserIds = req.body.approverUserIds;
  if (req.body.allowSelfApproval !== undefined) update.allowSelfApproval = req.body.allowSelfApproval;

  const policy = await ExpensePolicy.findOneAndUpdate(
    { organizationId: req.organizationId, siteId },
    { $set: update, $setOnInsert: { organizationId: req.organizationId, siteId } },
    { new: true, upsert: true }
  );
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'POLICY_UPSERT', entityType: 'ExpensePolicy', entityId: policy._id, before, after: policy.toObject(), req });
  res.json({ policy });
});

module.exports = { getOne, upsert };
