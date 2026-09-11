const SiteUserAssignment = require('../models/SiteUserAssignment');
const Site = require('../models/Site');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { PERMISSIONS } = require('../config/constants');

// Returns the list of active site IDs (strings) a user may act on right now.
// Users with VIEW_ALL_SITES bypass the assignment table and get every active
// site in their organization.
async function getAccessibleSiteIds(user) {
  if (user.hasPermission(PERMISSIONS.VIEW_ALL_SITES)) {
    const sites = await Site.find({ organizationId: user.organizationId, status: 'ACTIVE' }, { _id: 1 }).lean();
    return sites.map((s) => String(s._id));
  }
  const now = new Date();
  const assignments = await SiteUserAssignment.find({
    userId: user._id,
    isActive: true,
    effectiveStart: { $lte: now },
    $or: [{ effectiveEnd: null }, { effectiveEnd: { $gte: now } }],
  }).lean();
  return assignments.map((a) => String(a.siteId));
}

// Middleware factory: `extractSiteId(req)` returns the site id being acted on.
// Rejects with 403 (never leaking whether the site exists) if not accessible.
function requireSiteAccess(extractSiteId) {
  return asyncHandler(async (req, res, next) => {
    const siteId = extractSiteId(req);
    if (!siteId) throw ApiError.badRequest('siteId is required', 'SITE_ID_REQUIRED');
    const accessible = await getAccessibleSiteIds(req.user);
    if (!accessible.includes(String(siteId))) {
      throw ApiError.forbidden('You do not have access to this site', 'SITE_ACCESS_DENIED');
    }
    req.accessibleSiteIds = accessible;
    next();
  });
}

module.exports = { getAccessibleSiteIds, requireSiteAccess };
