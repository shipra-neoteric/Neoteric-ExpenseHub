const { Schema, model } = require('mongoose');
const { LEDGER_ENTRY_TYPE } = require('../config/constants');

// Append-only. Never update/delete a posted entry; corrections are new entries
// (EXPENSE_REVERSAL, ADJUSTMENT). amountPaise is signed: positive increases
// available balance, negative decreases it.
const fundLedgerEntrySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    fundAccountId: { type: Schema.Types.ObjectId, ref: 'FundAccount', required: true, index: true },
    fundPeriodId: { type: Schema.Types.ObjectId, ref: 'FundPeriod', required: true, index: true },
    type: { type: String, enum: Object.values(LEDGER_ENTRY_TYPE), required: true },
    amountPaise: { type: Number, required: true },
    relatedExpenseId: { type: Schema.Types.ObjectId, ref: 'Expense', default: null },
    reason: { type: String, trim: true },
    // Proof of an actual real-world payment (e.g. a bank transfer
    // screenshot) for this entry — set when Master/Finance attaches one
    // while adding a top-up, so there's evidence the money was really sent
    // to the site, not just a system record.
    proofUrl: { type: String, default: null },
    proofPublicId: { type: String, default: null },
    // Who actually received the money (e.g. the site's front desk
    // executive) — free text since not every recipient is necessarily a
    // registered User, kept alongside the proof so there's a clear record of
    // both "paid to whom" and "evidence it was sent".
    paidToName: { type: String, trim: true, default: null },
    idempotencyKey: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    postedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

fundLedgerEntrySchema.index({ fundAccountId: 1, postedAt: 1 });
fundLedgerEntrySchema.index({ fundPeriodId: 1, postedAt: 1 });
fundLedgerEntrySchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = model('FundLedgerEntry', fundLedgerEntrySchema);
