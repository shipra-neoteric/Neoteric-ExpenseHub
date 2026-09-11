const FundPeriod = require('../models/FundPeriod');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getAccessibleSiteIds } = require('./siteScope');

// Loads the fund period named by :periodId and verifies the caller may act on
// its site, without leaking whether the period exists to an unauthorized user.
const requireFundPeriodSiteAccess = asyncHandler(async (req, res, next) => {
  const period = await FundPeriod.findOne({ _id: req.params.periodId, organizationId: req.organizationId });
  if (!period) throw ApiError.notFound('Fund period not found');
  const accessible = await getAccessibleSiteIds(req.user);
  if (!accessible.includes(String(period.siteId))) throw ApiError.forbidden('You do not have access to this site', 'SITE_ACCESS_DENIED');
  req.fundPeriod = period;
  next();
});

module.exports = { requireFundPeriodSiteAccess };
