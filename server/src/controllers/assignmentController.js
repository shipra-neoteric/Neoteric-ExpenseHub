const SiteUserAssignment = require('../models/SiteUserAssignment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../services/auditService');

const list = asyncHandler(async (req, res) => {
  const query = { organizationId: req.organizationId };
  if (req.query.userId) query.userId = req.query.userId;
  if (req.query.siteId) query.siteId = req.query.siteId;
  const items = await SiteUserAssignment.find(query).populate('userId', 'name email').populate('siteId', 'name code').sort({ createdAt: -1 }).lean();
  res.json({ items });
});

const create = asyncHandler(async (req, res) => {
  const existing = await SiteUserAssignment.findOne({ userId: req.body.userId, siteId: req.body.siteId });
  if (existing) {
    existing.isActive = true;
    existing.effectiveStart = req.body.effectiveStart || existing.effectiveStart;
    existing.effectiveEnd = req.body.effectiveEnd ?? null;
    await existing.save();
    await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'ASSIGNMENT_REACTIVATE', entityType: 'SiteUserAssignment', entityId: existing._id, after: existing.toObject(), req });
    return res.json({ assignment: existing });
  }
  const assignment = await SiteUserAssignment.create({
    organizationId: req.organizationId,
    userId: req.body.userId,
    siteId: req.body.siteId,
    effectiveStart: req.body.effectiveStart || new Date(),
    effectiveEnd: req.body.effectiveEnd || null,
    createdBy: req.user._id,
  });
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'ASSIGNMENT_CREATE', entityType: 'SiteUserAssignment', entityId: assignment._id, after: assignment.toObject(), req });
  res.status(201).json({ assignment });
});

// Removing an assignment blocks future access but preserves the historical
// authorship on past expenses (isActive:false, never deleted).
const deactivate = asyncHandler(async (req, res) => {
  const assignment = await SiteUserAssignment.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!assignment) throw ApiError.notFound('Assignment not found');
  const before = assignment.toObject();
  assignment.isActive = false;
  assignment.effectiveEnd = new Date();
  await assignment.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'ASSIGNMENT_DEACTIVATE', entityType: 'SiteUserAssignment', entityId: assignment._id, before, after: assignment.toObject(), req });
  res.json({ assignment });
});

module.exports = { list, create, deactivate };
