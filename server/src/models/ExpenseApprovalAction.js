const { Schema, model } = require('mongoose');

// Workflow event timeline for a single expense (append-only).
const expenseApprovalActionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    expenseId: { type: Schema.Types.ObjectId, ref: 'Expense', required: true, index: true },
    action: {
      type: String,
      enum: ['CREATE_DRAFT', 'EDIT', 'SUBMIT', 'RESUBMIT', 'APPROVE', 'RETURN', 'REJECT', 'VOID', 'DELETE_DRAFT'],
      required: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, default: '' },
    fromStatus: { type: String },
    toStatus: { type: String },
  },
  { timestamps: true }
);

expenseApprovalActionSchema.index({ expenseId: 1, createdAt: 1 });

module.exports = model('ExpenseApprovalAction', expenseApprovalActionSchema);
