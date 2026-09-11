const { Schema, model } = require('mongoose');

// One row of a committed import file. Provides idempotency: re-committing the
// same file (same checksum) skips rows already recorded here instead of
// posting a duplicate ledger entry.
const importRecordSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    fileChecksum: { type: String, required: true },
    rowRef: { type: String, required: true }, // legacyRowRef from the file, or `row-<n>` fallback
    status: { type: String, enum: ['IMPORTED', 'REJECTED'], required: true },
    expenseId: { type: Schema.Types.ObjectId, ref: 'Expense', default: null },
    reason: { type: String, default: '' },
    rawRow: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

importRecordSchema.index({ organizationId: 1, fileChecksum: 1, rowRef: 1 }, { unique: true });

module.exports = model('ImportRecord', importRecordSchema);
