const asyncHandler = require('../utils/asyncHandler');
const monthlyRolloverJob = require('../services/monthlyRolloverJob');
const monthEndSummaryJob = require('../services/monthEndSummaryJob');
const Site = require('../models/Site');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const fundService = require('../services/fundService');
const ApiError = require('../utils/ApiError');

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

// One-time cleanup for the Garden City rollover that ran before the
// top-up-cap fix (29d2d84) was deployed: it stacked a full Rs. 8,000 top-up
// on top of a Rs. 1,498.56 carry-forward instead of only covering the gap.
// A compensating ADJUSTMENT was applied by hand afterwards to correct the
// *available* balance, but that left "Total Funded" overstated by the same
// Rs. 1,498.56, since a negative ADJUSTMENT doesn't count against funded by
// design. This corrects the TOP_UP entry itself to what it should have been
// and removes the now-redundant compensating adjustment, so both Total
// Funded and Available read correctly. Safe to call only once — it no-ops
// (404) once the TOP_UP entry it's looking for no longer has the stale
// amount.
const fixGardenCityOctoberTopUp = asyncHandler(async (req, res) => {
  const site = await Site.findOne({ name: 'Garden City' });
  if (!site) throw ApiError.notFound('Garden City site not found');
  const account = await fundService.getActiveFundAccount(site._id, site.organizationId);
  const period = account && (await fundService.getOpenPeriod(account._id));
  if (!period) throw ApiError.notFound('No open fund period for Garden City');

  const topUp = await FundLedgerEntry.findOne({ fundPeriodId: period._id, type: 'TOP_UP', amountPaise: 800000 });
  if (!topUp) return res.json({ skipped: true, reason: 'ALREADY_FIXED_OR_NOT_FOUND' });

  topUp.amountPaise = 650144;
  await topUp.save();
  await FundLedgerEntry.deleteOne({
    fundPeriodId: period._id,
    type: 'ADJUSTMENT',
    reason: 'Correcting rollover double-count — ran before top-up-cap fix was deployed',
  });

  const balance = await fundService.computeBalance(period._id);
  res.json({ fixed: true, balance });
});

module.exports = { runMonthlyRolloverForAllOrganizations, runMonthEndSummaryForAllOrganizations, fixGardenCityOctoberTopUp };
