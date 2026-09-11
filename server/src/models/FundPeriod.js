const { Schema, model } = require('mongoose');
const { FUND_PERIOD_STATUS } = require('../config/constants');

const fundPeriodSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    fundAccountId: { type: Schema.Types.ObjectId, ref: 'FundAccount', required: true, index: true },
    label: { type: String, required: true }, // e.g. "2026-08"
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    status: { type: String, enum: Object.values(FUND_PERIOD_STATUS), default: FUND_PERIOD_STATUS.OPEN },
    carryForwardFromPeriodId: { type: Schema.Types.ObjectId, ref: 'FundPeriod', default: null },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
    reopenedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reopenedAt: { type: Date },
    reconciliationNotes: { type: String, trim: true },
  },
  { timestamps: true }
);

fundPeriodSchema.index({ fundAccountId: 1, label: 1 }, { unique: true });
// Only one OPEN/REOPENED period per fund account at a time, enforced in service layer
// (partial unique index kept simple here; concurrency re-checked inside transactions).

module.exports = model('FundPeriod', fundPeriodSchema);
