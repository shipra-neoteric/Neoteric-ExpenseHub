const Organization = require('../models/Organization');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const fundService = require('../services/fundService');
const { PERMISSIONS } = require('../config/constants');

// No human is logged in for the scheduled trigger, so ledger/audit entries
// created by the rollover need some real User to attribute to. Using the
// org's own first active Master Admin keeps that attribution meaningful
// (an org's Master is the one who effectively configured the monthly
// amount that's being applied) rather than inventing a fake system user.
async function systemActorFor(organizationId) {
  return User.findOne({ organizationId, isActive: true, permissions: PERMISSIONS.MASTER_MANAGE });
}

const runMonthlyRolloverForAllOrganizations = asyncHandler(async (req, res) => {
  const organizations = await Organization.find({ isActive: true }).lean();
  const report = [];
  for (const org of organizations) {
    const actor = await systemActorFor(org._id);
    if (!actor) {
      report.push({ organization: org.name, error: 'No active Master Admin to attribute the rollover to' });
      continue;
    }
    const results = await fundService.rolloverDueSites({ organizationId: org._id, userId: actor._id });
    report.push({ organization: org.name, results });
  }
  res.json({ report });
});

module.exports = { runMonthlyRolloverForAllOrganizations };
