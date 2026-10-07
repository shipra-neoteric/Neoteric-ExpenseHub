const Organization = require('../models/Organization');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const fundService = require('../services/fundService');
const slackService = require('../services/slackService');
const env = require('../config/env');
const { PERMISSIONS } = require('../config/constants');

// The external scheduler hits this once a day (same as monthly-rollover),
// but the summary should only actually go out on the last calendar day of
// the month — so this is the one check that decides whether "today" counts,
// independent of whatever time of day the scheduler happens to run at.
function isLastDayOfMonth(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

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

const runMonthEndSummaryForAllOrganizations = asyncHandler(async (req, res) => {
  const now = new Date();
  if (!isLastDayOfMonth(now) && req.query.force !== 'true') {
    return res.json({ skipped: true, reason: 'NOT_LAST_DAY_OF_MONTH' });
  }
  if (!env.monthEndSummarySlackEmail) {
    return res.json({ skipped: true, reason: 'NO_RECIPIENT_CONFIGURED' });
  }

  const organizations = await Organization.find({ isActive: true }).lean();
  const report = [];
  for (const org of organizations) {
    const summary = await fundService.buildMonthEndSummary({ organizationId: org._id, now });
    const result = await slackService.sendMonthEndSummary({ summary, recipientEmail: env.monthEndSummarySlackEmail });
    report.push({ organization: org.name, summary, result });
  }
  res.json({ report });
});

module.exports = { runMonthlyRolloverForAllOrganizations, runMonthEndSummaryForAllOrganizations };
