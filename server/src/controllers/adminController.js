const asyncHandler = require('../utils/asyncHandler');
const monthlyRolloverJob = require('../services/monthlyRolloverJob');
const monthEndSummaryJob = require('../services/monthEndSummaryJob');

// Kept as a manual/external-cron entry point alongside the opportunistic
// in-app trigger in monthlyRolloverJob — handy for an on-demand run or a
// deployment that prefers an explicit scheduler.
const runMonthlyRolloverForAllOrganizations = asyncHandler(async (req, res) => {
  const result = await monthlyRolloverJob.runMonthlyRolloverForAllOrganizations();
  res.json(result);
});

// Kept as a manual/external-cron entry point alongside the opportunistic
// in-app trigger in monthEndSummaryJob — handy for an on-demand resend or a
// deployment that prefers an explicit scheduler. `?force=true` bypasses the
// last-day-of-month gate for testing.
const runMonthEndSummaryForAllOrganizations = asyncHandler(async (req, res) => {
  const result = await monthEndSummaryJob.runMonthEndSummaryForAllOrganizations({ force: req.query.force === 'true' });
  res.json(result);
});

module.exports = { runMonthlyRolloverForAllOrganizations, runMonthEndSummaryForAllOrganizations };
