const { Schema, model } = require('mongoose');

const expenseAttachmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    expenseId: { type: Schema.Types.ObjectId, ref: 'Expense', required: true, index: true },
    storageKey: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    checksum: { type: String, required: true },
    scanStatus: { type: String, enum: ['SKIPPED', 'PENDING', 'CLEAN', 'INFECTED'], default: 'SKIPPED' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = model('ExpenseAttachment', expenseAttachmentSchema);
