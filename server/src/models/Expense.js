const { Schema, model } = require('mongoose');
const { EXPENSE_STATUS, PAYMENT_MODES } = require('../config/constants');

const expenseSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    fundAccountId: { type: Schema.Types.ObjectId, ref: 'FundAccount', required: true, index: true },
    fundPeriodId: { type: Schema.Types.ObjectId, ref: 'FundPeriod', required: true, index: true },

    expenseNumber: { type: String, required: true },

    status: { type: String, enum: Object.values(EXPENSE_STATUS), default: EXPENSE_STATUS.DRAFT, index: true },

    expenseDate: { type: Date, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true, index: true },
    categorySnapshot: {
      name: { type: String, required: true },
      code: { type: String, required: true },
    },
    description: { type: String, required: true, trim: true },
    merchant: { type: String, trim: true, default: '' },
    amountPaise: { type: Number, required: true },
    paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
    paidByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, trim: true, default: '' },

    idempotencyKey: { type: String, default: null },
    duplicateOverrideReason: { type: String, default: null },

    ledgerEntryId: { type: Schema.Types.ObjectId, ref: 'FundLedgerEntry', default: null },
    reversalLedgerEntryId: { type: Schema.Types.ObjectId, ref: 'FundLedgerEntry', default: null },

    submittedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    returnedAt: { type: Date },
    returnReason: { type: String },
    rejectedAt: { type: Date },
    rejectReason: { type: String },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String },

    version: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

expenseSchema.index({ organizationId: 1, expenseNumber: 1 }, { unique: true });
expenseSchema.index({ siteId: 1, status: 1, expenseDate: -1 });
expenseSchema.index(
  { siteId: 1, createdBy: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
// Assists duplicate-warning lookups (same site/date/amount/merchant-description).
expenseSchema.index({ siteId: 1, expenseDate: 1, amountPaise: 1 });

module.exports = model('Expense', expenseSchema);
