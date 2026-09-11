const Site = require('../models/Site');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getAccessibleSiteIds } = require('../middleware/siteScope');
const { buildReportData, toCsv, streamPdf } = require('../services/reportService');
const { recordAudit } = require('../services/auditService');

async function resolveScope(req) {
  const accessible = await getAccessibleSiteIds(req.user);
  const requested = req.query.siteId ? String(req.query.siteId).split(',') : accessible;
  const invalid = requested.filter((s) => !accessible.includes(s));
  if (invalid.length) throw ApiError.forbidden('You do not have access to one or more requested sites', 'SITE_ACCESS_DENIED');
  return requested;
}

async function buildFilters(req, siteIds) {
  const sites = await Site.find({ _id: { $in: siteIds } }).lean();
  const parts = [];
  if (req.query.dateFrom) parts.push(`from ${req.query.dateFrom}`);
  if (req.query.dateTo) parts.push(`to ${req.query.dateTo}`);
  if (req.query.status) parts.push(`status: ${req.query.status}`);
  if (req.query.category) parts.push(`category filtered`);
  return { siteNames: sites.map((s) => s.name), summary: parts.join(', ') };
}

const exportCsv = asyncHandler(async (req, res) => {
  const siteIds = await resolveScope(req);
  const data = await buildReportData({
    organizationId: req.organizationId,
    siteIds,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    category: req.query.category ? String(req.query.category).split(',') : undefined,
    status: req.query.status ? String(req.query.status).split(',') : undefined,
  });
  const csv = toCsv(data);
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'REPORT_EXPORT_CSV', entityType: 'Report', entityId: req.user._id, after: { siteIds, filters: req.query }, req });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="site-expenses-report.csv"');
  res.send(csv);
});

const exportPdf = asyncHandler(async (req, res) => {
  const siteIds = await resolveScope(req);
  const data = await buildReportData({
    organizationId: req.organizationId,
    siteIds,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    category: req.query.category ? String(req.query.category).split(',') : undefined,
    status: req.query.status ? String(req.query.status).split(',') : undefined,
  });
  const filters = await buildFilters(req, siteIds);
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'REPORT_EXPORT_PDF', entityType: 'Report', entityId: req.user._id, after: { siteIds, filters: req.query }, req });
  streamPdf(data, { title: 'Site Expenses Report', filters, generatedBy: req.user.name }, res);
});

const summary = asyncHandler(async (req, res) => {
  const siteIds = await resolveScope(req);
  const data = await buildReportData({
    organizationId: req.organizationId,
    siteIds,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    category: req.query.category ? String(req.query.category).split(',') : undefined,
    status: req.query.status ? String(req.query.status).split(',') : undefined,
  });
  res.json(data);
});

module.exports = { exportCsv, exportPdf, summary };
