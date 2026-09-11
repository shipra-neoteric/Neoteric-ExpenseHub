const { Schema, model } = require('mongoose');
const { RECEIPT_RULE } = require('../config/constants');

const expenseCategorySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    icon: { type: String, default: 'Receipt' }, // lucide-react icon name
    receiptRule: { type: String, enum: Object.values(RECEIPT_RULE), default: RECEIPT_RULE.NOT_REQUIRED },
    receiptThresholdPaise: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

expenseCategorySchema.index({ organizationId: 1, normalizedName: 1 }, { unique: true });
expenseCategorySchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = model('ExpenseCategory', expenseCategorySchema);
