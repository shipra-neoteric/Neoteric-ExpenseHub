const { Schema, model } = require('mongoose');

const siteUserAssignmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    effectiveStart: { type: Date, default: Date.now },
    effectiveEnd: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

siteUserAssignmentSchema.index({ userId: 1, siteId: 1 }, { unique: true });

siteUserAssignmentSchema.methods.isEffectiveNow = function isEffectiveNow(now = new Date()) {
  if (!this.isActive) return false;
  if (this.effectiveStart && now < this.effectiveStart) return false;
  if (this.effectiveEnd && now > this.effectiveEnd) return false;
  return true;
};

module.exports = model('SiteUserAssignment', siteUserAssignmentSchema);
