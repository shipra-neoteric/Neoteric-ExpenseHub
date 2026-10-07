const Organization = require('../models/Organization');
const ScheduledJobRun = require('../models/ScheduledJobRun');
const fundService = require('./fundService');
const slackService = require('./slackService');
const env = require('../config/env');

const JOB_NAME = 'MONTH_END_SUMMARY';

function isLastDayOfMonth(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

// Shared by the external-cron HTTP route and the opportunistic in-app
// trigger: builds and sends every active organization's month-end summary.
// `force` (the manual/testing path) skips both the last-day-of-month gate
// and the once-per-day lock, so re-running it for a quick test never
// collides with the real automatic run.
async function runMonthEndSummaryForAllOrganizations({ now = new Date(), force = false } = {}) {
  if (!force && !isLastDayOfMonth(now)) {
    return { skipped: true, reason: 'NOT_LAST_DAY_OF_MONTH' };
  }
  if (!env.monthEndSummarySlackEmail) {
    return { skipped: true, reason: 'NO_RECIPIENT_CONFIGURED' };
  }

  const organizations = await Organization.find({ isActive: true }).lean();
  const report = [];
  for (const org of organizations) {
    const summary = await fundService.buildMonthEndSummary({ organizationId: org._id, now });
    const result = await slackService.sendMonthEndSummary({ summary, recipientEmail: env.monthEndSummarySlackEmail });
    report.push({ organization: org.name, summary, result });
  }
  return { report };
}

// Called on every incoming request (fire-and-forget, never awaited by the
// caller) so the summary goes out the first time anyone hits the app on the
// month's last calendar day — no external scheduler required. The
// ScheduledJobRun unique index is the lock: only the first caller on a given
// day gets past it, every other request that same day sees a duplicate-key
// error and returns immediately.
async function maybeRunOnRequest() {
  const now = new Date();
  if (!isLastDayOfMonth(now)) return;
  if (!env.monthEndSummarySlackEmail) return;
  try {
    await ScheduledJobRun.create({ jobName: JOB_NAME, dateKey: dateKey(now) });
  } catch (err) {
    if (err.code === 11000) return; // already ran today
    console.error('[monthEndSummaryJob] failed to acquire run lock', err.message);
    return;
  }
  try {
    const result = await runMonthEndSummaryForAllOrganizations({ now, force: true });
    console.log('[monthEndSummaryJob] ran', JSON.stringify(result));
  } catch (err) {
    console.error('[monthEndSummaryJob] run failed', err.message);
  }
}

module.exports = { runMonthEndSummaryForAllOrganizations, maybeRunOnRequest, isLastDayOfMonth };
