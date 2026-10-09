const asyncHandler = require('../utils/asyncHandler');
const monthlyRolloverJob = require('../services/monthlyRolloverJob');
const monthEndSummaryJob = require('../services/monthEndSummaryJob');

// Manual/external-cron entry point only — the automatic in-app trigger was
// removed (see app.js) now that Finance sends each site's top-up by hand via
// the Monthly Transfers page. Still here for whoever wants to run it
// on-demand, or wire up an external scheduler.
const runMonthlyRolloverForAllOrganizations = asyncHandler(async (req, res) => {
  const result = await monthlyRolloverJob.runMonthlyRolloverForAllOrganizations();
  res.json(result);
});

// Kept as a manual/external-cron entry point alongside the opportunistic
// in-app trigger in monthEndSummaryJob — handy for an on-demand resend or a
// deployment that prefers an explicit scheduler. `?force=true` bypasses the
// last-day-of-month gate for testing.
const runMonthEndSummaryForAllOrganizations = asyncHandler(async (req, res) => {
  const result = await monthEndSummaryJob.runMonthEndSummaryForAllOrganizations({
    force: req.query.force === 'true',
    siteName: req.query.site || null,
  });
  res.json(result);
});

module.exports = {
  runMonthlyRolloverForAllOrganizations,
  runMonthEndSummaryForAllOrganizations,
};
