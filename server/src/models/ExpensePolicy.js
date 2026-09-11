const { Schema, model } = require('mongoose');
const { OVERDRAW_BEHAVIOR, PAYMENT_MODES } = require('../config/constants');

// siteId === null means the organization-wide default policy.
const expensePolicySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    defaultAllocationPaise: { type: Number, default: 0 },
    overdrawBehavior: { type: String, enum: Object.values(OVERDRAW_BEHAVIOR), default: OVERDRAW_BEHAVIOR.BLOCK },
    receiptRequiredThresholdPaise: { type: Number, default: null },
    backdateLimitDays: { type: Number, default: 7 },
    allowedPaymentModes: { type: [String], enum: PAYMENT_MODES, default: PAYMENT_MODES },
    approverUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    allowSelfApproval: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

expensePolicySchema.index({ organizationId: 1, siteId: 1 }, { unique: true });

module.exports = model('ExpensePolicy', expensePolicySchema);
