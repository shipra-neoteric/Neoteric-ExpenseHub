const asyncHandler = require('../utils/asyncHandler');
const monthlyRolloverJob = require('../services/monthlyRolloverJob');
const monthEndSummaryJob = require('../services/monthEndSummaryJob');
const Site = require('../models/Site');
const User = require('../models/User');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const fundService = require('../services/fundService');
const ApiError = require('../utils/ApiError');
const { PERMISSIONS } = require('../config/constants');

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

// Generic version of the Garden City fix above, for any site whose rollover
// ran before the top-up-cap fix was deployed and so stacked (or
// under-covered) its top-up instead of exactly bridging carry-forward up to
// the standard monthly amount. Recomputes what the TOP_UP entry for the
// site's *current open period* should have been from its actual
// carry-forward and the site's policy, then corrects that entry in place
// (creating one if none exists, deleting it if the correct amount is zero).
// Safe to call repeatedly — a site already at its standard amount is
// reported as already-correct and left untouched.
const reconcileSiteTopUp = asyncHandler(async (req, res) => {
  const { site: siteName } = req.query;
  if (!siteName) throw ApiError.badRequest('site query param is required', 'SITE_REQUIRED');
  const site = await Site.findOne({ name: siteName });
  if (!site) throw ApiError.notFound(`Site "${siteName}" not found`);

  const account = await fundService.getActiveFundAccount(site._id, site.organizationId);
  const period = account && (await fundService.getOpenPeriod(account._id));
  if (!period) throw ApiError.notFound(`No open fund period for ${siteName}`);

  const policy = await fundService.getEffectivePolicy(site.organizationId, site._id);
  const standardAmountPaise = policy?.defaultAllocationPaise || 0;

  const carryForwardEntry = await FundLedgerEntry.findOne({ fundPeriodId: period._id, type: 'CARRY_FORWARD' });
  const carriedForwardPaise = carryForwardEntry?.amountPaise || 0;
  const correctTopUpPaise = Math.min(standardAmountPaise, Math.max(0, standardAmountPaise - carriedForwardPaise));

  const existingTopUp = await FundLedgerEntry.findOne({ fundPeriodId: period._id, type: 'TOP_UP' });
  const before = await fundService.computeBalance(period._id);

  if ((existingTopUp?.amountPaise || 0) === correctTopUpPaise) {
    return res.json({ skipped: true, reason: 'ALREADY_CORRECT', balance: before });
  }

  if (correctTopUpPaise === 0) {
    if (existingTopUp) await FundLedgerEntry.deleteOne({ _id: existingTopUp._id });
  } else if (existingTopUp) {
    existingTopUp.amountPaise = correctTopUpPaise;
    await existingTopUp.save();
  } else {
    const actor = await User.findOne({ organizationId: site.organizationId, isActive: true, permissions: PERMISSIONS.MASTER_MANAGE });
    if (!actor) throw ApiError.badRequest('No active Master Admin to attribute this entry to', 'NO_SYSTEM_ACTOR');
    await FundLedgerEntry.create({
      organizationId: site.organizationId,
      siteId: site._id,
      fundAccountId: period.fundAccountId,
      fundPeriodId: period._id,
      type: 'TOP_UP',
      amountPaise: correctTopUpPaise,
      reason: `Monthly allocation — ${period.label} (reconciled)`,
      createdBy: actor._id,
    });
  }

  const balance = await fundService.computeBalance(period._id);
  res.json({ fixed: true, before, balance });
});

module.exports = {
  runMonthlyRolloverForAllOrganizations,
  runMonthEndSummaryForAllOrganizations,
  fixGardenCityOctoberTopUp,
  reconcileSiteTopUp,
};
