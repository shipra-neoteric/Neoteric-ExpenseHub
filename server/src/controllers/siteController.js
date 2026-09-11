const Site = require('../models/Site');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getAccessibleSiteIds } = require('../middleware/siteScope');
const { recordAudit } = require('../services/auditService');

// Sites the current user may select in the dashboard (their assignments, or
// all sites if they hold view_all_sites / master permissions).
const listMine = asyncHandler(async (req, res) => {
  const ids = await getAccessibleSiteIds(req.user);
  const sites = await Site.find({ _id: { $in: ids }, organizationId: req.organizationId, status: 'ACTIVE' }).sort({ name: 1 }).lean();
  res.json({ items: sites });
});

// Full list for Master screens, including inactive sites (never hard-deleted).
const listAll = asyncHandler(async (req, res) => {
  const sites = await Site.find({ organizationId: req.organizationId }).sort({ name: 1 }).lean();
  res.json({ items: sites });
});

const create = asyncHandler(async (req, res) => {
  const code = req.body.code.trim().toUpperCase();
  const existing = await Site.findOne({ organizationId: req.organizationId, code });
  if (existing) throw ApiError.conflict('A site with this code already exists', 'DUPLICATE_CODE');
  const site = await Site.create({
    organizationId: req.organizationId,
    code,
    name: req.body.name.trim(),
    salesOfficeLabel: req.body.salesOfficeLabel || '',
    status: req.body.status || 'ACTIVE',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'SITE_CREATE', entityType: 'Site', entityId: site._id, after: site.toObject(), req });
  res.status(201).json({ site });
});

const update = asyncHandler(async (req, res) => {
  const site = await Site.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!site) throw ApiError.notFound('Site not found');
  const before = site.toObject();
  if (req.body.name) site.name = req.body.name.trim();
  if (req.body.salesOfficeLabel !== undefined) site.salesOfficeLabel = req.body.salesOfficeLabel;
  if (req.body.status) site.status = req.body.status; // deactivate instead of delete
  site.updatedBy = req.user._id;
  await site.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'SITE_UPDATE', entityType: 'Site', entityId: site._id, before, after: site.toObject(), req });
  res.json({ site });
});

module.exports = { listMine, listAll, create, update };
