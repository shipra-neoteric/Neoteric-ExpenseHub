const { Schema, model } = require('mongoose');

// Global append-only audit trail across all financial/workflow mutations.
// Never store secrets or raw file bytes here, only metadata/safe diffs.
const auditEventSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    requestId: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

auditEventSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });

module.exports = model('AuditEvent', auditEventSchema);
