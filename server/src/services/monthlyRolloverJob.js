const Organization = require('../models/Organization');
const User = require('../models/User');
const ScheduledJobRun = require('../models/ScheduledJobRun');
const fundService = require('./fundService');
const { PERMISSIONS } = require('../config/constants');

const JOB_NAME = 'MONTHLY_ROLLOVER';

function isFirstDayOfMonth(date) {
  return date.getDate() === 1;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

// No human is logged in for the scheduled trigger, so ledger/audit entries
// created by the rollover need some real User to attribute to. Using the
// org's own first active Master Admin keeps that attribution meaningful
// (an org's Master is the one who effectively configured the monthly
// amount that's being applied) rather than inventing a fake system user.
async function systemActorFor(organizationId) {
  return User.findOne({ organizationId, isActive: true, permissions: PERMISSIONS.MASTER_MANAGE });
}

// Shared by the HTTP route (manual/external-cron entry point) and the
// opportunistic in-app trigger below. rolloverDueSites is itself idempotent
// per site (a site already on the current month's label is left untouched),
// so calling this more than once in a day is harmless — the once-per-day
// lock in maybeRunOnRequest just avoids doing the redundant work.
async function runMonthlyRolloverForAllOrganizations() {
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
  return { report };
}

// Mirrors monthEndSummaryJob's approach: Render's free tier has no built-in
// scheduler, so instead of requiring an external cron, any incoming request
// on the month's first calendar day opportunistically fires the rollover in
// the background. The ScheduledJobRun unique index is the lock — only the
// first caller on a given day gets past it.
async function maybeRunOnRequest() {
  const now = new Date();
  if (!isFirstDayOfMonth(now)) return;
  try {
    await ScheduledJobRun.create({ jobName: JOB_NAME, dateKey: dateKey(now) });
  } catch (err) {
    if (err.code === 11000) return; // already ran today
    console.error('[monthlyRolloverJob] failed to acquire run lock', err.message);
    return;
  }
  try {
    const result = await runMonthlyRolloverForAllOrganizations();
    console.log('[monthlyRolloverJob] ran', JSON.stringify(result));
  } catch (err) {
    console.error('[monthlyRolloverJob] run failed', err.message);
  }
}

module.exports = { runMonthlyRolloverForAllOrganizations, maybeRunOnRequest, isFirstDayOfMonth };
