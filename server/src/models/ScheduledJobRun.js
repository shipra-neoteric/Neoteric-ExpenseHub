const { Schema, model } = require('mongoose');

// One row per (job, calendar day) it actually ran on — the unique index is
// the lock: whichever caller's insert wins gets to run the job, everyone
// else (a later request the same day, a second server instance) sees a
// duplicate-key error and skips. Lets a job be "triggered" opportunistically
// (e.g. on any incoming request) without ever double-firing in a day.
const scheduledJobRunSchema = new Schema(
  {
    jobName: { type: String, required: true },
    dateKey: { type: String, required: true }, // YYYY-MM-DD, server's local calendar day
  },
  { timestamps: true }
);

scheduledJobRunSchema.index({ jobName: 1, dateKey: 1 }, { unique: true });

module.exports = model('ScheduledJobRun', scheduledJobRunSchema);
